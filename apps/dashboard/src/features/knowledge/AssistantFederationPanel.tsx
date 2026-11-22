import React, { useCallback, useEffect, useState } from 'react';
import {
  Send,
  Share2,
  Check,
  RefreshCw,
  Home,
  Bot,
  Workflow,
  BookOpen,
  MessageSquare,
} from 'lucide-react';
import {
  fetchAssistantFederation,
  sendAssistantRelayMessage,
  shareAssetWithPeer,
  acceptSharedAsset,
  togglePeerSharedMemory,
  subscribeJarvisRealtime,
} from '../../services/api/brain';
import type { AssistantPeer, AssistantRelayMessage, SharedAssetTransfer } from '../../services/secondBrain';
import { useAssistantIdentity } from '../../context/AssistantIdentityContext';
import { notify } from '../../shared/common/Toast';

const QUICK_SHARE_ITEMS: Array<{
  kind: 'agent' | 'workflow' | 'context_set';
  asset_id: string;
  asset_name: string;
  summary: string;
}> = [
  {
    kind: 'agent',
    asset_id: 'agent-clara-rotina',
    asset_name: 'Clara · Planejamento & Rotina',
    summary: 'Especialista em organização de metas, listas semanais e cronogramas claros.',
  },
  {
    kind: 'workflow',
    asset_id: 'wf-viagem-familia',
    asset_name: 'Fluxo: Roteiro & Checklist de Viagem',
    summary: 'Pesquisa destinos, compara voos e gera roteiro dia a dia salvo na Memória da Casa.',
  },
  {
    kind: 'context_set',
    asset_id: 'cs-identidade-casa',
    asset_name: 'Context Set: Preferências & Documentos da Casa',
    summary: 'Regras de calendário, telefones úteis e preferências familiares prontas para consulta.',
  },
];

export const AssistantFederationPanel: React.FC = () => {
  const { assistantName } = useAssistantIdentity();
  const [peers, setPeers] = useState<AssistantPeer[]>([]);
  const [messages, setMessages] = useState<AssistantRelayMessage[]>([]);
  const [transfers, setTransfers] = useState<SharedAssetTransfer[]>([]);
  const [householdCount, setHouseholdCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeOnline, setRealtimeOnline] = useState(false);

  const [targetPeerId, setTargetPeerId] = useState('peer-casa-maria');
  const [messageText, setMessageText] = useState('');
  const [saveToHousehold, setSaveToHousehold] = useState(true);
  const [sending, setSending] = useState(false);

  const [sharingAssetId, setSharingAssetId] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const loadFederation = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAssistantFederation();
      setPeers(data.peers || []);
      setMessages(data.messages || []);
      setTransfers(data.shared_assets || []);
      setHouseholdCount(data.household_memories_count || 0);
      setError(null);
      if (data.peers?.length && !data.peers.some((p) => p.id === targetPeerId)) {
        const remote = data.peers.find((p) => p.id !== 'peer-principal') || data.peers[0];
        if (remote) setTargetPeerId(remote.id);
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar assistentes conectados.');
    } finally {
      setLoading(false);
    }
  }, [targetPeerId]);

  useEffect(() => {
    loadFederation();
  }, [loadFederation]);

  useEffect(() => {
    const unsubscribe = subscribeJarvisRealtime((event) => {
      if (event.type === 'connected') {
        setRealtimeOnline(true);
      } else if (
        event.type === 'assistant_message' ||
        event.type === 'shared_asset_received' ||
        event.type === 'brain_memory_updated'
      ) {
        loadFederation();
      }
    });
    return unsubscribe;
  }, [loadFederation]);

  const remotePeers = peers.filter((p) => p.id !== 'peer-principal');
  const selectedPeer = remotePeers.find((p) => p.id === targetPeerId) || remotePeers[0] || peers[0];

  const handleSendRelay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !selectedPeer) return;
    setSending(true);
    try {
      const res = await sendAssistantRelayMessage({
        from_assistant: assistantName || 'JARVIS',
        to_peer_id: selectedPeer.id,
        content: messageText.trim(),
        save_to_household_brain: saveToHousehold,
      });
      setMessageText('');
      notify(
        res.memory
          ? `Recado enviado para ${selectedPeer.assistant_name} e gravado na Memória da Casa.`
          : `Recado entregue para ${selectedPeer.assistant_name}.`,
        'success'
      );
      await loadFederation();
    } catch (err: any) {
      notify(err?.message || 'Erro ao enviar recado entre assistentes.', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleTogglePeerSync = async (peer: AssistantPeer) => {
    try {
      await togglePeerSharedMemory(peer.id, !peer.shared_memory_enabled);
      notify(
        !peer.shared_memory_enabled
          ? `Memória Compartilhada da Casa ativada para ${peer.assistant_name}.`
          : `Sincronização da Casa pausada para ${peer.assistant_name}.`,
        'info'
      );
      await loadFederation();
    } catch (err: any) {
      notify(err?.message || 'Erro ao atualizar sincronização.', 'error');
    }
  };

  const handleShareQuickItem = async (item: (typeof QUICK_SHARE_ITEMS)[number]) => {
    if (!selectedPeer) return;
    setSharingAssetId(item.asset_id);
    try {
      await shareAssetWithPeer({
        kind: item.kind,
        asset_id: item.asset_id,
        asset_name: item.asset_name,
        summary: item.summary,
        from_assistant: assistantName || 'JARVIS',
        to_peer_id: selectedPeer.id,
      });
      notify(`'${item.asset_name}' compartilhado com ${selectedPeer.assistant_name} em 1 clique.`, 'success');
      await loadFederation();
    } catch (err: any) {
      notify(err?.message || 'Falha ao compartilhar item.', 'error');
    } finally {
      setSharingAssetId(null);
    }
  };

  const handleAcceptTransfer = async (transfer: SharedAssetTransfer) => {
    setAcceptingId(transfer.id);
    try {
      const res = await acceptSharedAsset(transfer.id);
      notify(`'${res.installed_name}' aceito e instalado na sua conta.`, 'success');
      await loadFederation();
    } catch (err: any) {
      notify(err?.message || 'Erro ao aceitar compartilhamento.', 'error');
    } finally {
      setAcceptingId(null);
    }
  };

  return (
    <div data-testid="assistant-federation-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Summary Header Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '14px 16px',
          borderRadius: '12px',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Assistentes Conectados da Casa ({assistantName} ↔ Maria)
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
            <span className="jarvis-tabular">{peers.length} assistentes pareados</span>
            <span aria-hidden="true">·</span>
            <span className="jarvis-tabular">{householdCount} memórias compartilhadas da casa</span>
            <span aria-hidden="true">·</span>
            <span style={{ color: realtimeOnline ? '#4ade80' : 'var(--text-muted)' }}>
              {realtimeOnline ? 'Canal WebSocket em tempo real ativo' : 'Sincronização pronta'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={loadFederation}
          className="btn btn-ghost btn-sm"
          aria-label="Atualizar assistentes conectados"
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          <span>Atualizar</span>
        </button>
      </div>

      {error && (
        <div role="alert" className="jarvis-callout jarvis-callout--danger">
          {error}
        </div>
      )}

      {/* Connected Peers Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '14px',
        }}
      >
        {peers.map((peer) => (
          <div
            key={peer.id}
            style={{
              padding: '16px',
              borderRadius: '12px',
              backgroundColor: 'var(--bg-secondary)',
              border:
                selectedPeer?.id === peer.id
                  ? '1px solid var(--border-accent)'
                  : '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {peer.id === 'peer-principal' ? assistantName : peer.assistant_name}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {peer.owner_name} · {peer.device_label}
                </div>
              </div>
              <span
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  color: peer.status === 'online' ? '#4ade80' : 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                }}
              >
                {peer.status === 'online' ? 'Online' : 'Em espera'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <Home size={12} color="#38bdf8" />
                <span>Memória da Casa</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={peer.shared_memory_enabled}
                onClick={() => handleTogglePeerSync(peer)}
                className="btn btn-ghost btn-xs"
                style={{
                  color: peer.shared_memory_enabled ? '#4ade80' : 'var(--text-muted)',
                  fontWeight: 600,
                }}
              >
                {peer.shared_memory_enabled ? 'Sincronizada' : 'Pausada'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Two-Column Workspace: Left = Relay Messaging, Right = 1-Click Sharing & Inbox */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '16px',
          alignItems: 'start',
        }}
      >
        {/* Left: Live Relay Thread & Composer */}
        <section
          aria-label="Canal de recados entre assistentes"
          style={{
            borderRadius: '12px',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '14px 18px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MessageSquare size={15} color="var(--accent-color)" />
              <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Recados entre Assistentes
              </h3>
            </div>
            <span className="jarvis-tabular" style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              {messages.length} mensagens
            </span>
          </div>

          <div
            data-testid="assistant-relay-feed"
            style={{
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              maxHeight: '360px',
              overflowY: 'auto',
            }}
          >
            {messages.length === 0 ? (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
                Nenhum recado trocado ainda. Envie um aviso para {selectedPeer?.assistant_name || 'Maria'}.
              </div>
            ) : (
              messages.map((msg) => {
                const isLocal = msg.from_peer_id === 'peer-principal';
                const time = new Date(msg.created_at).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                return (
                  <div
                    key={msg.id}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '10px',
                      backgroundColor: isLocal ? 'var(--bg-primary)' : 'var(--bg-tertiary, var(--bg-primary))',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '5px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        fontSize: '0.73rem',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <span style={{ fontWeight: 600, color: isLocal ? 'var(--accent-light)' : '#38bdf8' }}>
                        {msg.from_assistant} → {msg.to_assistant}
                      </span>
                      <span className="jarvis-tabular">
                        {msg.saved_to_household_brain ? 'Salvo na Casa · ' : ''}
                        {time}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.83rem', lineHeight: 1.5, color: 'var(--text-primary)' }}>
                      {msg.content}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          <form
            onSubmit={handleSendRelay}
            style={{
              padding: '14px 18px',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label htmlFor="relay-target-peer" style={{ fontSize: '0.76rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                Destinatário:
              </label>
              <select
                id="relay-target-peer"
                value={selectedPeer?.id || ''}
                onChange={(e) => setTargetPeerId(e.target.value)}
                className="jarvis-input"
                style={{ height: '32px', fontSize: '0.8rem', padding: '0 8px' }}
              >
                {(remotePeers.length > 0 ? remotePeers : peers).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.assistant_name} ({p.owner_name})
                  </option>
                ))}
              </select>
            </div>

            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder={`Ex.: "${selectedPeer?.assistant_name || 'Maria'}, avisa que fechei o orçamento da viagem e já deixei salvo na memória da casa."`}
              aria-label="Mensagem para outro assistente"
              rows={2}
              className="jarvis-input"
              style={{ resize: 'vertical', minHeight: '64px' }}
            />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '0.77rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={saveToHousehold}
                  onChange={(e) => setSaveToHousehold(e.target.checked)}
                />
                <span>Salvar na Memória Compartilhada da Casa</span>
              </label>

              <button
                type="submit"
                disabled={sending || !messageText.trim()}
                className="btn btn-primary btn-sm"
                style={{ whiteSpace: 'nowrap' }}
              >
                <Send size={13} />
                <span>{sending ? 'Enviando...' : 'Enviar recado'}</span>
              </button>
            </div>
          </form>
        </section>

        {/* Right: 1-Click Share & Incoming Shared Assets */}
        <section
          aria-label="Compartilhamento de agentes e fluxos"
          style={{
            borderRadius: '12px',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '14px 18px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Share2 size={15} color="var(--accent-color)" />
              <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Compartilhar Agentes & Fluxos (1 Clique)
              </h3>
            </div>
          </div>

          {/* Pending / Received Transfers */}
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Transferências da Casa ({transfers.length})
            </div>

            {transfers.length === 0 ? (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Nenhum item compartilhado ainda.
              </div>
            ) : (
              transfers.map((tr) => (
                <div
                  key={tr.id}
                  data-testid={`shared-asset-${tr.id}`}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '9px',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '10px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ minWidth: 0, flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {tr.asset_name}
                    </div>
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                      {tr.from_assistant} → {tr.to_assistant} · {tr.kind === 'agent' ? 'Agente' : tr.kind === 'workflow' ? 'Fluxo' : 'Context Set'}
                    </div>
                    <div style={{ fontSize: '0.77rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                      {tr.summary}
                    </div>
                  </div>

                  {tr.status === 'accepted' ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '0.76rem',
                        fontWeight: 600,
                        color: '#4ade80',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <Check size={13} /> Instalado
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={acceptingId === tr.id}
                      onClick={() => handleAcceptTransfer(tr)}
                      className="btn btn-primary btn-xs"
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      <Check size={12} />
                      <span>{acceptingId === tr.id ? 'Instalando...' : 'Aceitar e Instalar'}</span>
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Quick 1-click Share Palette */}
          <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Enviar agora para {selectedPeer?.assistant_name || 'Maria'}
            </div>

            {QUICK_SHARE_ITEMS.map((item) => (
              <div
                key={item.asset_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  padding: '9px 0',
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '9px', minWidth: 0, flex: 1 }}>
                  <span style={{ color: 'var(--accent-color)', marginTop: '2px', flexShrink: 0 }}>
                    {item.kind === 'agent' ? <Bot size={15} /> : item.kind === 'workflow' ? <Workflow size={15} /> : <BookOpen size={15} />}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {item.asset_name}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                      {item.summary}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={sharingAssetId === item.asset_id}
                  onClick={() => handleShareQuickItem(item)}
                  className="btn btn-secondary btn-xs"
                  style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  <Share2 size={12} />
                  <span>{sharingAssetId === item.asset_id ? 'Enviando...' : 'Enviar'}</span>
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
