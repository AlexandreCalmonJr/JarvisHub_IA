import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Bell,
  Check,
  CheckCircle2,
  Cpu,
  Download,
  Laptop,
  Lock,
  Mic,
  QrCode,
  RefreshCw,
  Send,
  ShieldAlert,
  Smartphone,
  Terminal,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {
  CompanionHubState,
  PushBridgeConfig,
  VoiceBriefingResponse,
  decideRemoteCommand,
  enqueueRemoteCommand,
  fetchCompanionScript,
  fetchCompanionState,
  fetchPushConfig,
  fetchVoiceBriefing,
  regenerateCompanionPairing,
  sendTestPushNotification,
  updatePushConfig,
} from '../../services/api';
import { useAssistantIdentity } from '../../context/AssistantIdentityContext';
import { PageHeader } from '../../shared/layout/PageHeader';
import { PWAInstallButton } from '../../shared/pwa/PWAInstallButton';
import { useOfflineQueue, usePWAInstall } from '../../shared/pwa/usePWAInstall';
import { notify } from '../../shared/common/Toast';

type CompanionTab = 'companion' | 'voice' | 'push' | 'pwa';

interface CompanionHubViewProps {
  onOpenVoiceHud: () => void;
  onNavigate: (tab: string) => void;
}

export const CompanionHubView: React.FC<CompanionHubViewProps> = ({
  onOpenVoiceHud,
  onNavigate,
}) => {
  const { assistantName } = useAssistantIdentity();
  const { isInstalled, swReady } = usePWAInstall();
  const { isOnline, queue, syncing, addCommand, removeCommand, syncNow } = useOfflineQueue();

  const [activeTab, setActiveTab] = useState<CompanionTab>('companion');
  const [companionState, setCompanionState] = useState<CompanionHubState | null>(null);
  const [pushConfig, setPushConfig] = useState<PushBridgeConfig | null>(null);
  const [briefing, setBriefing] = useState<VoiceBriefingResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Remote command form
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [remoteCommandInput, setRemoteCommandInput] = useState('');
  const [sendingCmd, setSendingCmd] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [downloadingScript, setDownloadingScript] = useState(false);

  // Push form
  const [telegramChatId, setTelegramChatId] = useState('');
  const [telegramToken, setTelegramToken] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [pushBusy, setPushBusy] = useState(false);
  const [browserPushPerm, setBrowserPushPerm] = useState<string>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );

  // Offline queue manual entry
  const [offlineDraft, setOfflineDraft] = useState('');

  const loadAll = async () => {
    try {
      const [comp, push, brief] = await Promise.all([
        fetchCompanionState(),
        fetchPushConfig(),
        fetchVoiceBriefing(),
      ]);
      setCompanionState(comp);
      setSelectedDeviceId((curr) => curr || comp.devices[0]?.id || '');
      setPushConfig(push);
      setTelegramChatId(push.telegram_chat_id || '');
      setWebhookUrl(push.webhook_url || '');
      setBriefing(brief);
    } catch (err: any) {
      notify(err?.message || 'Falha ao carregar Central Voz & Companion.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    if (!companionState?.qr_payload) return;
    QRCode.toDataURL(companionState.qr_payload, {
      width: 184,
      margin: 2,
      color: { dark: '#0b0d12', light: '#f8fafc' },
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [companionState?.qr_payload]);

  const handleRegenerateQr = async () => {
    setPairingBusy(true);
    try {
      const next = await regenerateCompanionPairing();
      setCompanionState(next);
      notify(`Novo código de pareamento gerado: ${next.pairing_code}`, 'success');
    } catch (err: any) {
      notify(err?.message || 'Erro ao gerar novo QR Code.', 'error');
    } finally {
      setPairingBusy(false);
    }
  };

  const handleDownloadCompanionScript = async () => {
    setDownloadingScript(true);
    try {
      const device = companionState?.devices.find((d) => d.id === selectedDeviceId);
      const data = await fetchCompanionScript(device?.name || 'Notebook Principal');
      const blob = new Blob([data.script], { type: 'text/javascript;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename || 'jarvis-companion.mjs';
      a.click();
      URL.revokeObjectURL(url);
      notify('Script jarvis-companion.mjs baixado! Execute com: node jarvis-companion.mjs', 'success');
    } catch (err: any) {
      notify(err?.message || 'Erro ao exportar script do Companion.', 'error');
    } finally {
      setDownloadingScript(false);
    }
  };

  const handleSendRemoteCommand = async () => {
    const cmd = remoteCommandInput.trim();
    if (!cmd) return;
    if (!isOnline) {
      addCommand(cmd, 'companion');
      setRemoteCommandInput('');
      notify('Sem conexão: comando enfileirado na Fila Offline para envio automático.', 'warning');
      return;
    }
    setSendingCmd(true);
    try {
      const res = await enqueueRemoteCommand({
        device_id: selectedDeviceId || undefined,
        command: cmd,
        source: 'mobile_pwa',
      });
      setCompanionState(res.state);
      setRemoteCommandInput('');
      notify(
        res.command.status === 'pending_approval'
          ? 'Comando sensível enfileirado aguardando sua aprovação em 1 toque.'
          : 'Comando executado no Desktop Companion!',
        'success'
      );
    } catch (err: any) {
      notify(err?.message || 'Falha ao enviar comando remoto.', 'error');
    } finally {
      setSendingCmd(false);
    }
  };

  const handleDecideRemoteCommand = async (id: string, decision: 'approve' | 'reject') => {
    setDecidingId(id);
    try {
      const res = await decideRemoteCommand(id, decision);
      setCompanionState(res.state);
      notify(
        decision === 'approve'
          ? 'Comando remoto aprovado e executado no notebook!'
          : 'Comando remoto pausado e cancelado.',
        'success'
      );
    } catch (err: any) {
      notify(err?.message || 'Falha ao decidir comando remoto.', 'error');
    } finally {
      setDecidingId(null);
    }
  };

  const handleRequestBrowserPush = async () => {
    if (typeof Notification === 'undefined') {
      notify('Este navegador não suporta notificações Web Push.', 'warning');
      return;
    }
    const perm = await Notification.requestPermission();
    setBrowserPushPerm(perm);
    notify(
      perm === 'granted'
        ? 'Notificações Web Push autorizadas neste dispositivo!'
        : 'Permissão de notificação não concedida no navegador.',
      perm === 'granted' ? 'success' : 'warning'
    );
  };

  const handleSavePushConfig = async () => {
    if (!pushConfig) return;
    setPushBusy(true);
    try {
      const next = await updatePushConfig({
        web_push_enabled: pushConfig.web_push_enabled,
        telegram_enabled: pushConfig.telegram_enabled,
        telegram_chat_id: telegramChatId,
        telegram_bot_token: telegramToken.trim() || undefined,
        webhook_url: webhookUrl,
        channels: pushConfig.channels,
      });
      setPushConfig(next);
      setTelegramToken('');
      notify('Configurações de Push & Ponte Telegram salvas!', 'success');
    } catch (err: any) {
      notify(err?.message || 'Falha ao salvar canais de Push.', 'error');
    } finally {
      setPushBusy(false);
    }
  };

  const handleSendTestPush = async () => {
    setPushBusy(true);
    try {
      const res = await sendTestPushNotification({
        channel: 'task_completed',
        title: `${assistantName} AI Hub · Alerta em Tempo Real`,
        body: 'Push validado! Você será avisado sobre tarefas concluídas, recados e aprovações.',
      });
      setPushConfig(res.config);
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification(res.notification.title, {
            body: res.notification.body,
            icon: '/pwa-192x192.png',
          });
        } catch {
          // ignore headless notification limit
        }
      }
      notify(`Notificação entregue via ${res.notification.delivered_via.join(', ')}!`, 'success');
    } catch (err: any) {
      notify(err?.message || 'Erro ao enviar Push de teste.', 'error');
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <div className="jarvis-page-shell">
      <PageHeader
        icon={<Smartphone size={18} />}
        title="Voz, PWA & Desktop Companion"
        subtitle={`Experiência "Homem de Ferro" completa: comando de voz "Ei ${assistantName}", pareamento PC ↔ Celular via QR Code, Web Push/Telegram e aplicativo instalável offline.`}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" onClick={onOpenVoiceHud} className="btn btn-primary btn-sm">
              <Mic size={14} /> Abrir Voz &ldquo;Ei {assistantName}&rdquo;
            </button>
            <div className="jarvis-segmented" role="tablist" aria-label="Módulos Voz e Companion">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'companion'}
                onClick={() => setActiveTab('companion')}
                className={`jarvis-segmented-btn ${activeTab === 'companion' ? 'is-active' : ''}`}
              >
                Desktop Companion & QR
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'voice'}
                onClick={() => setActiveTab('voice')}
                className={`jarvis-segmented-btn ${activeTab === 'voice' ? 'is-active' : ''}`}
              >
                Voz & Fila Offline
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'push'}
                onClick={() => setActiveTab('push')}
                className={`jarvis-segmented-btn ${activeTab === 'push' ? 'is-active' : ''}`}
              >
                Push & Telegram
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'pwa'}
                onClick={() => setActiveTab('pwa')}
                className={`jarvis-segmented-btn ${activeTab === 'pwa' ? 'is-active' : ''}`}
              >
                PWA & Instalar App
              </button>
            </div>
          </div>
        }
      />

      {loading ? (
        <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Sincronizando Desktop Companion, canais Push e HUD de Voz…
        </div>
      ) : (
        <>
          {/* TAB 1: DESKTOP COMPANION & QR CODE */}
          {activeTab === 'companion' && companionState && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Dispositivos pareados */}
              <div style={s.devicesGrid}>
                {companionState.devices.map((dev) => (
                  <div key={dev.id} style={s.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={s.iconBox}>
                          <Laptop size={17} />
                        </div>
                        <div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {dev.name}
                          </div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                            {dev.owner} · {dev.platform}
                          </div>
                        </div>
                      </div>
                      <span
                        style={{
                          ...s.statusBadge,
                          color: dev.status === 'online' ? '#4ade80' : '#fbbf24',
                          backgroundColor:
                            dev.status === 'online' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                          borderColor:
                            dev.status === 'online' ? 'rgba(34, 197, 94, 0.35)' : 'rgba(245, 158, 11, 0.35)',
                        }}
                      >
                        {dev.status === 'online' ? 'Online' : 'Em espera'}
                      </span>
                    </div>

                    <div style={s.telemetryGrid}>
                      <div style={s.metricBox}>
                        <span style={s.metricLabel}>CPU</span>
                        <strong className="tabular-nums" style={s.metricValue}>{dev.cpu_percent}%</strong>
                      </div>
                      <div style={s.metricBox}>
                        <span style={s.metricLabel}>RAM ({dev.ram_total_gb} GB)</span>
                        <strong className="tabular-nums" style={s.metricValue}>{dev.ram_percent}%</strong>
                      </div>
                      <div style={s.metricBox}>
                        <span style={s.metricLabel}>Ollama Local</span>
                        <strong style={{ ...s.metricValue, color: dev.ollama_online ? '#4ade80' : 'var(--text-muted)' }}>
                          {dev.ollama_online ? 'Conectado' : 'Pausado'}
                        </strong>
                      </div>
                      <div style={s.metricBox}>
                        <span style={s.metricLabel}>Vault Lock</span>
                        <strong style={{ ...s.metricValue, color: dev.vault_locked ? '#fbbf24' : '#4ade80' }}>
                          {dev.vault_locked ? 'Travado' : 'Aberto'}
                        </strong>
                      </div>
                    </div>

                    <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                      <span><Cpu size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />{dev.gpu_name} ({dev.vram_gb} GB VRAM)</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-light)' }}>
                        {dev.ollama_models.join(', ') || 'Sem modelos locais'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* QR Pairing + Fila de Comandos Remotos */}
              <div style={s.twoColGrid}>
                {/* Pareamento QR + Export Script */}
                <section style={s.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <h2 style={s.sectionTitle}>
                      <QrCode size={16} color="var(--accent-color)" />
                      <span>Pareamento PC ↔ Celular & Pacote Companion</span>
                    </h2>
                    <button
                      type="button"
                      onClick={handleRegenerateQr}
                      disabled={pairingBusy}
                      className="btn btn-secondary btn-sm"
                    >
                      <RefreshCw size={13} /> {pairingBusy ? 'Gerando...' : 'Novo Código'}
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '18px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={s.qrBox}>
                      {qrDataUrl ? (
                        <img
                          src={qrDataUrl}
                          alt={`QR Code de pareamento ${companionState.pairing_code}`}
                          width={168}
                          height={168}
                          style={{ display: 'block', borderRadius: '8px' }}
                        />
                      ) : (
                        <div style={{ width: '168px', height: '168px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                          Gerando QR...
                        </div>
                      )}
                    </div>

                    <div style={{ flex: 1, minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div>
                        <div style={s.metricLabel}>Código de Pareamento Ativo</div>
                        <div className="tabular-nums" style={{ fontSize: '1.35rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-light)', letterSpacing: '0.08em', marginTop: '2px' }}>
                          {companionState.pairing_code}
                        </div>
                      </div>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                        Escaneie no celular PWA ou execute o agente leve em segundo plano no seu PC e no notebook da sua esposa para telemetria real, ponte Ollama e comandos remotos.
                      </p>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={handleDownloadCompanionScript}
                          disabled={downloadingScript}
                          className="btn btn-primary btn-sm"
                        >
                          <Download size={14} />
                          {downloadingScript ? 'Exportando...' : 'Baixar jarvis-companion.mjs'}
                        </button>
                      </div>
                      <code style={{ fontSize: '0.72rem', padding: '6px 9px', borderRadius: '6px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                        node jarvis-companion.mjs
                      </code>
                    </div>
                  </div>
                </section>

                {/* Comandos Remotos PC <-> Celular */}
                <section style={s.card}>
                  <h2 style={s.sectionTitle}>
                    <Terminal size={16} color="var(--accent-color)" />
                    <span>Fila de Comandos Remotos (Sob Matriz de Permissões)</span>
                  </h2>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <select
                      aria-label="Selecionar notebook de destino"
                      value={selectedDeviceId}
                      onChange={(e) => setSelectedDeviceId(e.target.value)}
                      style={{ ...s.input, width: '210px' }}
                    >
                      {companionState.devices.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={remoteCommandInput}
                      onChange={(e) => setRemoteCommandInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleSendRemoteCommand();
                        }
                      }}
                      placeholder="Ex.: Rodar testes no projeto ou checar modelos Ollama..."
                      aria-label="Comando remoto para o Desktop Companion"
                      style={{ ...s.input, flex: 1, minWidth: '180px' }}
                    />
                    <button
                      type="button"
                      onClick={handleSendRemoteCommand}
                      disabled={sendingCmd || !remoteCommandInput.trim()}
                      className="btn btn-primary btn-sm"
                    >
                      <Send size={13} /> Enviar
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                    {companionState.commands.map((cmd) => (
                      <div key={cmd.id} style={s.subCard}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                          <div>
                            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                              {cmd.command}
                            </div>
                            <div style={{ fontSize: '0.71rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {cmd.device_name} · origem: {cmd.source}
                            </div>
                          </div>
                          <span
                            style={{
                              ...s.statusBadge,
                              color:
                                cmd.status === 'executed'
                                  ? '#4ade80'
                                  : cmd.status === 'pending_approval'
                                    ? '#fbbf24'
                                    : '#f87171',
                              backgroundColor:
                                cmd.status === 'executed'
                                  ? 'rgba(34,197,94,0.12)'
                                  : cmd.status === 'pending_approval'
                                    ? 'rgba(245,158,11,0.12)'
                                    : 'rgba(239,68,68,0.12)',
                              borderColor:
                                cmd.status === 'executed'
                                  ? 'rgba(34,197,94,0.35)'
                                  : cmd.status === 'pending_approval'
                                    ? 'rgba(245,158,11,0.35)'
                                    : 'rgba(239,68,68,0.35)',
                            }}
                          >
                            {cmd.status === 'executed'
                              ? 'Executado'
                              : cmd.status === 'pending_approval'
                                ? 'Aguardando Aprovação'
                                : 'Cancelado'}
                          </span>
                        </div>

                        {cmd.output && (
                          <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: '#a7f3d0' }}>
                            {cmd.output}
                          </div>
                        )}

                        {cmd.status === 'pending_approval' && (
                          <div style={{ display: 'flex', gap: '8px', paddingTop: '6px', borderTop: '1px solid var(--border-subtle)' }}>
                            <button
                              type="button"
                              onClick={() => void handleDecideRemoteCommand(cmd.id, 'approve')}
                              disabled={decidingId === cmd.id}
                              className="btn btn-success btn-sm"
                              style={{ padding: '4px 10px', fontSize: '0.74rem' }}
                            >
                              <Check size={13} /> Aprovar & Executar
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDecideRemoteCommand(cmd.id, 'reject')}
                              disabled={decidingId === cmd.id}
                              className="btn btn-danger btn-sm"
                              style={{ padding: '4px 10px', fontSize: '0.74rem' }}
                            >
                              <X size={13} /> Pausar
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          )}

          {/* TAB 2: VOZ "EI [NOME]" & FILA OFFLINE */}
          {activeTab === 'voice' && (
            <div style={s.twoColGrid}>
              <section style={s.card}>
                <h2 style={s.sectionTitle}>
                  <Mic size={16} color="var(--accent-color)" />
                  <span>Ativação Dinâmica &ldquo;Ei {assistantName}&rdquo; & Briefing Diário</span>
                </h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  Acione o HUD animado com sinal sonoro (chime), escuta por voz, saudação contextual, prática de inglês falado e envio de fotos da câmera ou PDFs direto pelo celular.
                </p>

                {briefing && (
                  <div style={{ ...s.subCard, borderColor: 'var(--border-accent)', backgroundColor: 'rgba(249, 115, 22, 0.06)' }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {briefing.greeting}
                    </div>
                    <p style={{ fontSize: '0.79rem', color: 'var(--text-secondary)', margin: '4px 0 0', lineHeight: 1.5 }}>
                      {briefing.briefing_line}
                    </p>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button type="button" onClick={onOpenVoiceHud} className="btn btn-primary btn-sm">
                    <Mic size={14} /> Iniciar Sessão de Voz &ldquo;Ei {assistantName}&rdquo;
                  </button>
                </div>
              </section>

              <section style={s.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <h2 style={s.sectionTitle}>
                    {isOnline ? <Wifi size={16} color="#4ade80" /> : <WifiOff size={16} color="#fbbf24" />}
                    <span>Fila Offline do PWA ({queue.length})</span>
                  </h2>
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await syncNow();
                      notify(
                        res.synced > 0
                          ? `${res.synced} comando(s) sincronizado(s) com o servidor!`
                          : 'Nenhum comando pendente na fila offline.',
                        'success'
                      );
                      void loadAll();
                    }}
                    disabled={syncing || queue.length === 0}
                    className="btn btn-secondary btn-sm"
                  >
                    <RefreshCw size={13} /> {syncing ? 'Sincronizando...' : 'Sincronizar Agora'}
                  </button>
                </div>

                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
                  Quando o celular ficar sem sinal, grave comandos aqui ou no Modo Voz — assim que a conexão voltar, o PWA dispara tudo automaticamente para o Desktop Companion.
                </p>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={offlineDraft}
                    onChange={(e) => setOfflineDraft(e.target.value)}
                    placeholder="Gravar comando na fila offline (ex.: Gerar resumo financeiro)..."
                    aria-label="Comando para fila offline"
                    style={{ ...s.input, flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!offlineDraft.trim()) return;
                      addCommand(offlineDraft.trim(), 'companion');
                      setOfflineDraft('');
                      notify('Comando gravado na Fila Offline do dispositivo.', 'success');
                    }}
                    disabled={!offlineDraft.trim()}
                    className="btn btn-secondary btn-sm"
                  >
                    Gravar na Fila
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {queue.length === 0 ? (
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '14px', textAlign: 'center', border: '1px dashed var(--border-color)', borderRadius: '8px' }}>
                      Fila offline vazia — tudo sincronizado em tempo real.
                    </div>
                  ) : (
                    queue.map((item) => (
                      <div key={item.id} style={{ ...s.subCard, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{item.text}</div>
                          <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                            destino: {item.target} · {new Date(item.createdAt).toLocaleTimeString('pt-BR')}
                          </div>
                        </div>
                        <button type="button" onClick={() => removeCommand(item.id)} className="btn btn-ghost btn-icon-sm" aria-label="Remover item da fila">
                          <X size={13} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          )}

          {/* TAB 3: PUSH & TELEGRAM */}
          {activeTab === 'push' && pushConfig && (
            <div style={s.twoColGrid}>
              <section style={s.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <h2 style={s.sectionTitle}>
                    <Bell size={16} color="var(--accent-color)" />
                    <span>Canais Web Push & Ponte Telegram / Webhook</span>
                  </h2>
                  <button type="button" onClick={handleRequestBrowserPush} className="btn btn-secondary btn-sm">
                    {browserPushPerm === 'granted' ? 'Web Push Autorizado' : 'Autorizar Push no Navegador'}
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {(
                    [
                      ['task_completed', 'Tarefa ou fluxo concluído'],
                      ['assistant_message', 'Recado João ↔ Maria'],
                      ['sentinel_alert', 'Incidente Kira Sentinela'],
                      ['approval_required', 'Aprovação pendente'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} style={s.checkRow}>
                      <input
                        type="checkbox"
                        checked={Boolean(pushConfig.channels[key])}
                        onChange={(e) =>
                          setPushConfig((prev) =>
                            prev
                              ? { ...prev, channels: { ...prev.channels, [key]: e.target.checked } }
                              : prev
                          )
                        }
                        style={{ accentColor: '#f97316', width: '15px', height: '15px' }}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
                  <label style={s.checkRow}>
                    <input
                      type="checkbox"
                      checked={pushConfig.telegram_enabled}
                      onChange={(e) =>
                        setPushConfig((prev) => (prev ? { ...prev, telegram_enabled: e.target.checked } : prev))
                      }
                      style={{ accentColor: '#f97316', width: '15px', height: '15px' }}
                    />
                    <span style={{ fontWeight: 600 }}>Ativar Ponte Telegram para alertas no celular</span>
                  </label>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={s.metricLabel}>Telegram Chat ID</label>
                      <input
                        type="text"
                        value={telegramChatId}
                        onChange={(e) => setTelegramChatId(e.target.value)}
                        placeholder="ex.: 582910442"
                        style={{ ...s.input, marginTop: '4px', fontFamily: 'var(--font-mono)' }}
                      />
                    </div>
                    <div>
                      <label style={s.metricLabel}>Bot Token {pushConfig.telegram_bot_masked ? `(${pushConfig.telegram_bot_masked})` : ''}</label>
                      <input
                        type="password"
                        value={telegramToken}
                        onChange={(e) => setTelegramToken(e.target.value)}
                        placeholder="Opcional · criptografado no servidor"
                        style={{ ...s.input, marginTop: '4px', fontFamily: 'var(--font-mono)' }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={s.metricLabel}>Webhook Externo (Opcional — n8n, Discord, Slack)</label>
                    <input
                      type="url"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://hooks.exemplo.com/jarvis"
                      style={{ ...s.input, marginTop: '4px', fontFamily: 'var(--font-mono)' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button type="button" onClick={handleSavePushConfig} disabled={pushBusy} className="btn btn-primary btn-sm">
                    Salvar Canais
                  </button>
                  <button type="button" onClick={handleSendTestPush} disabled={pushBusy} className="btn btn-secondary btn-sm">
                    <Bell size={13} /> Enviar Push de Teste
                  </button>
                </div>
              </section>

              <section style={s.card}>
                <h2 style={s.sectionTitle}>
                  <CheckCircle2 size={16} color="#4ade80" />
                  <span>Histórico de Notificações Entregues ({pushConfig.recent_notifications.length})</span>
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '360px', overflowY: 'auto' }}>
                  {pushConfig.recent_notifications.map((n) => (
                    <div key={n.id} style={s.subCard}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                        <strong style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>{n.title}</strong>
                        <span className="tabular-nums" style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                          {new Date(n.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.77rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>{n.body}</p>
                      <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-light)' }}>
                        Entregue via: {n.delivered_via.join(' · ')}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {/* TAB 4: PWA & ADMINISTRAÇÃO MOBILE */}
          {activeTab === 'pwa' && (
            <div style={s.twoColGrid}>
              <section style={s.card}>
                <h2 style={s.sectionTitle}>
                  <Smartphone size={16} color="var(--accent-color)" />
                  <span>Aplicativo Instalável (PWA) & Conformidade Mobile</span>
                </h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                  Instale o JARVIS AI Hub na tela inicial do Android, iPhone ou Desktop para abrir em modo tela cheia (standalone), com cache offline e atalhos de voz.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {[
                    { label: 'Web App Manifest', status: 'Ativo (Standalone)', ok: true },
                    { label: 'Service Worker Cache', status: swReady ? 'Registrado' : 'Pronto (AutoUpdate)', ok: true },
                    { label: 'Ícones PNG 192/512 + Maskable', status: 'Conformidade Total', ok: true },
                    { label: 'iOS Apple Touch Icon (180px)', status: isInstalled ? 'Instalado' : 'Pronto p/ Safari', ok: true },
                  ].map((item) => (
                    <div key={item.label} style={s.metricBox}>
                      <span style={s.metricLabel}>{item.label}</span>
                      <strong style={{ ...s.metricValue, fontSize: '0.8rem', color: item.ok ? '#4ade80' : '#fbbf24' }}>
                        {item.status}
                      </strong>
                    </div>
                  ))}
                </div>

                <div>
                  <PWAInstallButton showFallbackInfo />
                </div>
              </section>

              <section style={s.card}>
                <h2 style={s.sectionTitle}>
                  <ShieldAlert size={16} color="var(--accent-color)" />
                  <span>Administração Mobile em 1 Toque</span>
                </h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                  Atalhos rápidos desenhados para uso no celular: revise aprovações pendentes, trave o Vault Lock ou acione o Kill Switch instantaneamente.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button type="button" onClick={() => onNavigate('approvals')} className="btn btn-secondary btn-sm" style={{ justifyContent: 'space-between' }}>
                    <span>Abrir Central de Aprovações Pendentes</span>
                    <Check size={14} />
                  </button>
                  <button type="button" onClick={() => onNavigate('security')} className="btn btn-secondary btn-sm" style={{ justifyContent: 'space-between' }}>
                    <span>Abrir Kira Sentinela, Vault Lock & Kill Switch</span>
                    <Lock size={14} />
                  </button>
                  <button type="button" onClick={() => onNavigate('office')} className="btn btn-secondary btn-sm" style={{ justifyContent: 'space-between' }}>
                    <span>Monitorar Escritório Vivo (Habbo)</span>
                    <Laptop size={14} />
                  </button>
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const s: Record<string, React.CSSProperties> = {
  devicesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
    gap: '14px',
  },
  twoColGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))',
    gap: '16px',
    alignItems: 'start',
  },
  card: {
    borderRadius: '12px',
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-secondary)',
    padding: '16px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    minWidth: 0,
  },
  subCard: {
    borderRadius: '10px',
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-primary)',
    padding: '11px 13px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    minWidth: 0,
  },
  iconBox: {
    width: '36px',
    height: '36px',
    borderRadius: '9px',
    backgroundColor: 'var(--accent-soft)',
    border: '1px solid var(--border-accent)',
    color: 'var(--accent-light)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  statusBadge: {
    fontSize: '0.68rem',
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    textTransform: 'uppercase',
    padding: '3px 8px',
    borderRadius: '6px',
    border: '1px solid',
    flexShrink: 0,
  },
  telemetryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 110px), 1fr))',
    gap: '8px',
  },
  metricBox: {
    padding: '9px 10px',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-primary)',
    border: '1px solid var(--border-subtle)',
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  metricLabel: {
    fontSize: '0.68rem',
    fontFamily: 'var(--font-mono)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--text-muted)',
  },
  metricValue: {
    fontSize: '0.92rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  sectionTitle: {
    fontSize: '0.94rem',
    fontWeight: 700,
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  qrBox: {
    padding: '10px',
    borderRadius: '12px',
    backgroundColor: '#f8fafc',
    border: '2px solid var(--border-accent)',
    flexShrink: 0,
  },
  input: {
    width: '100%',
    padding: '8px 11px',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-input)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    fontSize: '0.8rem',
    outline: 'none',
  },
  checkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '0.8rem',
    color: 'var(--text-primary)',
    cursor: 'pointer',
  },
};
