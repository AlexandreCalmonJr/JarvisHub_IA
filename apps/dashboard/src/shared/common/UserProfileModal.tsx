import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import {
  Save,
  Trash2,
  Download,
  Database,
  User,
  Mic,
  Volume2,
  Smartphone,
  Sparkles,
  Check,
  ShieldCheck,
} from 'lucide-react';
import { fetchUserProfileApi, saveUserProfileApi, createSystemBackup } from '../../api';
import { getAccountStorageKey } from '../../services/accountScope';
import { API_BASE } from '../../services/api/client';
import { notify } from './Toast';
import { ConfirmDialog } from './ConfirmDialog';
import {
  ASSISTANT_NAME_PRESETS,
  DEFAULT_ASSISTANT_NAME,
  WorkspaceExperienceMode,
  normalizeAssistantName,
  normalizeExperienceMode,
} from '../../services/assistantIdentity';
import { useAssistantIdentity } from '../../context/AssistantIdentityContext';
import {
  getVoiceAutoSpeakPref,
  getWakeWordEnabledPref,
  setVoiceAutoSpeakPref,
  setWakeWordEnabledPref,
} from '../../hooks/useWakeWordListener';

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
  assistantName?: string;
  assistantGreeting?: string;
  experienceMode?: WorkspaceExperienceMode;
}

const DEFAULT_PROFILE: UserProfileData = {
  displayName: 'Usuário',
  roleTitle: 'Uso Pessoal & Produtividade',
  avatarIcon: '🙂',
  seniorityLevel: 'mid',
  responseStyle: 'concise',
  userBackground: '',
  responseGuidelines: 'Responder em português claro, objetivo e fácil de seguir.',
  huggingfaceToken: '',
  groqApiKey: '',
  geminiApiKey: '',
  assistantName: DEFAULT_ASSISTANT_NAME,
  assistantGreeting: '',
  experienceMode: 'engineering',
};

export const USER_PROFILE_STORAGE_KEY = 'jarvis_user_profile_v1';

export function getUserProfile(): UserProfileData {
  try {
    const raw = localStorage.getItem(getAccountStorageKey(USER_PROFILE_STORAGE_KEY));
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_PROFILE,
        ...parsed,
        assistantName: normalizeAssistantName(parsed.assistantName),
        experienceMode: normalizeExperienceMode(parsed.experienceMode),
      };
    }
  } catch {}
  return DEFAULT_PROFILE;
}

export function saveUserProfile(data: UserProfileData): void {
  try {
    const safeProfile = {
      ...data,
      assistantName: normalizeAssistantName(data.assistantName),
      experienceMode: normalizeExperienceMode(data.experienceMode),
      huggingfaceToken: '',
      groqApiKey: '',
      geminiApiKey: '',
    };
    localStorage.setItem(getAccountStorageKey(USER_PROFILE_STORAGE_KEY), JSON.stringify(safeProfile));
  } catch {}
}

type ProfileTab = 'identity' | 'voice' | 'data' | 'devices';

const PROFILE_TABS: Array<{ id: ProfileTab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: 'identity', label: 'Identidade', icon: User },
  { id: 'voice', label: 'Voz & Respostas', icon: Mic },
  { id: 'data', label: 'Meus Dados', icon: Database },
  { id: 'devices', label: 'Dispositivos', icon: Smartphone },
];

const RESPONSE_STYLES: Array<{
  id: UserProfileData['responseStyle'];
  label: string;
  desc: string;
}> = [
  {
    id: 'concise',
    label: 'Direto ao ponto',
    desc: 'Respostas curtas, práticas e sem enrolação.',
  },
  {
    id: 'educational',
    label: 'Explicativo',
    desc: 'Explica o porquê das coisas com exemplos simples.',
  },
  {
    id: 'detailed',
    label: 'Passo a passo',
    desc: 'Respostas completas, estruturadas em etapas.',
  },
];

const AVATAR_OPTIONS = ['🙂', '🚀', '🧠', '✨', '🎯', '💻', '🎨', '📚'];

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (tab: string) => void;
  onOpenSetupWizard?: () => void;
  onProfileUpdated?: (profile: UserProfileData) => void;
}

function previewVoiceGreeting(assistantName: string) {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      notify(`Prévia: "Ei ${assistantName}, como posso ajudar?"`, 'info');
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(`Oi! Aqui é ${assistantName}. Como posso ajudar você hoje?`);
    utter.lang = 'pt-BR';
    utter.rate = 1.03;
    window.speechSynthesis.speak(utter);
  } catch {
    notify(`Prévia: "Oi! Aqui é ${assistantName}. Como posso ajudar você hoje?"`, 'info');
  }
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  onOpenSetupWizard,
  onProfileUpdated,
}) => {
  const identity = useAssistantIdentity();
  const [activeTab, setActiveTab] = useState<ProfileTab>('identity');
  const [profile, setProfile] = useState<UserProfileData>(() => ({
    ...getUserProfile(),
    assistantName: identity.assistantName,
    experienceMode: identity.experienceMode,
  }));
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canEditProfile, setCanEditProfile] = useState(false);
  const [experienceMode, setExperienceMode] = useState<WorkspaceExperienceMode>(identity.experienceMode);
  const [wakeWordEnabled, setWakeWordEnabled] = useState<boolean>(() => getWakeWordEnabledPref());
  const [autoSpeakEnabled, setAutoSpeakEnabled] = useState<boolean>(() => getVoiceAutoSpeakPref());

  useEffect(() => {
    const syncVoice = () => {
      setWakeWordEnabled(getWakeWordEnabledPref());
      setAutoSpeakEnabled(getVoiceAutoSpeakPref());
    };
    window.addEventListener('jarvis_voice_prefs_changed', syncVoice);
    return () => window.removeEventListener('jarvis_voice_prefs_changed', syncVoice);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsAdmin(false);
    setCanEditProfile(false);
    fetch(`${API_BASE}/auth/me`, { credentials: 'include' })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((principal) => {
        if (!cancelled) {
          const human = principal?.kind === 'human';
          setIsAdmin(human && principal?.role === 'admin');
          setCanEditProfile(human && (principal?.role === 'admin' || principal?.role === 'developer'));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsAdmin(false);
          setCanEditProfile(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const base = {
      ...getUserProfile(),
      assistantName: identity.assistantName,
      experienceMode: identity.experienceMode,
    };
    setProfile(base);
    setExperienceMode(identity.experienceMode);
    setWakeWordEnabled(getWakeWordEnabledPref());
    setAutoSpeakEnabled(getVoiceAutoSpeakPref());
    setLoadingProfile(true);
    setSavedSuccess(false);

    fetchUserProfileApi()
      .then((dbProfile) => {
        if (cancelled || !dbProfile) return;
        const merged: UserProfileData = {
          ...base,
          ...dbProfile,
          assistantName: normalizeAssistantName(dbProfile.assistantName || base.assistantName),
          experienceMode: normalizeExperienceMode(dbProfile.experienceMode || base.experienceMode),
        };
        setProfile(merged);
        setExperienceMode(merged.experienceMode || 'engineering');
        saveUserProfile(merged);
      })
      .catch(() => {
        if (!cancelled) setProfile(base);
      })
      .finally(() => {
        if (!cancelled) setLoadingProfile(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, identity.assistantName, identity.experienceMode]);

  const previewName = normalizeAssistantName(profile.assistantName);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canEditProfile || saving) return;
    setSaving(true);
    const nextProfile: UserProfileData = {
      ...profile,
      assistantName: previewName,
      experienceMode,
    };
    try {
      await identity.updateIdentityProfile(nextProfile);
      await saveUserProfileApi(nextProfile);
      saveUserProfile(nextProfile);
      setSavedSuccess(true);
      notify(`Perfil atualizado para ${nextProfile.assistantName}.`, 'success');
      onProfileUpdated?.(nextProfile);
      window.setTimeout(() => setSavedSuccess(false), 2500);
    } catch {
      saveUserProfile(nextProfile);
      onProfileUpdated?.(nextProfile);
      setSavedSuccess(false);
      notify('Preferências salvas neste navegador.', 'info');
    } finally {
      setSaving(false);
    }
  };

  const handleBackupDatabase = async () => {
    if (!isAdmin) return;
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

  const confirmClearHistory = () => {
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
    setConfirmClearOpen(false);
    notify('Histórico local desta conta limpo com sucesso.', 'info');
    setTimeout(() => window.location.reload(), 600);
  };

  const handleExportData = () => {
    try {
      const messages = localStorage.getItem(getAccountStorageKey('jarvis_chat_messages_v1')) || '[]';
      const blob = new Blob([messages], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jarvis_conversas_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      notify('Conversas exportadas com sucesso.', 'success');
    } catch (e: any) {
      notify(`Erro ao exportar dados: ${e.message}`, 'error');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Meu Perfil & Assistente"
      maxWidth="lg"
    >
      {/* Cartão Hero de Identidade & Prévia de Voz */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '14px',
          flexWrap: 'wrap',
          padding: '14px 16px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, rgba(249,115,22,0.12) 0%, rgba(17,22,33,0.92) 65%)',
          border: '1px solid var(--border-accent)',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.45rem',
              flexShrink: 0,
            }}
          >
            {profile.avatarIcon || '🙂'}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.96rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {profile.displayName || 'Usuário'}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Assistente: <strong style={{ color: 'var(--accent-light)' }}>{previewName}</strong> ·{' '}
              {experienceMode === 'simple' ? 'Modo Dia a Dia' : 'Modo Avançado'}
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '3px' }}>
              Saudação por voz: &ldquo;Ei {previewName}, como posso ajudar?&rdquo;
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => previewVoiceGreeting(previewName)}
          className="btn btn-secondary btn-sm"
        >
          <Volume2 size={14} color="var(--accent-light)" />
          <span>Ouvir prévia</span>
        </button>
      </div>

      {/* Navegação Limpa em 4 Abas */}
      <div className="jarvis-profile-tabs" role="tablist" aria-label="Seções do perfil">
        {PROFILE_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={`jarvis-segmented-btn ${isActive ? 'is-active' : ''}`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {savedSuccess && (
        <div className="jarvis-callout jarvis-callout--success" style={{ marginBottom: '14px' }} role="status">
          <Check size={14} style={{ display: 'inline', marginRight: '6px' }} />
          Alterações salvas e sincronizadas com {previewName}.
        </div>
      )}

      {/* Aba 1: Identidade & Modo de Uso */}
      {activeTab === 'identity' && (
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="jarvis-settings-subcard" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label
                htmlFor="profile-assistant-name"
                style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}
              >
                Como você quer chamar seu assistente?
              </label>
              <p style={{ fontSize: '0.77rem', color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.45 }}>
                Você pode usar JARVIS ou dar qualquer nome que preferir (ex.: Luna, Maria, João). Esse nome funciona no chat e na chamada por voz.
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {ASSISTANT_NAME_PRESETS.map((preset) => {
                  const isSelected = previewName === preset.name;
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => setProfile((prev) => ({ ...prev, assistantName: preset.name }))}
                      className={`btn btn-xs ${isSelected ? 'btn-secondary is-active' : 'btn-ghost'}`}
                    >
                      {preset.name}
                    </button>
                  );
                })}
              </div>
              <input
                id="profile-assistant-name"
                type="text"
                maxLength={40}
                value={profile.assistantName || DEFAULT_ASSISTANT_NAME}
                onChange={(e) => setProfile({ ...profile, assistantName: e.target.value })}
                className="jarvis-input"
                placeholder="Ex: JARVIS, Luna, João ou Maria"
              />
            </div>

            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
              <label style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                Modo de Uso
              </label>
              <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.45 }}>
                Alterne a qualquer momento sem perder seus agentes ou conversas.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                {[
                  {
                    id: 'simple' as const,
                    label: 'Modo Dia a Dia (Simples)',
                    desc: 'Visual limpo e intuitivo: Início, Conversas, Meus Agentes, Fluxos, Tarefas e Cadernos.',
                  },
                  {
                    id: 'engineering' as const,
                    label: 'Modo Avançado (Engenharia)',
                    desc: 'Libera Coding Agent, Estúdios, Governança, Logs e ferramentas técnicas completas.',
                  },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    aria-pressed={experienceMode === mode.id}
                    onClick={() => {
                      setExperienceMode(mode.id);
                      setProfile((prev) => ({ ...prev, experienceMode: mode.id }));
                      void identity.setExperienceMode(mode.id);
                    }}
                    className={`jarvis-choice-card ${experienceMode === mode.id ? 'is-active' : ''}`}
                  >
                    <div style={{ fontSize: '0.83rem', fontWeight: 600, color: 'var(--text-primary)' }}>{mode.label}</div>
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{mode.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <fieldset
            disabled={!canEditProfile}
            style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}
          >
            <div className="user-profile-avatar-section">
              <label className="user-profile-field-label">Seu avatar</label>
              <div className="user-profile-avatar-options" role="group" aria-label="Escolher avatar do perfil">
                {AVATAR_OPTIONS.map((avatar) => (
                  <button
                    key={avatar}
                    type="button"
                    className={`user-profile-avatar-option ${profile.avatarIcon === avatar ? 'is-active' : ''}`}
                    aria-label={`Selecionar avatar ${avatar}`}
                    aria-pressed={profile.avatarIcon === avatar}
                    onClick={() => setProfile({ ...profile, avatarIcon: avatar })}
                  >
                    {avatar}
                  </button>
                ))}
              </div>
            </div>

            <div className="user-profile-grid">
              <div>
                <label className="user-profile-field-label" htmlFor="profile-display-name">
                  Seu nome
                </label>
                <input
                  id="profile-display-name"
                  type="text"
                  value={profile.displayName}
                  onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                  className="jarvis-input"
                  placeholder="Ex: Ana Souza"
                  required
                />
              </div>

              <div>
                <label className="user-profile-field-label" htmlFor="profile-role-title">
                  Seu foco principal (opcional)
                </label>
                <input
                  id="profile-role-title"
                  type="text"
                  value={profile.roleTitle}
                  onChange={(e) => setProfile({ ...profile, roleTitle: e.target.value })}
                  className="jarvis-input"
                  placeholder="Ex: Estudos, Negócios, Casa ou Tecnologia"
                />
              </div>
            </div>
          </fieldset>

          {canEditProfile && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
              <button type="submit" disabled={saving || loadingProfile} className="btn btn-primary btn-sm">
                <Save size={14} />
                <span>{saving ? 'Salvando…' : 'Salvar Alterações'}</span>
              </button>
            </div>
          )}
        </form>
      )}

      {/* Aba 2: Voz & Preferências de Resposta */}
      {activeTab === 'voice' && (
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="jarvis-settings-subcard" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="jarvis-setting-row">
              <div className="jarvis-setting-row__info">
                <div className="jarvis-setting-row__title">
                  Escuta contínua por nome (&ldquo;Ei {previewName}&rdquo;)
                </div>
                <div className="jarvis-setting-row__desc">
                  Mantém o navegador atento ao nome escolhido. Ao chamar &ldquo;Ei {previewName}&rdquo;, o painel de voz abre sozinho sem precisar clicar.
                </div>
              </div>
              <div className="jarvis-setting-row__control">
                <button
                  type="button"
                  role="switch"
                  aria-checked={wakeWordEnabled}
                  aria-label={`Ativar escuta contínua Ei ${previewName}`}
                  onClick={() => {
                    const next = !wakeWordEnabled;
                    setWakeWordEnabled(next);
                    setWakeWordEnabledPref(next);
                    notify(
                      next
                        ? `Escuta mãos-livres ativada para "Ei ${previewName}".`
                        : 'Escuta mãos-livres desativada.',
                      'info'
                    );
                  }}
                  className={`jarvis-switch ${wakeWordEnabled ? 'is-checked' : ''}`}
                >
                  <span className="jarvis-switch__thumb" />
                </button>
              </div>
            </div>

            <div className="jarvis-setting-row" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
              <div className="jarvis-setting-row__info">
                <div className="jarvis-setting-row__title">Responder falando em voz alta</div>
                <div className="jarvis-setting-row__desc">
                  Quando você usa o microfone ou chama &ldquo;Ei {previewName}&rdquo;, o assistente lê a resposta em voz alta automaticamente.
                </div>
              </div>
              <div className="jarvis-setting-row__control">
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoSpeakEnabled}
                  aria-label="Ativar resposta falada automática"
                  onClick={() => {
                    const next = !autoSpeakEnabled;
                    setAutoSpeakEnabled(next);
                    setVoiceAutoSpeakPref(next);
                  }}
                  className={`jarvis-switch ${autoSpeakEnabled ? 'is-checked' : ''}`}
                >
                  <span className="jarvis-switch__thumb" />
                </button>
              </div>
            </div>
          </div>

          <div className="jarvis-settings-subcard" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Como {previewName} deve responder?
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '8px' }}>
              {RESPONSE_STYLES.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={profile.responseStyle === opt.id}
                  onClick={() => setProfile((prev) => ({ ...prev, responseStyle: opt.id }))}
                  className={`jarvis-choice-card ${profile.responseStyle === opt.id ? 'is-active' : ''}`}
                >
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{opt.label}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.38 }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <fieldset
            disabled={!canEditProfile}
            style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            <div>
              <label htmlFor="profile-user-background" className="user-profile-field-label">
                O que {previewName} deve lembrar sobre você? (opcional)
              </label>
              <textarea
                id="profile-user-background"
                rows={2}
                value={profile.userBackground}
                onChange={(e) => setProfile({ ...profile, userBackground: e.target.value })}
                className="jarvis-textarea"
                style={{ resize: 'vertical' }}
                placeholder="Ex: Sou empreendedor(a), estudo inglês toda manhã e gosto de listas práticas."
              />
            </div>

            <div>
              <label htmlFor="profile-response-guidelines" className="user-profile-field-label">
                Regras extras de preferência (opcional)
              </label>
              <textarea
                id="profile-response-guidelines"
                rows={2}
                value={profile.responseGuidelines}
                onChange={(e) => setProfile({ ...profile, responseGuidelines: e.target.value })}
                className="jarvis-textarea"
                style={{ resize: 'vertical' }}
                placeholder="Ex: Prefiro explicações sem jargão técnico e com resumo no final."
              />
            </div>
          </fieldset>

          {canEditProfile && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="submit" disabled={saving} className="btn btn-primary btn-sm">
                <Save size={14} />
                <span>{saving ? 'Salvando…' : 'Salvar Preferências'}</span>
              </button>
            </div>
          )}
        </form>
      )}

      {/* Aba 3: Meus Dados & Backup */}
      {activeTab === 'data' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {isAdmin && (
            <div className="jarvis-settings-subcard">
              <div className="jarvis-setting-row">
                <div className="jarvis-setting-row__info">
                  <div className="jarvis-setting-row__title">Backup completo do Hub</div>
                  <div className="jarvis-setting-row__desc">
                    Cria uma cópia de segurança dos seus agentes, habilidades, fluxos e histórico no servidor.
                  </div>
                </div>
                <div className="jarvis-setting-row__control">
                  <button
                    type="button"
                    onClick={handleBackupDatabase}
                    disabled={backingUp}
                    className="btn btn-secondary btn-sm"
                  >
                    <Database size={14} color="var(--accent-light)" />
                    <span>{backingUp ? 'Gerando Backup...' : 'Fazer Backup'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="jarvis-settings-subcard">
            <div className="jarvis-setting-row">
              <div className="jarvis-setting-row__info">
                <div className="jarvis-setting-row__title">Exportar minhas conversas</div>
                <div className="jarvis-setting-row__desc">
                  Baixa um arquivo JSON com as mensagens salvas neste navegador.
                </div>
              </div>
              <div className="jarvis-setting-row__control">
                <button type="button" onClick={handleExportData} className="btn btn-secondary btn-sm">
                  <Download size={14} />
                  <span>Exportar JSON</span>
                </button>
              </div>
            </div>
          </div>

          {onOpenSetupWizard && (
            <div className="jarvis-settings-subcard">
              <div className="jarvis-setting-row">
                <div className="jarvis-setting-row__info">
                  <div className="jarvis-setting-row__title">Assistente de Configuração Inicial</div>
                  <div className="jarvis-setting-row__desc">
                    Reabra o passo a passo guiado para revisar provedores e preferências iniciais.
                  </div>
                </div>
                <div className="jarvis-setting-row__control">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenSetupWizard();
                    }}
                    className="btn btn-secondary btn-sm"
                  >
                    <Sparkles size={14} />
                    <span>Abrir Assistente</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="jarvis-callout jarvis-callout--danger">
            <div className="jarvis-setting-row">
              <div className="jarvis-setting-row__info">
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#f87171' }}>
                  Limpar Histórico Local
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                  Remove as conversas guardadas localmente neste navegador para a sua conta.
                </div>
              </div>
              <div className="jarvis-setting-row__control">
                <button type="button" onClick={() => setConfirmClearOpen(true)} className="btn btn-danger btn-sm">
                  <Trash2 size={14} />
                  <span>Limpar Dados</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Aba 4: Dispositivos & Celular */}
      {activeTab === 'devices' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="jarvis-settings-subcard">
            <div className="jarvis-setting-row">
              <div className="jarvis-setting-row__info">
                <div className="jarvis-setting-row__title">Conectar Celular Android</div>
                <div className="jarvis-setting-row__desc">
                  Pareie seu smartphone com QR Code para falar com {previewName} de qualquer lugar com acesso exclusivo à sua conta.
                </div>
              </div>
              <div className="jarvis-setting-row__control">
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('jarvis:open-android-pairing'));
                    onClose();
                  }}
                  className="btn btn-primary btn-sm"
                >
                  <Smartphone size={14} />
                  <span>Conectar Celular</span>
                </button>
              </div>
            </div>
          </div>

          <div className="jarvis-settings-subcard">
            <div className="jarvis-setting-row">
              <div className="jarvis-setting-row__info">
                <div className="jarvis-setting-row__title">Contas e Permissões</div>
                <div className="jarvis-setting-row__desc">
                  Gerencie quem tem acesso ao servidor e revogue dispositivos conectados quando precisar.
                </div>
              </div>
              <div className="jarvis-setting-row__control">
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('jarvis:open-access-management'));
                    onClose();
                  }}
                  className="btn btn-secondary btn-sm"
                >
                  <ShieldCheck size={14} />
                  <span>Gerenciar Acessos</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmClearOpen}
        title="Limpar histórico local"
        description="Tem certeza de que deseja apagar o histórico de conversas salvo neste navegador? Esta ação não pode ser desfeita."
        confirmLabel="Apagar histórico"
        tone="danger"
        onConfirm={confirmClearHistory}
        onCancel={() => setConfirmClearOpen(false)}
      />
    </Modal>
  );
};
