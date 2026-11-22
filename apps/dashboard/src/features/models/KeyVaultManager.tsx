import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, RefreshCw } from 'lucide-react';
import {
  deleteVaultKey,
  fetchKeyVault,
  KeyVaultItem,
  registerVaultKey,
  setDefaultVaultKey,
  testVaultKey,
} from '../../services/api/models';
import { humanizeLabel } from '../../types';

const providers = ['openai', 'gemini', 'groq', 'deepseek', 'anthropic', 'custom'];

const keyScope = (item: KeyVaultItem): 'account' | 'global' =>
  item.owner_user_id ? 'account' : 'global';

export const KeyVaultManager: React.FC = () => {
  const [keys, setKeys] = useState<KeyVaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [keyId, setKeyId] = useState('');
  const [label, setLabel] = useState('');
  const [provider, setProvider] = useState('openai');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [defaultModel, setDefaultModel] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setKeys(await fetchKeyVault());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar o cofre.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await registerVaultKey({
        key_id: keyId.trim(),
        label: label.trim(),
        provider,
        api_key: apiKey.trim(),
        base_url: baseUrl.trim() || undefined,
        default_model: defaultModel.trim() || undefined,
        is_active: true,
      });
      setApiKey('');
      setKeyId('');
      setLabel('');
      setBaseUrl('');
      setDefaultModel('');
      setMessage('Chave guardada no KeyVault cifrado.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao guardar a chave.');
    } finally {
      setSaving(false);
    }
  };

  const test = async (item: KeyVaultItem) => {
    setTesting(item.key_id);
    setError('');
    setMessage('');
    try {
      const result = await testVaultKey(item.key_id, keyScope(item));
      setMessage(result.message || (result.success ? 'Ligação validada.' : 'O teste não foi concluído.'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao testar a chave.');
    } finally {
      setTesting(null);
    }
  };

  const makeDefault = async (item: KeyVaultItem) => {
    setError('');
    setMessage('');
    try {
      await setDefaultVaultKey(item.key_id);
      setMessage('Chave predefinida da conta atualizada.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao definir a chave predefinida.');
    }
  };

  const remove = async (item: KeyVaultItem) => {
    setConfirmRemoveId(null);
    try {
      await deleteVaultKey(item.key_id, keyScope(item));
      setMessage('Credencial removida.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao remover credencial.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="jarvis-callout jarvis-callout--info">
        Cofre privado por conta: cada utilizador vê e gere apenas as suas credenciais. As chaves ficam cifradas em repouso; a interface mostra apenas a máscara e o segredo nunca é recuperado para o navegador.
      </div>

      {error && (
        <div role="alert" className="jarvis-error-banner">
          {error}
        </div>
      )}

      {message && (
        <div role="status" className="jarvis-callout jarvis-callout--success">
          {message}
        </div>
      )}

      <form onSubmit={save} className="jarvis-settings-card">
        <div className="jarvis-settings-card-header">
          <div>
            <h3 className="jarvis-settings-card-title">Adicionar ou atualizar credencial</h3>
            <p className="jarvis-settings-card-desc">
              A chave secreta é enviada uma única vez e armazenada cifrada no servidor.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label htmlFor="kv-key-id" className="user-profile-field-label">
              ID único
            </label>
            <input
              id="kv-key-id"
              required
              className="jarvis-input"
              value={keyId}
              onChange={(e) => setKeyId(e.target.value)}
              placeholder="ex.: openai-primary"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label htmlFor="kv-label" className="user-profile-field-label">
              Nome de identificação
            </label>
            <input
              id="kv-label"
              required
              className="jarvis-input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Provedor principal"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label htmlFor="kv-provider" className="user-profile-field-label">
              Provedor
            </label>
            <select
              id="kv-provider"
              className="jarvis-select"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              {providers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label htmlFor="kv-default-model" className="user-profile-field-label">
              Modelo padrão
            </label>
            <input
              id="kv-default-model"
              className="jarvis-input"
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              placeholder="modelo opcional"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: '1 / -1' }}>
            <label htmlFor="kv-base-url" className="user-profile-field-label">
              Base URL (opcional)
            </label>
            <input
              id="kv-base-url"
              className="jarvis-input"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.provedor.com/v1"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: '1 / -1' }}>
            <label htmlFor="kv-secret" className="user-profile-field-label">
              Chave secreta
            </label>
            <input
              id="kv-secret"
              required
              type="password"
              autoComplete="new-password"
              className="jarvis-input"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="A chave será enviada uma vez e guardada cifrada"
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
            {saving ? 'A guardar…' : 'Guardar no KeyVault'}
          </button>
        </div>
      </form>

      <section className="jarvis-settings-card">
        <div className="jarvis-settings-card-header">
          <div>
            <h3 className="jarvis-settings-card-title">Credenciais registadas</h3>
            <p className="jarvis-settings-card-desc">
              Gerencie a chave predefinida da conta, teste conectividade ou remova credenciais antigas.
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            <span>Atualizar</span>
          </button>
        </div>

        {loading ? (
          <div role="status" className="jarvis-callout jarvis-callout--info">
            A carregar credenciais…
          </div>
        ) : keys.length === 0 ? (
          <div className="jarvis-empty-state">
            <KeyRound size={26} />
            <div className="jarvis-empty-state-title">O cofre ainda não contém credenciais</div>
            <div className="jarvis-empty-state-desc">
              Adicione uma chave acima para ativar provedores externos nas suas inferências.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {keys.map((item) => (
              <article
                key={item.key_id}
                className="jarvis-settings-subcard"
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <strong style={{ color: 'var(--text-primary)', fontSize: '0.88rem' }}>
                      {item.label || humanizeLabel(item.key_id)}
                    </strong>
                    {item.is_default && (
                      <span style={{ color: '#4ade80', fontSize: '0.72rem', fontWeight: 600 }}>
                        Predefinida
                      </span>
                    )}
                  </div>
                  <small style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>
                    <span style={{ textTransform: 'uppercase', fontWeight: 600, color: 'var(--accent-light)' }}>
                      {item.provider || item.provider_name}
                    </span>{' '}
                    · <code style={{ fontFamily: 'var(--font-mono)' }}>{item.masked_key}</code> ·{' '}
                    {item.owner_user_id ? 'Conta' : 'Global'}
                  </small>
                </div>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {item.owner_user_id && !item.is_default && (
                    <button
                      className="btn btn-secondary btn-xs"
                      type="button"
                      onClick={() => void makeDefault(item)}
                    >
                      Usar nas minhas inferências
                    </button>
                  )}
                  <button
                    className="btn btn-secondary btn-xs"
                    type="button"
                    disabled={testing === item.key_id}
                    onClick={() => void test(item)}
                  >
                    {testing === item.key_id ? 'A testar…' : 'Testar'}
                  </button>
                  {confirmRemoveId === item.key_id ? (
                    <>
                      <button
                        className="btn btn-danger btn-xs"
                        type="button"
                        onClick={() => void remove(item)}
                      >
                        Confirmar
                      </button>
                      <button
                        className="btn btn-ghost btn-xs"
                        type="button"
                        onClick={() => setConfirmRemoveId(null)}
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn btn-danger-ghost btn-xs"
                      type="button"
                      onClick={() => setConfirmRemoveId(item.key_id)}
                    >
                      Remover
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
