import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import {
  Sparkles,
  Save,
  Trash2,
  Download,
  Database,
} from 'lucide-react';
import { fetchUserProfileApi, saveUserProfileApi, createSystemBackup } from '../../api';
import { getAccountStorageKey } from '../../services/accountScope';
import { notify } from './Toast';

export interface UserProfileData {
  displayName: string;
  roleTitle: string;
  avatarIcon: string;
  seniorityLevel: 'junior' | 'mid' | 'senior' | 'architect';
  responseStyle: 'concise' | 'detailed' | 'educational';
  userBackground: string;
  responseGuidelines: string;
  huggingfaceToken: string;
  groqApiKey: string;
  geminiApiKey: string;
}

const DEFAULT_PROFILE: UserProfileData = {
  displayName: 'Desenvolvedor',
  roleTitle: 'Engenheiro de Software',
  avatarIcon: '💻',
  seniorityLevel: 'senior',
  responseStyle: 'detailed',
  userBackground: 'Stack principal: Python, TypeScript, Flutter, Docker e SQLite.',
  responseGuidelines: 'Priorizar código limpo, tipagem estrita, arquitetura modular e segurança OWASP.',
  huggingfaceToken: '',
  groqApiKey: '',
  geminiApiKey: '',
};

export const USER_PROFILE_STORAGE_KEY = 'jarvis_user_profile_v1';

export function getUserProfile(): UserProfileData {
  try {
    const raw = localStorage.getItem(getAccountStorageKey(USER_PROFILE_STORAGE_KEY));
    if (raw) {
      return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
    }
  } catch {}
  return DEFAULT_PROFILE;
}

export function saveUserProfile(data: UserProfileData): void {
  try {
    const safeProfile = {
      ...data,
      huggingfaceToken: '',
      groqApiKey: '',
      geminiApiKey: '',
    };
    localStorage.setItem(getAccountStorageKey(USER_PROFILE_STORAGE_KEY), JSON.stringify(safeProfile));
  } catch {}
}

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSetupWizard?: () => void;
  onProfileUpdated?: (profile: UserProfileData) => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  onOpenSetupWizard,
  onProfileUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'instructions' | 'keys' | 'engine' | 'data'>('profile');
  const [profile, setProfile] = useState<UserProfileData>(getUserProfile);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [experienceMode, setExperienceMode] = useState<'essential' | 'technical' | 'advanced'>(() => {
    return (localStorage.getItem(getAccountStorageKey('jarvis_experience_mode')) as any) || 'technical';
  });

  useEffect(() => {
    if (isOpen) {
      // Carrega do SQLite ou fallback para localStorage
      fetchUserProfileApi()
        .then((dbProfile) => {
          if (dbProfile) {
            const merged = { ...getUserProfile(), ...dbProfile };
            setProfile(merged);
            saveUserProfile(merged);
          }
        })
        .catch(() => {
          setProfile(getUserProfile());
        });
      setSavedSuccess(false);
    }
  }, [isOpen]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    localStorage.setItem(getAccountStorageKey('jarvis_experience_mode'), experienceMode);
    try {
      await saveUserProfileApi(profile);
      saveUserProfile(profile);
      setSavedSuccess(true);
      notify('Perfil e configurações da conta salvos com sucesso!', 'success');
      if (onProfileUpdated) onProfileUpdated(profile);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch {
      saveUserProfile(profile);
      setSavedSuccess(false);
      notify(
        'Não foi possível sincronizar com o servidor. As preferências não secretas ficaram guardadas apenas neste navegador.',
        'error',
      );
    }
  };

  const handleBackupDatabase = async () => {
    setBackingUp(true);
    try {
      const res = await createSystemBackup();
      notify(`Backup gerado com sucesso em: ${res.backup_path}`, 'success');
    } catch (e: any) {
      notify(`Erro ao gerar backup: ${e.message}`, 'error');
    } finally {
      setBackingUp(false);
    }
  };

  const handleClearHistory = () => {
    if (window.confirm('Tem certeza de que deseja apagar todo o histórico de conversas locais? Esta ação não pode ser desfeita.')) {
      localStorage.removeItem(getAccountStorageKey('jarvis_chat_messages_v1'));
      localStorage.removeItem(getAccountStorageKey('jarvis_sessions_catalog_v1'));
      notify('Histórico de conversas limpo com sucesso.', 'info');
      setTimeout(() => window.location.reload(), 600);
    }
  };

  const handleExportData = () => {
    try {
      const messages = localStorage.getItem(getAccountStorageKey('jarvis_chat_messages_v1')) || '[]';
      const blob = new Blob([messages], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jarvis_chat_export_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      notify('Histórico de conversas exportado.', 'success');
    } catch (e: any) {
      notify(`Erro ao exportar dados: ${e.message}`, 'error');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Perfil e Preferências da Conta"
      maxWidth="lg"
    >
      {/* Navegação entre Abas do Perfil */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          paddingBottom: '12px',
          marginBottom: '20px',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`btn ${activeTab === 'profile' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ fontSize: '0.80rem', padding: '6px 12px' }}
        >
          <span>Identidade & Experiência</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('instructions')}
          className={`btn ${activeTab === 'instructions' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ fontSize: '0.80rem', padding: '6px 12px' }}
        >
          <span>Instruções de IA</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('keys')}
          className={`btn ${activeTab === 'keys' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ fontSize: '0.80rem', padding: '6px 12px' }}
        >
          <span>Chaves de API</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('engine')}
          className={`btn ${activeTab === 'engine' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ fontSize: '0.80rem', padding: '6px 12px' }}
        >
          <span>Motor Local</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('data')}
          className={`btn ${activeTab === 'data' ? 'btn-primary' : 'btn-ghost'}`}
          style={{ fontSize: '0.80rem', padding: '6px 12px' }}
        >
          <span>Backup & Dados</span>
        </button>
      </div>

      {savedSuccess && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#34d399',
            fontSize: '0.84rem',
            marginBottom: '16px',
          }}
        >
          <span>Preferências sincronizadas com o banco de dados e núcleo do JARVIS!</span>
        </div>
      )}

      {/* Conteúdo Aba: Identidade do Desenvolvedor & Nível de Experiência */}
      {activeTab === 'profile' && (
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Seletor de Modo de Experiência (Essencial | Técnico | Avançado) */}
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-color)',
            }}
          >
            <label style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '8px' }}>
              Nível de Experiência da Interface
            </label>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>
              Adapta o nível de detalhe e a densidade de informações em todo o JARVIS:
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
              {[
                { id: 'essential', label: 'Essencial', desc: 'Foco no essencial, direto e sem excessos visuais' },
                { id: 'technical', label: 'Técnico', desc: 'Engenharia completa, terminal e fluxos de código' },
                { id: 'advanced', label: 'Avançado', desc: 'Orquestração multi-agente, telemetria e governança' },
              ].map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setExperienceMode(mode.id as any)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    backgroundColor: experienceMode === mode.id ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                    border: `1px solid ${experienceMode === mode.id ? 'rgba(255, 255, 255, 0.35)' : 'var(--border-color)'}`,
                    color: experienceMode === mode.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '2px' }}>{mode.label}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>{mode.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Nome de Exibição:
              </label>
              <input
                type="text"
                value={profile.displayName}
                onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                className="input"
                style={{ width: '100%', padding: '9px 12px', fontSize: '0.88rem' }}
                placeholder="Ex: Carlos Silva"
                required
              />
            </div>

            <div>
              <label style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Cargo / Especialidade Técnica:
              </label>
              <input
                type="text"
                value={profile.roleTitle}
                onChange={(e) => setProfile({ ...profile, roleTitle: e.target.value })}
                className="input"
                style={{ width: '100%', padding: '9px 12px', fontSize: '0.88rem' }}
                placeholder="Ex: Desenvolvedor Fullstack"
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Nível de Senioridade:
              </label>
              <select
                value={profile.seniorityLevel}
                onChange={(e) => setProfile({ ...profile, seniorityLevel: e.target.value as any })}
                className="input"
                style={{ width: '100%', padding: '9px 12px', fontSize: '0.88rem' }}
              >
                <option value="junior">Estudante / Júnior (Explicações didáticas)</option>
                <option value="mid">Pleno (Código limpo, padrões e testes)</option>
                <option value="senior">Sênior / Tech Lead (Respostas avançadas e concisas)</option>
                <option value="architect">Arquiteto de Software (Foco em escalabilidade e ADR)</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Estilo de Resposta do JARVIS:
              </label>
              <select
                value={profile.responseStyle}
                onChange={(e) => setProfile({ ...profile, responseStyle: e.target.value as any })}
                className="input"
                style={{ width: '100%', padding: '9px 12px', fontSize: '0.88rem' }}
              >
                <option value="concise">Direto ao Ponto (Mais rápido, foco no essencial)</option>
                <option value="detailed">Técnico & Completo (Código completo com testes)</option>
                <option value="educational">Educacional & Explicativo (Passo a passo didático)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button type="submit" className="btn btn-primary" style={{ padding: '8px 18px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Save size={15} />
              <span>Salvar Perfil</span>
            </button>
          </div>
        </form>
      )}

      {/* Conteúdo Aba: Instruções Personalizadas (ChatGPT style) */}
      {activeTab === 'instructions' && (
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
              O que o JARVIS deve saber sobre você para fornecer respostas melhores?
            </label>
            <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '0 0 8px 0' }}>
              Ex: Suas linguagens preferidas, frameworks que você utiliza no dia a dia, projetos em andamento.
            </p>
            <textarea
              rows={3}
              value={profile.userBackground}
              onChange={(e) => setProfile({ ...profile, userBackground: e.target.value })}
              className="input"
              style={{ width: '100%', padding: '10px', fontSize: '0.86rem', resize: 'vertical' }}
              placeholder="Ex: Trabalho principalmente com Python (FastAPI), Flutter para mobile e PostgreSQL. Prefiro ambientes Windows com PowerShell."
            />
          </div>

          <div>
            <label style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
              Como você gostaria que o JARVIS respondesse e formatasse o código?
            </label>
            <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '0 0 8px 0' }}>
              Ex: Padrões arquiteturais favoritos (Clean Architecture, SOLID, BLoC), se deve incluir comentários ou testes unitários.
            </p>
            <textarea
              rows={3}
              value={profile.responseGuidelines}
              onChange={(e) => setProfile({ ...profile, responseGuidelines: e.target.value })}
              className="input"
              style={{ width: '100%', padding: '10px', fontSize: '0.86rem', resize: 'vertical' }}
              placeholder="Ex: Sempre forneça código completo pronto para copiar. Use tipagem estrita no TypeScript. Siga Clean Architecture."
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button type="submit" className="btn btn-primary" style={{ padding: '8px 18px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Save size={15} />
              <span>Salvar Instruções</span>
            </button>
          </div>
        </form>
      )}

      {/* Conteúdo Aba: Cofre de Chaves & Hugging Face */}
      {activeTab === 'keys' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div
            role="status"
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              backgroundColor: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              color: 'var(--text-secondary)',
              fontSize: '0.84rem',
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: 'var(--text-primary)' }}>Cofre privado por conta em implementação</strong>
            <p style={{ margin: '8px 0 0' }}>
              A gravação segura de credenciais ainda não está disponível. Para proteger suas chaves, esta tela não envia nem armazena tokens de API. Aguarde a entrega do Cofre de Credenciais individual, com criptografia e isolamento entre contas.
            </p>
          </div>
        </section>
      )}

      {/* Conteúdo Aba: Motor & Setup */}
      {activeTab === 'engine' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              padding: '16px',
              borderRadius: '10px',
              backgroundColor: 'rgba(99, 102, 241, 0.08)',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="badge badge-success">Local-First Ativo</span>
                <strong style={{ fontSize: '0.94rem', color: '#f8fafc' }}>Ollama Local (100% Offline)</strong>
              </div>
              <p style={{ fontSize: '0.80rem', color: 'var(--text-secondary)', margin: '6px 0 0 0' }}>
                Seu JARVIS opera com modelos locais instalados na CPU/RAM (Llama 3.2 3B, Qwen 2.5 Coder 7B e Qwen 2.5 7B), com zero envio de dados para a nuvem.
              </p>
            </div>

            {onOpenSetupWizard && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSetupWizard();
                }}
                className="btn btn-primary"
                style={{
                  fontSize: '0.80rem',
                  padding: '8px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  flexShrink: 0,
                }}
              >
                <Sparkles size={14} />
                <span>Abrir Assistente de Setup</span>
              </button>
            )}
          </div>

          <div
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              fontSize: '0.82rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              Garantia de Privacidade & DLP Local:
            </div>
            Todas as credenciais, tokens e segredos em arquivos no seu computador são redigidos localmente pelo Núcleo de Políticas e Auditoria antes de qualquer inferência.
          </div>
        </div>
      )}

      {/* Conteúdo Aba: Dados & Backup */}
      {activeTab === 'data' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div
            style={{
              padding: '16px',
              borderRadius: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div>
              <strong style={{ fontSize: '0.90rem', color: '#f8fafc', display: 'block' }}>Backup Físico do Banco de Dados</strong>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Cria uma cópia física segura e instantânea do SQLite (jarvis.db) com histórico e memórias.
              </span>
            </div>
            <button
              type="button"
              onClick={handleBackupDatabase}
              disabled={backingUp}
              className="btn btn-secondary"
              style={{ fontSize: '0.80rem', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Database size={14} color="#818cf8" />
              <span>{backingUp ? 'Gerando Backup...' : 'Criar Backup SQLite'}</span>
            </button>
          </div>

          <div
            style={{
              padding: '16px',
              borderRadius: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div>
              <strong style={{ fontSize: '0.90rem', color: '#f8fafc', display: 'block' }}>Exportar Histórico de Conversas</strong>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Faça download de todas as mensagens e dados do chat em formato JSON legível.
              </span>
            </div>
            <button
              type="button"
              onClick={handleExportData}
              className="btn btn-secondary"
              style={{ fontSize: '0.80rem', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Download size={14} />
              <span>Exportar JSON</span>
            </button>
          </div>

          <div
            style={{
              padding: '16px',
              borderRadius: '10px',
              backgroundColor: 'rgba(239, 68, 68, 0.06)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div>
              <strong style={{ fontSize: '0.90rem', color: '#fca5a5', display: 'block' }}>Limpar Histórico Local</strong>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Apaga todas as sessões anteriores e restaura a saudação inicial do JARVIS.
              </span>
            </div>
            <button
              type="button"
              onClick={handleClearHistory}
              className="btn btn-danger"
              style={{ fontSize: '0.80rem', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Trash2 size={14} />
              <span>Limpar Dados</span>
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};
