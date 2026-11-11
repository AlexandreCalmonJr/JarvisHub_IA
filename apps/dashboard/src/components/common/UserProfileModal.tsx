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
import { API_BASE } from '../../services/api/client';
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
  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [experienceMode, setExperienceMode] = useState<'essential' | 'technical' | 'advanced'>(() => {
    const stored = localStorage.getItem(getAccountStorageKey('jarvis_experience_mode'));
    return stored === 'essential' || stored === 'advanced' ? stored : 'technical';
  });

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetch(`${API_BASE}/auth/me`, { credentials: 'include' })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((principal) => {
        if (!cancelled) setIsAdmin(principal?.kind === 'human' && principal?.role === 'admin');
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setProfile(getUserProfile());
    setLoadingProfile(true);
    setSavedSuccess(false);

    fetchUserProfileApi()
      .then((dbProfile) => {
        if (cancelled || !dbProfile) return;
        const merged = { ...getUserProfile(), ...dbProfile };
        setProfile(merged);
        saveUserProfile(merged);
      })
      .catch(() => {
        if (!cancelled) setProfile(getUserProfile());
      })
      .finally(() => {
        if (!cancelled) setLoadingProfile(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      try {
        localStorage.setItem(getAccountStorageKey('jarvis_experience_mode'), experienceMode);
      } catch {
        // A preferência local é opcional; a gravação no servidor deve continuar.
      }
      await saveUserProfileApi(profile);
      saveUserProfile(profile);
      setSavedSuccess(true);
      notify('Perfil e preferências sincronizados com a conta.', 'success');
      onProfileUpdated?.(profile);
      window.setTimeout(() => setSavedSuccess(false), 2500);
    } catch {
      saveUserProfile(profile);
      onProfileUpdated?.(profile);
      setSavedSuccess(false);
      notify(
        'Não foi possível sincronizar com o servidor. As preferências não secretas foram guardadas apenas neste navegador.',
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleBackupDatabase = async () => {
    setBackingUp(true);
    try {
      await createSystemBackup();
      notify('Backup do sistema criado com sucesso.', 'success');
    } catch (e: any) {
      notify(`Erro ao gerar backup: ${e.message}`, 'error');
    } finally {
      setBackingUp(false);
    }
  };

  const handleClearHistory = () => {
    if (window.confirm('Tem certeza de que deseja apagar todo o histórico de conversas locais? Esta ação não pode ser desfeita.')) {
      try {
        const accountSuffix = getAccountStorageKey('__scope_probe__').slice('__scope_probe__'.length);
        const fixedKeys = new Set([
          getAccountStorageKey('jarvis_chat_messages_v1'),
          getAccountStorageKey('jarvis_chat_session_id_v1'),
          getAccountStorageKey('jarvis_sessions_catalog_v1'),
        ]);
        for (let index = localStorage.length - 1; index >= 0; index -= 1) {
          const key = localStorage.key(index);
          if (key && (fixedKeys.has(key) || (key.startsWith('jarvis_session_messages_') && key.endsWith(accountSuffix)))) {
            localStorage.removeItem(key);
          }
        }
      } catch {
        notify('O navegador não permitiu limpar o armazenamento local.', 'error');
        return;
      }
      notify('Histórico local desta conta limpo com sucesso.', 'info');
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
      notify('Conversa atual exportada.', 'success');
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
          borderBottom: '1px solid var(--border-color)',
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
              Guarda a preferência de experiência neste navegador. Os módulos que ainda não suportam modos adaptativos mantêm a apresentação padrão.
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
                    backgroundColor: experienceMode === mode.id ? 'var(--accent-glow)' : 'rgba(255, 255, 255, 0.02)',
                    border: `1px solid ${experienceMode === mode.id ? 'var(--accent-color)' : 'var(--border-color)'}`,
                    minWidth: 0,
                    color: experienceMode === mode.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                    borderColor: experienceMode === mode.id ? 'var(--accent-color)' : 'var(--border-color)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '2px' }}>{mode.label}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>{mode.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="user-profile-avatar-section">
            <label className="user-profile-field-label">Ícone do perfil</label>
            <div className="user-profile-avatar-options" role="group" aria-label="Escolher ícone do perfil">
              {['💻', '🧑‍💻', '👨‍💼', '👩‍💻', '🛠️', '🧠', '🚀', '🤖'].map((avatar) => (
                <button
                  key={avatar}
                  type="button"
                  className={`user-profile-avatar-option ${profile.avatarIcon === avatar ? 'is-active' : ''}`}
                  aria-label={`Selecionar ícone ${avatar}`}
                  aria-pressed={profile.avatarIcon === avatar}
                  onClick={() => setProfile({ ...profile, avatarIcon: avatar })}
                >
                  {avatar}
                </button>
              ))}
            </div>
          </div>

          <div className="user-profile-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
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

          <div className="user-profile-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
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
            <button type="submit" disabled={saving || loadingProfile} className="btn btn-primary" style={{ padding: '8px 18px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Save size={15} />
              <span>{saving ? 'Salvando…' : 'Salvar Perfil'}</span>
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
              <span>{saving ? 'Salvando…' : 'Salvar Instruções'}</span>
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
            <strong style={{ color: 'var(--text-primary)' }}>Gestão de credenciais no Gestor de Modelos</strong>
            <p style={{ margin: '8px 0 0' }}>
              As credenciais de providers devem ser geridas no módulo Gestor de Modelos, na área Cofre de Chaves, quando disponível para o seu perfil de acesso. Não coloque tokens ou palavras-passe nas instruções personalizadas.
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
              backgroundColor: 'var(--accent-glow)',
              border: '1px solid var(--border-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="badge">Configuração centralizada</span>
                <strong style={{ fontSize: '0.94rem', color: 'var(--text-primary)' }}>Preferências de execução e modelos</strong>
              </div>
              <p style={{ fontSize: '0.80rem', color: 'var(--text-secondary)', margin: '6px 0 0 0' }}>
                A seleção efetiva de modelos e providers é controlada pelo Gestor de Modelos e pelas políticas de execução. Esta área oferece acesso ao assistente de configuração, sem presumir que um modelo específico esteja ativo.
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
              Privacidade e políticas de dados:
            </div>
            A proteção de dados depende das políticas e integrações efetivamente ativas. Consulte Segurança e o Gestor de Modelos para verificar os controlos disponíveis nesta instalação.
          </div>
        </div>
      )}

      {/* Conteúdo Aba: Dados & Backup */}
      {activeTab === 'data' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {isAdmin && (
            <div
              style={{
                padding: '16px',
                borderRadius: '10px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <strong style={{ fontSize: '0.90rem', color: 'var(--text-primary)', display: 'block' }}>Backup do sistema</strong>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Gera uma cópia do banco de dados do servidor. Disponível apenas para administradores.
                </span>
              </div>
              <button
                type="button"
                onClick={handleBackupDatabase}
                disabled={backingUp}
                className="btn btn-secondary"
                style={{ fontSize: '0.80rem', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Database size={14} color="var(--accent-color)" />
                <span>{backingUp ? 'Gerando Backup...' : 'Criar Backup SQLite'}</span>
              </button>
            </div>
          )}

          <div
            style={{
              padding: '16px',
              borderRadius: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              <strong style={{ fontSize: '0.90rem', color: 'var(--text-primary)', display: 'block' }}>Exportar Conversa Atual</strong>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Exporta as mensagens da conversa atual guardadas neste navegador em formato JSON.
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
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              <strong style={{ fontSize: '0.90rem', color: 'var(--danger-color)', display: 'block' }}>Limpar Histórico Local</strong>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Apaga o histórico de conversas e o catálogo de sessões guardados neste navegador para esta conta.
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
