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
import { getAccountStorageKey } from '../../services/accountScope';

interface SetupWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCompleted?: () => void;
}

export const SetupWizardModal: React.FC<SetupWizardModalProps> = ({ isOpen, onClose, onCompleted }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [mode, setMode] = useState<'cloud' | 'local'>('local');

  const [saving, setSaving] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  const handleFinish = async () => {
    setSaving(true);
    setFinishError(null);
    try {
      if (mode !== 'local') {
        throw new Error('A configuração de provedores na nuvem ficará disponível após a implantação do Cofre Privado por Conta.');
      }
      localStorage.setItem(getAccountStorageKey('jarvis_setup_completed'), 'true');
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
                  O modo local fica disponível de imediato. A configuração em nuvem será liberada após a implantação do Cofre Privado por Conta.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                {/* Opção Nuvem Híbrida */}
                <div
                  aria-disabled={true}
                  style={{
                    padding: '18px 20px',
                    borderRadius: '14px',
                    cursor: 'not-allowed',
                    opacity: 0.55,
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
                      Em implementação
                    </span>
                  </div>

                  <div>
                    <h4 style={{ fontSize: '0.98rem', fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>
                      Modo Nuvem Híbrido
                    </h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.45', margin: 0 }}>
                      A configuração de provedores e credenciais ficará disponível após a implantação do Cofre Privado por Conta. Não insira chaves nesta etapa.
                    </p>
                  </div>

                  <div style={{ fontSize: '0.74rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={13} />
                    <span>Cofre Privado por Conta em implementação</span>
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

              {mode === 'cloud' ? (
                <div role="status" style={{ padding: '18px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                  O Cofre Privado por Conta está em implementação. A configuração global de APIs permanece bloqueada neste assistente para impedir que uma conta altere ou utilize credenciais compartilhadas.
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
                    As políticas de autenticação, permissões e auditoria podem ser consultadas no Security Center. A configuração de provedores em nuvem permanece desativada até a implantação do Cofre Privado por Conta.
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
                    100% Offline (Ollama)
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