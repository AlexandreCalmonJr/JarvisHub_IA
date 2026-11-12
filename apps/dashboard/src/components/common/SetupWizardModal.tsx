import React, { useState } from 'react';
import {
  Zap,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  RefreshCw,
  Cpu,
  AlertCircle,
  X,
  Server,
} from 'lucide-react';
import { API_BASE } from '../../services/api/client';
import { registerVaultKey } from '../../services/api/models';

interface SetupWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCompleted?: () => void;
}

type CloudProvider = 'gemini' | 'openai' | 'groq' | 'deepseek' | 'anthropic' | 'custom';

const CLOUD_PRESETS: Record<CloudProvider, { model: string; baseUrl: string }> = {
  gemini: { model: 'gemini-2.5-flash', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  openai: { model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1' },
  groq: { model: 'openai/gpt-oss-120b', baseUrl: 'https://api.groq.com/openai/v1' },
  deepseek: { model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1' },
  anthropic: { model: 'claude-3-5-haiku-20241022', baseUrl: 'https://api.anthropic.com/v1' },
  custom: { model: '', baseUrl: '' },
};

export const SetupWizardModal: React.FC<SetupWizardModalProps> = ({ isOpen, onClose, onCompleted }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [mode, setMode] = useState<'cloud' | 'local'>('local');
  const [cloudProvider, setCloudProvider] = useState<CloudProvider>('gemini');
  const [cloudApiKey, setCloudApiKey] = useState('');
  const [cloudModel, setCloudModel] = useState(CLOUD_PRESETS.gemini.model);
  const [cloudBaseUrl, setCloudBaseUrl] = useState(CLOUD_PRESETS.gemini.baseUrl);

  const [saving, setSaving] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [environmentStatus, setEnvironmentStatus] = useState<any>(null);
  const [checkingEnvironment, setCheckingEnvironment] = useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setCheckingEnvironment(true);
    fetch(`${API_BASE}/system/onboarding`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Não foi possível consultar o estado do servidor.');
        return response.json();
      })
      .then((status) => { if (!cancelled) setEnvironmentStatus(status); })
      .catch((error) => { if (!cancelled) setFinishError(error.message || 'Falha ao verificar o ambiente.'); })
      .finally(() => { if (!cancelled) setCheckingEnvironment(false); });
    return () => { cancelled = true; };
  }, [isOpen]);

  const handleProviderChange = (provider: CloudProvider) => {
    setCloudProvider(provider);
    setCloudModel(CLOUD_PRESETS[provider].model);
    setCloudBaseUrl(CLOUD_PRESETS[provider].baseUrl);
  };

  const handleFinish = async () => {
    setSaving(true);
    setFinishError(null);
    try {
      if (mode === 'cloud') {
        const apiKey = cloudApiKey.trim();
        if (!apiKey) {
          throw new Error('Informe a chave de API do provedor escolhido.');
        }
        await registerVaultKey({
          key_id: 'account_primary',
          label: `${cloudProvider.toUpperCase()} — chave da minha conta`,
          provider: cloudProvider,
          api_key: apiKey,
          base_url: cloudBaseUrl.trim() || undefined,
          default_model: cloudModel.trim() || undefined,
          is_active: true,
          is_default: true,
          scope: 'account',
        });
        setCloudApiKey('');
      }
      const response = await fetch(`${API_BASE}/system/onboarding/complete`, { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error('O servidor não confirmou a conclusão da configuração.');
      if (onCompleted) onCompleted();
      onClose();
    } catch (e: any) {
      setFinishError(e?.message || 'Não foi possível concluir a configuração.');
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
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: '18px',
          border: '1px solid var(--border-accent)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7), 0 0 40px var(--accent-glow)',
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
            background: 'linear-gradient(135deg, var(--accent-glow) 0%, var(--bg-secondary) 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
                Assistente de Configuração Inicial
              </h2>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Configure o ambiente local e conheça as opções de segurança do JARVIS
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
              backgroundColor: step >= 1 ? 'var(--accent-color)' : 'rgba(255, 255, 255, 0.1)',
              transition: 'background-color 0.3s',
            }}
          />
          <div
            style={{
              flex: 1,
              height: '4px',
              borderRadius: '2px',
              backgroundColor: step >= 2 ? 'var(--accent-color)' : 'rgba(255, 255, 255, 0.1)',
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
                  O modo local fica disponível de imediato. O modo nuvem usa o Cofre Privado por Conta: a sua chave fica cifrada e isolada na sua conta.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                {/* Opção Nuvem Híbrida */}
                <div
                  onClick={() => setMode('cloud')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') setMode('cloud');
                  }}
                  style={{
                    padding: '18px 20px',
                    borderRadius: '14px',
                    cursor: 'pointer',
                    backgroundColor: mode === 'cloud' ? 'var(--accent-glow)' : 'rgba(255, 255, 255, 0.03)',
                    border: mode === 'cloud' ? '2px solid var(--accent-color)' : '1px solid rgba(255, 255, 255, 0.08)',
                    boxShadow: mode === 'cloud' ? '0 8px 24px var(--accent-glow)' : 'none',
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
                        backgroundColor: 'var(--accent-glow)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--accent-color)',
                      }}
                    >
                      <Zap size={20} />
                    </div>
                    <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                      Cofre por conta
                    </span>
                  </div>

                  <div>
                    <h4 style={{ fontSize: '0.98rem', fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>
                      Modo Nuvem Híbrido
                    </h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.45', margin: 0 }}>
                      Conecte o seu provedor externo (Gemini, OpenAI, Groq, DeepSeek ou Anthropic). A chave fica cifrada no cofre privado da sua conta.
                    </p>
                  </div>

                  <div style={{ fontSize: '0.74rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={13} />
                    <span>Chave cifrada e isolada na sua conta</span>
                  </div>
                </div>

                {/* Opção 100% Offline */}
                <div
                  onClick={() => setMode('local')}
                  style={{
                    padding: '18px 20px',
                    borderRadius: '14px',
                    cursor: 'pointer',
                    backgroundColor: mode === 'local' ? 'var(--accent-glow)' : 'rgba(255, 255, 255, 0.03)',
                    border: mode === 'local' ? '2px solid var(--accent-color)' : '1px solid rgba(255, 255, 255, 0.08)',
                    boxShadow: mode === 'local' ? '0 8px 24px var(--accent-glow)' : 'none',
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
                        backgroundColor: 'var(--accent-glow)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--accent-color)',
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

              <div className="glass-panel" style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                <div><strong style={{ color: 'var(--text-primary)', fontSize: '.8rem' }}>Verificação do ambiente</strong><div style={{ color: 'var(--text-muted)', fontSize: '.72rem', marginTop: 4 }}>{checkingEnvironment ? 'A consultar o servidor…' : 'Estado recebido do backend'}</div></div>
                {[
                  ['Base de dados', environmentStatus?.database_available],
                  ['Modelo local', environmentStatus?.local_model_available],
                  ['Cofre cifrado', environmentStatus?.vault_encryption_ready],
                  ['Provider cloud', environmentStatus?.hybrid_provider_enabled],
                ].map(([label, ready]) => <div key={String(label)} style={{ fontSize: '.78rem', color: 'var(--text-secondary)' }}>{label}: <strong style={{ color: ready === true ? 'var(--success-color)' : ready === false ? 'var(--warning-color)' : 'var(--text-muted)' }}>{ready === true ? 'Disponível' : ready === false ? 'Não configurado' : 'A verificar'}</strong></div>)}
              </div>
              {mode === 'cloud' ? (
                <div
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    padding: '18px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Zap size={20} color="#fbbf24" />
                    <span style={{ fontSize: '0.94rem', fontWeight: 600, color: '#f8fafc' }}>
                      Cofre Privado por Conta
                    </span>
                  </div>

                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
                    A chave é gravada cifrada no cofre da sua conta e usada automaticamente nas suas inferências.
                    As chamadas externas continuam sujeitas à política de dados sensíveis e ao orçamento global.
                  </p>

                  <label style={{ display: 'grid', gap: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Provedor
                    <select
                      value={cloudProvider}
                      onChange={(event) => handleProviderChange(event.target.value as CloudProvider)}
                      style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: '#070a12', color: '#f8fafc' }}
                    >
                      <option value="gemini">Google Gemini</option>
                      <option value="openai">OpenAI</option>
                      <option value="groq">Groq</option>
                      <option value="deepseek">DeepSeek</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="custom">Endpoint compatível (personalizado)</option>
                    </select>
                  </label>

                  <label style={{ display: 'grid', gap: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Chave de API
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={cloudApiKey}
                      onChange={(event) => setCloudApiKey(event.target.value)}
                      placeholder="A chave é enviada uma única vez e guardada cifrada"
                      style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: '#070a12', color: '#f8fafc' }}
                    />
                  </label>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                    <label style={{ display: 'grid', gap: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Modelo predefinido
                      <input
                        value={cloudModel}
                        onChange={(event) => setCloudModel(event.target.value)}
                        placeholder="ex.: gemini-2.5-flash"
                        style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: '#070a12', color: '#f8fafc' }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Base URL
                      <input
                        value={cloudBaseUrl}
                        onChange={(event) => setCloudBaseUrl(event.target.value)}
                        placeholder="https://api.provedor.com/v1"
                        style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: '#070a12', color: '#f8fafc' }}
                      />
                    </label>
                  </div>

                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    Pode alterar, testar ou remover a chave mais tarde em Modelos → Cofre de Chaves. Nenhum segredo é devolvido ao navegador.
                  </span>
                </div>
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
                    A disponibilidade do provedor local deve ser confirmada no painel de modelos.
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
                    Políticas de Segurança do JARVIS
                  </h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
                    As políticas de autenticação, permissões e auditoria podem ser consultadas no Security Center. No modo nuvem, a chave fica no Cofre Privado por Conta, cifrada em repouso e isolada das restantes contas.
                  </p>
                </div>
              </div>

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
                    {mode === 'cloud' ? `Nuvem Híbrida (${cloudProvider})` : '100% Offline (Ollama)'}
                  </span>
                </div>

                <div>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block' }}>
                    Especialistas Ativos:
                  </span>
                  <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#818cf8' }}>
                    Agentes disponíveis no servidor
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {finishError && <div role="alert" style={{ padding: '10px 20px', color: '#f87171', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '8px' }}><AlertCircle size={15} />{finishError}</div>}
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
                background: 'linear-gradient(135deg, var(--accent-color) 0%, var(--accent-hover) 100%)',
                borderColor: 'var(--accent-color)',
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