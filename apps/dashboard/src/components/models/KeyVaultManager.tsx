import React, { useCallback, useEffect, useState } from 'react';
import { deleteVaultKey, fetchKeyVault, KeyVaultItem, registerVaultKey, testVaultKey } from '../../services/api/models';

const providers = ['openai', 'gemini', 'groq', 'deepseek', 'anthropic', 'custom'];

export const KeyVaultManager: React.FC = () => {
  const [keys, setKeys] = useState<KeyVaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
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
    try { setKeys(await fetchKeyVault()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao carregar o cofre.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true); setError(''); setMessage('');
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
      setKeyId(''); setLabel(''); setBaseUrl(''); setDefaultModel('');
      setMessage('Chave guardada no KeyVault cifrado.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao guardar a chave.');
    } finally { setSaving(false); }
  };

  const test = async (id: string) => {
    setTesting(id); setError(''); setMessage('');
    try {
      const result = await testVaultKey(id);
      setMessage(result.message || (result.success ? 'Ligação validada.' : 'O teste não foi concluído.'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao testar a chave.');
    } finally { setTesting(null); }
  };

  const remove = async (item: KeyVaultItem) => {
    if (!window.confirm(`Remover a credencial "${item.label || item.key_id}" do KeyVault?`)) return;
    try {
      await deleteVaultKey(item.key_id);
      setMessage('Credencial removida.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao remover credencial.');
    }
  };

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <header className="glass-card" style={{ padding: 20, borderRadius: 14 }}>
        <h3 style={{ color: 'var(--text-primary)', margin: 0, fontSize: 20 }}>KeyVault seguro</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '6px 0 0' }}>
          Credenciais cifradas em repouso. A interface mostra apenas a máscara; o segredo nunca é recuperado para o navegador.
        </p>
      </header>

      {error && <div role="alert" style={noticeError}>{error}</div>}
      {message && <div role="status" style={noticeSuccess}>{message}</div>}

      <form onSubmit={save} className="glass-card" style={{ padding: 20, borderRadius: 14, display: 'grid', gap: 12 }}>
        <strong style={{ color: 'var(--text-primary)' }}>Adicionar ou atualizar credencial</strong>
        <div style={gridStyle}>
          <label style={fieldStyle}>ID único<input required value={keyId} onChange={(e) => setKeyId(e.target.value)} placeholder="ex.: openai-primary" style={inputStyle} /></label>
          <label style={fieldStyle}>Nome de identificação<input required value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Provedor principal" style={inputStyle} /></label>
          <label style={fieldStyle}>Provedor<select value={provider} onChange={(e) => setProvider(e.target.value)} style={inputStyle}>{providers.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
          <label style={fieldStyle}>Modelo padrão<input value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)} placeholder="modelo opcional" style={inputStyle} /></label>
          <label style={{ ...fieldStyle, gridColumn: '1 / -1' }}>Base URL (opcional)<input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.provedor.com/v1" style={inputStyle} /></label>
          <label style={{ ...fieldStyle, gridColumn: '1 / -1' }}>Chave secreta<input required type="password" autoComplete="new-password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="A chave será enviada uma vez e guardada cifrada" style={inputStyle} /></label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn btn-primary" disabled={saving}>{saving ? 'A guardar…' : 'Guardar no KeyVault'}</button></div>
      </form>

      <section className="glass-card" style={{ padding: 20, borderRadius: 14, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><strong style={{ color: 'var(--text-primary)' }}>Credenciais registadas</strong><button className="btn btn-secondary" type="button" onClick={load} disabled={loading}>Atualizar</button></div>
        {loading ? <p style={{ color: 'var(--text-muted)' }}>A carregar credenciais…</p> : keys.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>O cofre ainda não contém credenciais.</p> : keys.map((item) => (
          <article key={item.key_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: 13, borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <div style={{ minWidth: 0 }}>
              <strong style={{ color: 'var(--text-primary)', display: 'block' }}>{item.label || item.key_id}</strong>
              <small style={{ color: 'var(--text-muted)' }}>{item.provider || item.provider_name} · {item.key_id} · {item.masked_key}</small>
            </div>
            <div style={{ display: 'flex', gap: 7 }}>
              <button className="btn btn-secondary" type="button" disabled={testing === item.key_id} onClick={() => test(item.key_id)}>{testing === item.key_id ? 'A testar…' : 'Testar'}</button>
              <button className="btn btn-secondary" type="button" onClick={() => remove(item)} style={{ color: '#f87171' }}>Remover</button>
            </div>
          </article>
        ))}
      </section>
    </section>
  );
};

const gridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 12 };
const fieldStyle: React.CSSProperties = { display: 'grid', gap: 6, color: 'var(--text-secondary)', fontSize: 12 };
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' };
const noticeError: React.CSSProperties = { padding: 12, borderRadius: 9, color: '#fca5a5', background: 'rgba(239,68,68,.1)' };
const noticeSuccess: React.CSSProperties = { padding: 12, borderRadius: 9, color: '#4ade80', background: 'rgba(34,197,94,.1)' };
