import React, { useState, useEffect } from 'react';
import {
  Zap,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  RefreshCw,
  Key,
  Eye,
  EyeOff,
  Globe,
  Cpu,
  AlertCircle,
  X,
  Server,
} from 'lucide-react';
import { fetchHybridConfig, saveHybridConfig, testHybridConnection } from '../../api';

interface SetupWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCompleted?: () => void;
}

interface ProviderOption {
  id: string;
  name: string;
  badge: string;
  defaultModel: string;
  baseUrl: string;
  description: string;
  isPopular?: boolean;
}

const PROVIDERS: ProviderOption[] = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    badge: 'Recomendado Gratuito',
    defaultModel: 'gemini-1.5-flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    description: 'Ultra-rápido, cota gratuita generosa e contexto de 1 milhão de tokens.',
    isPopular: true,
  },
  {
    id: 'openai',
    name: 'OpenAI (GPT-4o)',
    badge: 'Alta Precisão',
    defaultModel: 'gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1',
    description: 'Padrão da indústria para raciocínio complexo e geração de código.',
  },
  {
    id: 'groq',
    name: 'Groq Cloud',
    badge: 'Ultra-Velocidade',
    defaultModel: 'llama-3.3-70b-versatile',
    baseUrl: 'https://api.groq.com/openai/v1',
    description: 'Inferência em LPU com velocidade extrema (>250 tokens/segundo).',
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    badge: 'Arquitetura & Código',
    defaultModel: 'claude-3-5-sonnet-20241022',
    baseUrl: 'https://api.anthropic.com/v1',
    description: 'Especialista em lógica rigorosa, refatorações e testes unitários.',
  },
];

export const SetupWizardModal: React.FC<SetupWizardModalProps> = ({ isOpen, onClose, onCompleted }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [mode, setMode] = useState<'cloud' | 'local'>('cloud');
  const [selectedProvider, setSelectedProvider] = useState<string>('gemini');
  const [apiKey, setApiKey] = useState<string>('');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-1.5-flash');
  const [baseUrl, setBaseUrl] = useState<string>('https://generativelanguage.googleapis.com/v1beta/openai');
  const [maxBudget, setMaxBudget] = useState<number>(5.0);

  // Status dos testes
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Inicializa dados com configuração salva no servidor se existir
  useEffect(() => {
    if (isOpen) {
      fetchHybridConfig()
        .then((cfg) => {
          if (cfg) {
            if (cfg.provider_name) setSelectedProvider(cfg.provider_name);
            if (cfg.default_model) setSelectedModel(cfg.default_model);
            if (cfg.base_url) setBaseUrl(cfg.base_url);
            if (cfg.max_budget_usd) setMaxBudget(cfg.max_budget_usd);
            if (cfg.enabled) setMode('cloud');
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  const handleProviderSelect = (p: ProviderOption) => {
    setSelectedProvider(p.id);
    setSelectedModel(p.defaultModel);
    setBaseUrl(p.baseUrl);
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const payload: any = {
        provider_name: selectedProvider,
        default_model: selectedModel,
        base_url: baseUrl || undefined,
      };
      if (apiKey && apiKey.trim()) {
        payload.api_key = apiKey.trim();
      }
      const res = await testHybridConnection(payload);
      if (res.success) {
        setTestResult({
          success: true,
          message: `Conexão bem-sucedida! Latência: ${res.latency_ms}ms`,
        });
      } else {
        setTestResult({
          success: false,
          error: res.error || 'Falha ao validar chave ou endpoint.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.message || 'Erro de rede ou endpoint inacessível.',
      });
    } finally {
      setTestLoading(false);
    }
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      const payload: any = {
        provider_name: selectedProvider,
        enabled: mode === 'cloud',
        default_model: selectedModel,
        base_url: baseUrl,
        max_budget_usd: maxBudget,
      };
      if (apiKey && apiKey.trim()) {
        payload.api_key = apiKey.trim();
      }

      await saveHybridConfig(payload);
      localStorage.setItem('jarvis_setup_completed', 'true');
      if (onCompleted) onCompleted();
      onClose();
    } catch (e: any) {
      alert(`Erro ao salvar configurações: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        padding: '20px',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div
        className="glass-card"
        style={{
          width: '100%',
          maxWidth: '740px',
          backgroundColor: '#0a0f1d',
          borderRadius: '18px',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7), 0 0 40px rgba(99, 102, 241, 0.15)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh',
        }}
      >
        {/* Header do Wizard */}
        <div
          style={{
            padding: '20px 26px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(15, 23, 42, 0.8) 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
                Assistente de Configuração Inicial
              </h2>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Configure o motor de IA e as preferências do JARVIS em 3 passos simples
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="btn btn-ghost"
            style={{ padding: '6px', borderRadius: '8px' }}
            title="Fechar assistente"
          >
            <X size={18} />
          </button>
        </div>

        {/* Steps Progress Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '14px 26px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            backgroundColor: 'rgba(0, 0, 0, 0.25)',
            gap: '8px',
          }}
        >
          <div
            style={{
              flex: 1,
              height: '4px',
              borderRadius: '2px',
              backgroundColor: step >= 1 ? '#6366f1' : 'rgba(255, 255, 255, 0.1)',
              transition: 'background-color 0.3s',
            }}
          />
          <div
            style={{
              flex: 1,
              height: '4px',
              borderRadius: '2px',
              backgroundColor: step >= 2 ? '#6366f1' : 'rgba(255, 255, 255, 0.1)',
              transition: 'background-color 0.3s',
            }}
          />
          <div
            style={{
              flex: 1,
              height: '4px',
              borderRadius: '2px',
              backgroundColor: step >= 3 ? '#10b981' : 'rgba(255, 255, 255, 0.1)',
              transition: 'background-color 0.3s',
            }}
          />
        </div>

        {/* Body do Wizard */}
        <div style={{ padding: '24px 26px', flex: 1, overflowY: 'auto' }}>
          {/* PASSO 1: Escolha do Modo */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc', marginBottom: '6px' }}>
                  Passo 1: Como você deseja rodar a inteligência do JARVIS?
                </h3>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Você pode alternar entre Nuvem e Local a qualquer momento após o setup.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                {/* Opção Nuvem Híbrida */}
                <div
                  onClick={() => setMode('cloud')}
                  style={{
                    padding: '18px 20px',
                    borderRadius: '14px',
                    cursor: 'pointer',
                    backgroundColor: mode === 'cloud' ? 'rgba(99, 102, 241, 0.14)' : 'rgba(255, 255, 255, 0.03)',
                    border: mode === 'cloud' ? '2px solid #6366f1' : '1px solid rgba(255, 255, 255, 0.08)',
                    boxShadow: mode === 'cloud' ? '0 8px 24px rgba(99, 102, 241, 0.25)' : 'none',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        backgroundColor: 'rgba(99, 102, 241, 0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#818cf8',
                      }}
                    >
                      <Zap size={20} />
                    </div>
                    <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                      Início Rápido
                    </span>
                  </div>

                  <div>
                    <h4 style={{ fontSize: '0.98rem', fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>
                      Modo Nuvem Híbrido
                    </h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.45', margin: 0 }}>
                      Conecta com Gemini, OpenAI, Groq ou Claude. Funciona instantaneamente sem sobrecarregar sua máquina e sem baixar modelos pesados.
                    </p>
                  </div>

                  <div style={{ fontSize: '0.74rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={13} />
                    <span>Redação de privacidade local (DLP) ativada por padrão</span>
                  </div>
                </div>

                {/* Opção 100% Offline */}
                <div
                  onClick={() => setMode('local')}
                  style={{
                    padding: '18px 20px',
                    borderRadius: '14px',
                    cursor: 'pointer',
                    backgroundColor: mode === 'local' ? 'rgba(16, 185, 129, 0.14)' : 'rgba(255, 255, 255, 0.03)',
                    border: mode === 'local' ? '2px solid #10b981' : '1px solid rgba(255, 255, 255, 0.08)',
                    boxShadow: mode === 'local' ? '0 8px 24px rgba(16, 185, 129, 0.25)' : 'none',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        backgroundColor: 'rgba(16, 185, 129, 0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#34d399',
                      }}
                    >
                      <Cpu size={20} />
                    </div>
                    <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>
                      100% Offline
                    </span>
                  </div>

                  <div>
                    <h4 style={{ fontSize: '0.98rem', fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>
                      Modo Ollama Local
                    </h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.45', margin: 0 }}>
                      Execução estritamente no seu computador. Requer o daemon do Ollama instalado e cerca de 8 GB de RAM disponível para inferência local.
                    </p>
                  </div>

                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Server size={13} />
                    <span>Executa em localhost:11434</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PASSO 2: Configuração dos Detalhes */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc', marginBottom: '6px' }}>
                  {mode === 'cloud'
                    ? 'Passo 2: Escolha seu provedor e conecte sua Chave de API'
                    : 'Passo 2: Verificação do Ollama Local'}
                </h3>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: 0 }}>
                  {mode === 'cloud'
                    ? 'Recomendamos o Google Gemini para início imediato e sem custos.'
                    : 'Certifique-se de que o aplicativo Ollama está em execução no seu computador.'}
                </p>
              </div>

              {mode === 'cloud' ? (
                <>
                  {/* Grid de Provedores */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
                    {PROVIDERS.map((p) => {
                      const isSel = selectedProvider === p.id;
                      return (
                        <div
                          key={p.id}
                          onClick={() => handleProviderSelect(p)}
                          style={{
                            padding: '12px 14px',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            backgroundColor: isSel ? 'rgba(99, 102, 241, 0.18)' : 'rgba(255, 255, 255, 0.03)',
                            border: isSel ? '1px solid #818cf8' : '1px solid rgba(255, 255, 255, 0.08)',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div style={{ fontSize: '0.88rem', fontWeight: 600, color: isSel ? '#f8fafc' : 'var(--text-primary)' }}>
                            {p.name}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#818cf8', marginTop: '2px' }}>
                            {p.badge}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Campo Chave de API */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Chave de API ({PROVIDERS.find((p) => p.id === selectedProvider)?.name || selectedProvider}):
                    </label>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        backgroundColor: '#070a12',
                        borderRadius: '10px',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        padding: '8px 12px',
                        gap: '8px',
                      }}
                    >
                      <Key size={15} color="var(--text-muted)" />
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(e) => {
                          setApiKey(e.target.value);
                          setTestResult(null);
                        }}
                        placeholder="Cole sua API Key aqui (ex: AIzaSy... ou sk-...)"
                        style={{
                          flex: 1,
                          backgroundColor: 'transparent',
                          border: 'none',
                          outline: 'none',
                          color: '#fff',
                          fontSize: '0.86rem',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="btn btn-ghost"
                        style={{ padding: '4px', color: 'var(--text-muted)' }}
                      >
                        {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  {/* Botão de Testar Conexão */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={testLoading}
                      className="btn btn-secondary"
                      style={{ fontSize: '0.82rem', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      {testLoading ? <RefreshCw size={14} className="spin" /> : <Globe size={14} color="#818cf8" />}
                      <span>{testLoading ? 'Testando Conexão...' : 'Testar Conexão com o Provedor'}</span>
                    </button>

                    {testResult && (
                      <div
                        style={{
                          fontSize: '0.8rem',
                          color: testResult.success ? '#34d399' : '#f87171',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        {testResult.success ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                        <span>{testResult.message || testResult.error}</span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* Modo Local: Instruções e Verificação */
                <div
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    padding: '18px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Cpu size={20} color="#34d399" />
                    <span style={{ fontSize: '0.94rem', fontWeight: 600, color: '#f8fafc' }}>
                      Modelos Locais Recomendados para o JARVIS
                    </span>
                  </div>

                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                    O JARVIS utiliza o modelo leve <code>llama3.2:3b</code> para triagem de tarefas e o <code>qwen2.5-coder:7b</code> para desenvolvimento de código.
                  </div>

                  <div
                    style={{
                      backgroundColor: '#070a12',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '0.78rem',
                      color: '#93c5fd',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                    }}
                  >
                    ollama run llama3.2:3b
                  </div>

                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    O sistema utilizará fallback automático caso o Ollama esteja temporariamente desligado.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* PASSO 3: Confirmação e Segurança */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc', marginBottom: '6px' }}>
                  Passo 3: Garantia de Segurança & Conclusão
                </h3>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Seu ambiente local é protegido pelo Núcleo de Políticas e Auditoria do JARVIS.
                </p>
              </div>

              {/* Banner de Proteção DLP */}
              <div
                style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  borderRadius: '12px',
                  padding: '16px 18px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                }}
              >
                <ShieldCheck size={22} color="#10b981" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#34d399', margin: '0 0 4px' }}>
                    Garantia de Privacidade & Prevenção de Fuga de Dados (DLP)
                  </h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
                    Mesmo com o modo online ativado, qualquer prompt contendo senhas, chaves de API, credenciais ou tokens sensíveis é <strong>bloqueado e redigido localmente</strong> pelo Security Core antes de alcançar qualquer provedor externo.
                  </p>
                </div>
              </div>

              {/* Teto de Gastos */}
              {mode === 'cloud' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Teto Máximo de Gastos Mensal ($ USD):
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    value={maxBudget}
                    onChange={(e) => setMaxBudget(Number(e.target.value) || 5.0)}
                    style={{
                      width: '120px',
                      backgroundColor: '#070a12',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      color: '#fff',
                      fontSize: '0.88rem',
                    }}
                  />
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    O sistema interrompe chamadas à nuvem caso o consumo atinja este valor.
                  </span>
                </div>
              )}

              {/* Resumo */}
              <div
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <div>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block' }}>
                    Modo Configurado:
                  </span>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#f8fafc' }}>
                    {mode === 'cloud' ? `Nuvem Híbrida (${selectedProvider.toUpperCase()})` : '100% Offline (Ollama)'}
                  </span>
                </div>

                <div>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block' }}>
                    Especialistas Ativos:
                  </span>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#818cf8' }}>
                    26 Agentes Locais Prontos
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer do Wizard: Botões de Navegação */}
        <div
          style={{
            padding: '16px 26px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: 'rgba(15, 23, 42, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s - 1) as any)}
              className="btn btn-secondary"
              style={{ fontSize: '0.84rem', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <ArrowLeft size={15} />
              <span>Voltar</span>
            </button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s + 1) as any)}
              className="btn btn-primary"
              style={{ fontSize: '0.84rem', padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <span>Avançar</span>
              <ArrowRight size={15} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              disabled={saving}
              className="btn btn-primary"
              style={{
                fontSize: '0.86rem',
                padding: '9px 24px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                borderColor: '#10b981',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
              }}
            >
              {saving ? <RefreshCw size={15} className="spin" /> : <CheckCircle2 size={16} />}
              <span>Concluir e Iniciar JARVIS Studio</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};