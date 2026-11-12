import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, KeyRound, RotateCcw, Route } from 'lucide-react';
import { Modal } from '../common/Modal';
import { AgentInfo, getAgentLabel } from '../../types';
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

/** Configura a chave + modelo que a conta autenticada usa num especialista. */
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
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(
    null
  );

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setFeedback(null);
    Promise.all([fetchAgentRoutes(), fetchKeyVault()])
      .then(([routes, vaultKeys]) => {
        if (cancelled) return;
        const current = routes.find((route) => route.agent_role === agent.role);
        const available = vaultKeys.filter(
          (key) => key.is_active && Boolean(key.owner_user_id)
        );
        setKeys(available);
        setHasRoute(Boolean(current));
        const currentUsable = Boolean(current && current.key_available !== false);
        setStaleRoute(Boolean(current && current.key_available === false));
        const initialKeyId = currentUsable
          ? current!.key_id
          : available.find((key) => key.is_default)?.key_id ||
            available[0]?.key_id ||
            '';
        setSelectedKeyId(initialKeyId);
        const keyProfile = available.find((key) => key.key_id === initialKeyId);
        setModel(
          currentUsable
            ? current!.model
            : keyProfile?.default_model || keyProfile?.preferred_model || ''
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
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Route size={20} color="var(--accent-color)" />
          <span>Rota de {getAgentLabel(agent.role)}</span>
        </div>
      }
      subtitle="Chave e modelo privados da sua conta para este especialista"
      maxWidth="md"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleClear}
            disabled={saving || !hasRoute}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}
          >
            <RotateCcw size={14} />
            Usar perfil global
          </button>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Fechar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || loading || !selectedKeyId || !model.trim()}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <KeyRound size={15} />
              {saving ? 'Salvando...' : 'Salvar Rota'}
            </button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {feedback && (
          <div
            role={feedback.type === 'error' ? 'alert' : 'status'}
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.84rem',
              backgroundColor:
                feedback.type === 'success'
                  ? 'rgba(16, 185, 129, 0.12)'
                  : 'rgba(239, 68, 68, 0.12)',
              border: `1px solid ${
                feedback.type === 'success'
                  ? 'rgba(16, 185, 129, 0.3)'
                  : 'rgba(239, 68, 68, 0.3)'
              }`,
              color: feedback.type === 'success' ? '#34d399' : '#f87171',
            }}
          >
            {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {feedback.text}
          </div>
        )}

        <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Esta configuração pertence apenas à sua conta. A chave tem de existir no seu
          Cofre de Chaves e o modelo tem de ser suportado pelo provedor dessa chave.
        </p>

        {staleRoute && (
          <div
            role="status"
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              backgroundColor: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              color: 'var(--text-secondary)',
              fontSize: '0.82rem',
              lineHeight: 1.5,
            }}
          >
            A chave associada a esta rota já não está disponível. Escolha outra chave para
            substituir a rota ou remova-a com “Usar perfil global”.
          </div>
        )}

        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            A carregar chaves e rota atual...
          </div>
        ) : keys.length === 0 ? (
          <div
            role="status"
            style={{
              padding: '14px',
              borderRadius: '8px',
              backgroundColor: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              color: 'var(--text-secondary)',
              fontSize: '0.83rem',
            }}
          >
            Não há chaves ativas na sua conta. Adicione uma chave em Modelos → Cofre de
            Chaves e volte a esta configuração.
          </div>
        ) : (
          <>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  marginBottom: '6px',
                  color: 'var(--text-primary)',
                }}
              >
                Chave do cofre da conta
              </label>
              <select
                value={selectedKeyId}
                onChange={(event) => handleKeyChange(event.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '0.88rem',
                  outline: 'none',
                }}
              >
                {keys.map((key) => (
                  <option key={key.key_id} value={key.key_id}>
                    {key.label || key.key_id} · {(key.provider || key.provider_name || '').toUpperCase()}
                    {key.is_default ? ' · predefinida' : ''}
                  </option>
                ))}
              </select>
              {selectedKey && (
                <div style={{ marginTop: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Chave: {selectedKey.masked_key} · Provedor:{' '}
                  {(selectedKey.provider || selectedKey.provider_name || '').toUpperCase()}
                </div>
              )}
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  marginBottom: '6px',
                  color: 'var(--text-primary)',
                }}
              >
                Modelo a usar com esta chave
              </label>
              <input
                type="text"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="ex.: openai/gpt-oss-120b"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '0.88rem',
                  outline: 'none',
                  fontFamily: 'monospace',
                }}
              />
              <div style={{ marginTop: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                O modelo é aplicado em conjunto com a chave. Ao trocar de chave, o modelo
                predefinido dessa chave é preenchido automaticamente.
              </div>
            </div>

            {hasRoute && (
              <div style={{ fontSize: '0.75rem', color: '#34d399' }}>
                Esta conta já tem uma rota configurada para este especialista.
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};
