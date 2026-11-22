import React from 'react';
import { Eye, EyeOff } from 'lucide-react';

export interface ProviderCard {
  id: string;
  name: string;
  defaultModel: string;
  baseUrl: string;
}

interface Props {
  provider: string;
  /** Presets vindos do backend; usa `fallbackProviders` quando ausente. */
  providers?: ProviderCard[];
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

/**
 * Fallback local. A lista real vem de `GET /api/v1/models/hybrid-config`
 * (`presets`), gerada por `services/model_runtime/provider_catalog.py`.
 * Mantenha estes valores em sincronia com a tabela do backend.
 */
const fallbackProviders: ProviderCard[] = [
  { id: 'openai', name: 'OpenAI', defaultModel: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1' },
  { id: 'gemini', name: 'Google Gemini', defaultModel: 'gemini-2.5-flash', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  { id: 'groq', name: 'Groq', defaultModel: 'openai/gpt-oss-120b', baseUrl: 'https://api.groq.com/openai/v1' },
  { id: 'deepseek', name: 'DeepSeek', defaultModel: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1' },
  { id: 'openrouter', name: 'OpenRouter', defaultModel: 'meta-llama/llama-3.3-70b-instruct', baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'anthropic', name: 'Anthropic', defaultModel: 'claude-3-5-haiku-20241022', baseUrl: 'https://api.anthropic.com/v1' },
  { id: 'custom', name: 'Compatível OpenAI / personalizado', defaultModel: '', baseUrl: '' },
];

export const HybridGatewayConfig: React.FC<Props> = (props) => {
  const {
    provider,
    enabled,
    apiKey,
    showKey,
    defaultModel,
    baseUrl,
    maxBudget,
    testLoading,
    testResult,
    saveLoading,
    saveMessage,
    onProviderSelect,
    providers,
    onToggleEnabled,
    onApiKeyChange,
    onToggleShowKey,
    onDefaultModelChange,
    onBaseUrlChange,
    onMaxBudgetChange,
    onTestConnection,
    onSaveConfig,
  } = props;

  return (
    <form onSubmit={onSaveConfig} className="jarvis-settings-card">
      <div className="jarvis-settings-card-header">
        <div>
          <h3 className="jarvis-settings-card-title">Gateway híbrido</h3>
          <p className="jarvis-settings-card-desc">
            Configure o provedor externo. A chave é armazenada no KeyVault cifrado e nunca é devolvida integralmente.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 190px), 1fr))', gap: '8px' }}>
        {(providers && providers.length > 0 ? providers : fallbackProviders).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onProviderSelect(item)}
            className={`jarvis-choice-card ${provider === item.id ? 'is-active' : ''}`}
          >
            <strong style={{ fontSize: '0.84rem', color: 'var(--text-primary)' }}>{item.name}</strong>
            <small
              style={{
                display: 'block',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.defaultModel || 'Personalizado'}
            </small>
          </button>
        ))}
      </div>

      <label
        htmlFor="hybrid-egress-toggle"
        className="jarvis-setting-row"
        style={{
          padding: '12px 14px',
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)',
          cursor: 'pointer',
        }}
      >
        <div className="jarvis-setting-row__meta">
          <strong className="jarvis-setting-row__title">Ativar egresso externo</strong>
          <span className="jarvis-setting-row__desc">
            As políticas de dados, aprovação e orçamento continuam ativas.
          </span>
        </div>
        <input
          id="hybrid-egress-toggle"
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggleEnabled(e.target.checked)}
        />
      </label>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label htmlFor="hybrid-api-key" className="user-profile-field-label">
          Chave de API {apiKey ? '(nova chave a guardar)' : '(deixe vazio para manter a chave atual)'}
        </label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input
            id="hybrid-api-key"
            className="jarvis-input"
            style={{ flex: '1 1 260px' }}
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            type={showKey ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Cole a chave do provedor"
          />
          <button type="button" className="btn btn-secondary btn-sm" onClick={onToggleShowKey}>
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            <span>{showKey ? 'Ocultar' : 'Mostrar'}</span>
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label htmlFor="hybrid-default-model" className="user-profile-field-label">
            Modelo padrão
          </label>
          <input
            id="hybrid-default-model"
            className="jarvis-input"
            value={defaultModel}
            onChange={(e) => onDefaultModelChange(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label htmlFor="hybrid-base-url" className="user-profile-field-label">
            Base URL
          </label>
          <input
            id="hybrid-base-url"
            className="jarvis-input"
            value={baseUrl}
            onChange={(e) => onBaseUrlChange(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label htmlFor="hybrid-max-budget" className="user-profile-field-label">
            Orçamento máximo (USD)
          </label>
          <input
            id="hybrid-max-budget"
            className="jarvis-input jarvis-tabular"
            type="number"
            min="0"
            step="0.5"
            value={maxBudget}
            onChange={(e) => onMaxBudgetChange(Number(e.target.value))}
          />
        </div>
      </div>

      {testResult && (
        <div
          role={testResult.success ? 'status' : 'alert'}
          className={`jarvis-callout ${testResult.success ? 'jarvis-callout--success' : 'jarvis-callout--danger'}`}
        >
          {testResult.success ? testResult.message : testResult.error}
        </div>
      )}

      {saveMessage && (
        <div role="status" className="jarvis-callout jarvis-callout--success">
          {saveMessage}
        </div>
      )}

      <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap', paddingTop: '4px' }}>
        <button type="button" className="btn btn-secondary btn-sm" disabled={testLoading} onClick={onTestConnection}>
          {testLoading ? 'A testar…' : 'Testar ligação'}
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saveLoading}>
          {saveLoading ? 'A guardar…' : 'Guardar configuração'}
        </button>
      </footer>
    </form>
  );
};
