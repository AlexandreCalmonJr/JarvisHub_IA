import React from 'react';

export interface ProviderCard {
  id: string;
  name: string;
  defaultModel: string;
  baseUrl: string;
}

interface Props {
  provider: string;
  enabled: boolean;
  apiKey: string;
  showKey: boolean;
  defaultModel: string;
  baseUrl: string;
  maxBudget: number;
  testLoading: boolean;
  testResult: { success: boolean; message?: string; error?: string } | null;
  saveLoading: boolean;
  saveMessage: string | null;
  onProviderSelect: (card: ProviderCard) => void;
  onToggleEnabled: (value: boolean) => void;
  onApiKeyChange: (value: string) => void;
  onToggleShowKey: () => void;
  onDefaultModelChange: (value: string) => void;
  onBaseUrlChange: (value: string) => void;
  onMaxBudgetChange: (value: number) => void;
  onTestConnection: () => void;
  onSaveConfig: (event: React.FormEvent<HTMLFormElement>) => void;
}

const providers: ProviderCard[] = [
  { id: 'openai', name: 'OpenAI', defaultModel: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1' },
  { id: 'gemini', name: 'Google Gemini', defaultModel: 'gemini-2.5-flash', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  { id: 'groq', name: 'Groq', defaultModel: 'qwen/qwen3.8-27b', baseUrl: 'https://api.groq.com/openai/v1' },
  { id: 'deepseek', name: 'DeepSeek', defaultModel: 'deepseek-chat', baseUrl: 'https://api.deepseek.com' },
  { id: 'anthropic', name: 'Anthropic', defaultModel: 'claude-3-5-haiku-20241022', baseUrl: 'https://api.anthropic.com/v1' },
  { id: 'custom', name: 'Compatível OpenAI / personalizado', defaultModel: 'custom-model', baseUrl: 'https://api.openai.com/v1' },
];

export const HybridGatewayConfig: React.FC<Props> = (props) => {
  const {
    provider, enabled, apiKey, showKey, defaultModel, baseUrl, maxBudget,
    testLoading, testResult, saveLoading, saveMessage, onProviderSelect,
    onToggleEnabled, onApiKeyChange, onToggleShowKey, onDefaultModelChange,
    onBaseUrlChange, onMaxBudgetChange, onTestConnection, onSaveConfig,
  } = props;

  return (
    <form onSubmit={onSaveConfig} className="glass-card" style={{ padding: 22, borderRadius: 16, display: 'grid', gap: 16 }}>
      <header>
        <h3 style={{ color: 'var(--text-primary)', fontSize: 20, margin: 0 }}>Gateway híbrido</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '6px 0 0' }}>
          Configure o provedor externo. A chave é armazenada no KeyVault cifrado e nunca é devolvida integralmente.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10 }}>
        {providers.map((item) => (
          <button key={item.id} type="button" onClick={() => onProviderSelect(item)} style={{
            textAlign: 'left', padding: 13, borderRadius: 10, cursor: 'pointer',
            border: provider === item.id ? '1px solid var(--accent-color)' : '1px solid var(--border-color)',
            background: provider === item.id ? 'rgba(59,130,246,.10)' : 'var(--bg-secondary)',
            color: 'var(--text-primary)',
          }}>
            <strong style={{ fontSize: 13 }}>{item.name}</strong>
            <small style={{ display: 'block', color: 'var(--text-muted)', marginTop: 5 }}>{item.defaultModel}</small>
          </button>
        ))}
      </div>

      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 13, background: 'var(--bg-secondary)', borderRadius: 10 }}>
        <span><strong style={{ display: 'block', color: 'var(--text-primary)', fontSize: 13 }}>Ativar egresso externo</strong><small style={{ color: 'var(--text-muted)' }}>As políticas de dados, aprovação e orçamento continuam ativas.</small></span>
        <input type="checkbox" checked={enabled} onChange={(e) => onToggleEnabled(e.target.checked)} />
      </label>

      <div style={{ display: 'grid', gap: 7 }}>
        <label style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Chave de API {apiKey ? '(nova chave a guardar)' : '(deixe vazio para manter a chave atual)'}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={apiKey} onChange={(e) => onApiKeyChange(e.target.value)} type={showKey ? 'text' : 'password'} autoComplete="new-password" placeholder="Cole a chave do provedor" style={inputStyle} />
          <button type="button" className="btn btn-secondary" onClick={onToggleShowKey}>{showKey ? 'Ocultar' : 'Mostrar'}</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
        <label style={fieldStyle}>Modelo padrão<input value={defaultModel} onChange={(e) => onDefaultModelChange(e.target.value)} style={inputStyle} /></label>
        <label style={fieldStyle}>Base URL<input value={baseUrl} onChange={(e) => onBaseUrlChange(e.target.value)} style={inputStyle} /></label>
        <label style={fieldStyle}>Orçamento máximo (USD)<input type="number" min="0" step="0.5" value={maxBudget} onChange={(e) => onMaxBudgetChange(Number(e.target.value))} style={inputStyle} /></label>
      </div>

      {testResult && <div role="status" style={{ padding: 12, borderRadius: 9, color: testResult.success ? '#4ade80' : '#fca5a5', background: testResult.success ? 'rgba(34,197,94,.10)' : 'rgba(239,68,68,.10)' }}>{testResult.success ? testResult.message : testResult.error}</div>}
      {saveMessage && <div role="status" style={{ padding: 12, borderRadius: 9, color: '#4ade80', background: 'rgba(34,197,94,.10)' }}>{saveMessage}</div>}

      <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary" disabled={testLoading} onClick={onTestConnection}>{testLoading ? 'A testar…' : 'Testar ligação'}</button>
        <button type="submit" className="btn btn-primary" disabled={saveLoading}>{saveLoading ? 'A guardar…' : 'Guardar configuração'}</button>
      </footer>
    </form>
  );
};

const fieldStyle: React.CSSProperties = { display: 'grid', gap: 7, color: 'var(--text-secondary)', fontSize: 12 };
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' };
