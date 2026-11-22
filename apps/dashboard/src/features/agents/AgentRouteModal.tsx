import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, KeyRound, RotateCcw, Route } from 'lucide-react';
import { Modal } from '../../shared/common/Modal';
import { AgentInfo, getAgentLabel, humanizeLabel } from '../../types';
import {
  deleteAgentRoute,
  fetchAgentRoutes,
  fetchKeyVault,
  setAgentRoute,
} from '../../api';
import { KeyVaultItem } from '../../services/api/models';

interface AgentRouteModalProps {
  isOpen: boolean;
  agent: AgentInfo;
  onClose: () => void;
  onSaved?: () => void;
}

export const AgentRouteModal: React.FC<AgentRouteModalProps> = ({
  isOpen,
  agent,
  onClose,
  onSaved,
}) => {
  const [keys, setKeys] = useState<KeyVaultItem[]>([]);
  const [selectedKeyId, setSelectedKeyId] = useState('');
  const [model, setModel] = useState('');
  const [hasRoute, setHasRoute] = useState(false);
  const [staleRoute, setStaleRoute] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setFeedback(null);
    Promise.all([fetchAgentRoutes(), fetchKeyVault()])
      .then(([routes, vaultKeys]) => {
        if (cancelled) return;
        const current = routes.find((route) => route.agent_role === agent.role);
        const available = vaultKeys.filter((key) => key.is_active && Boolean(key.owner_user_id));
        setKeys(available);
        setHasRoute(Boolean(current));
        const currentUsable = Boolean(current && current.key_available !== false);
        setStaleRoute(Boolean(current && current.key_available === false));
        const initialKeyId = currentUsable
          ? current!.key_id
          : available.find((key) => key.is_default)?.key_id || available[0]?.key_id || '';
        setSelectedKeyId(initialKeyId);
        const keyProfile = available.find((key) => key.key_id === initialKeyId);
        setModel(
          currentUsable
            ? current!.model
            : keyProfile?.default_model || keyProfile?.preferred_model || '',
        );
      })
      .catch((err: Error) => {
        if (!cancelled) setFeedback({ text: err.message, type: 'error' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, agent.role]);

  const selectedKey = keys.find((key) => key.key_id === selectedKeyId);

  const handleKeyChange = (keyId: string) => {
    setSelectedKeyId(keyId);
    const keyProfile = keys.find((key) => key.key_id === keyId);
    if (keyProfile) {
      setModel(keyProfile.default_model || keyProfile.preferred_model || '');
    }
  };

  const handleSave = async () => {
    if (!selectedKeyId || !model.trim()) {
      setFeedback({ text: 'Selecione uma chave e indique o modelo.', type: 'error' });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      await setAgentRoute(agent.role, selectedKeyId, model.trim());
      const label = getAgentLabel(agent.role);
      setFeedback({ text: `Rota de ${label} salva para esta conta.`, type: 'success' });
      setHasRoute(true);
      setStaleRoute(false);
      onSaved?.();
    } catch (err: any) {
      setFeedback({ text: err.message || 'Erro ao salvar a rota.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await deleteAgentRoute(agent.role);
      setHasRoute(false);
      setStaleRoute(false);
      setFeedback({
        text: 'Rota removida. O especialista volta a usar o perfil global.',
        type: 'success',
      });
      onSaved?.();
    } catch (err: any) {
      setFeedback({ text: err.message || 'Erro ao remover a rota.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Rota de ${getAgentLabel(agent.role)}`}
      subtitle="Chave e modelo privados da sua conta para este especialista"
      icon={<Route size={18} color="var(--accent-light)" />}
      maxWidth="md"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={handleClear}
            disabled={saving || !hasRoute}
          >
            <RotateCcw size={14} />
            <span>Usar perfil global</span>
          </button>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              Fechar
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleSave}
              disabled={saving || loading || !selectedKeyId || !model.trim()}
            >
              <KeyRound size={14} />
              <span>{saving ? 'Salvando…' : 'Salvar Rota'}</span>
            </button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {feedback && (
          <div
            role={feedback.type === 'error' ? 'alert' : 'status'}
            className={`jarvis-callout ${
              feedback.type === 'success' ? 'jarvis-callout--success' : 'jarvis-callout--danger'
            }`}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            {feedback.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            <span>{feedback.text}</span>
          </div>
        )}

        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Esta configuração pertence apenas à sua conta. A chave precisa existir no Cofre de Chaves e o modelo deve ser
          suportado pelo provedor dessa chave.
        </p>

        {staleRoute && (
          <div role="status" className="jarvis-callout jarvis-callout--warning">
            A chave associada a esta rota já não está disponível. Escolha outra chave ou remova-a com “Usar perfil
            global”.
          </div>
        )}

        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
            Carregando chaves e rota atual…
          </div>
        ) : keys.length === 0 ? (
          <div role="status" className="jarvis-callout jarvis-callout--warning">
            Não há chaves ativas na sua conta. Adicione uma chave em Modelos → Cofre de Chaves e volte a esta
            configuração.
          </div>
        ) : (
          <>
            <div>
              <label className="user-profile-field-label" htmlFor="agent-route-key">
                Chave do cofre da conta
              </label>
              <select
                id="agent-route-key"
                value={selectedKeyId}
                onChange={(event) => handleKeyChange(event.target.value)}
                className="jarvis-select"
              >
                {keys.map((key) => (
                  <option key={key.key_id} value={key.key_id}>
                    {key.label || humanizeLabel(key.key_id)} · {(key.provider || key.provider_name || '').toUpperCase()}
                    {key.is_default ? ' · predefinida' : ''}
                  </option>
                ))}
              </select>
              {selectedKey && (
                <div style={{ marginTop: '6px', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  Chave: <code>{selectedKey.masked_key}</code> · Provedor:{' '}
                  {(selectedKey.provider || selectedKey.provider_name || '').toUpperCase()}
                </div>
              )}
            </div>

            <div>
              <label className="user-profile-field-label" htmlFor="agent-route-model">
                Modelo a usar com esta chave
              </label>
              <input
                id="agent-route-model"
                type="text"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="ex.: openai/gpt-oss-120b"
                className="jarvis-input"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}
              />
              <div style={{ marginTop: '6px', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Ao trocar de chave, o modelo predefinido dessa chave é preenchido automaticamente.
              </div>
            </div>

            {hasRoute && (
              <div style={{ fontSize: '0.76rem', color: '#4ade80', fontWeight: 500 }}>
                Esta conta já tem uma rota dedicada configurada para este especialista.
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};
