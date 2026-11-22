import React, { FormEvent, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Lock,
  X,
  ShieldCheck,
  Smartphone,
  Users,
  ChevronDown,
  ChevronUp,
  UserPlus,
  LogIn,
  Sparkles,
} from 'lucide-react';
import { clearActiveAccountScope, setActiveAccountScope } from '../../services/accountScope';
import { apiFetch, clearClientSessionToken, setClientSessionToken } from '../../services/sessionTransport';
import { getUserRoleLabel } from '../../types';
import { signInWithGooglePopup, signOutFirebase } from '../../services/firebase';
import {
  ASSISTANT_NAME_PRESETS,
  WorkspaceExperienceMode,
  normalizeAssistantName,
} from '../../services/assistantIdentity';

type PrimaryTab = 'login' | 'register';
type AdvancedMode = 'bootstrap' | 'admin';

interface AuthGateProps {
  children: React.ReactNode;
}
interface SessionInfo {
  subject_id?: string;
  user_id?: string;
  role?: string;
}
interface UserRecord {
  username: string;
  display_name: string;
  role: 'admin' | 'developer' | 'auditor';
  is_active: boolean;
  created_at: string;
}
interface PublicProfileCard {
  username: string;
  display_name: string;
  assistant_name: string;
  experience_mode: WorkspaceExperienceMode;
  role: 'admin' | 'developer' | 'auditor';
  avatar_icon: string;
}

export const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  const [status, setStatus] = useState<'checking' | 'anonymous' | 'authenticated'>('checking');
  const [primaryTab, setPrimaryTab] = useState<PrimaryTab>('login');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedMode, setAdvancedMode] = useState<AdvancedMode>('admin');

  // Login form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState('');

  // Public profile selector ("Quem está usando?")
  const [profileCards, setProfileCards] = useState<PublicProfileCard[]>([]);

  // Simplified personal / household registration state
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regAssistantName, setRegAssistantName] = useState('Maria');
  const [regMode, setRegMode] = useState<WorkspaceExperienceMode>('simple');

  // Active session & modals
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [accessOpen, setAccessOpen] = useState(false);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [newUser, setNewUser] = useState({
    username: '',
    display_name: '',
    password: '',
    role: 'developer' as 'admin' | 'developer' | 'auditor',
  });
  const [accessBusy, setAccessBusy] = useState(false);
  const [accessMessage, setAccessMessage] = useState('');
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [deviceOpen, setDeviceOpen] = useState(false);
  const [deviceName, setDeviceName] = useState('Meu Android');
  const [deviceToken, setDeviceToken] = useState('');
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [deviceError, setDeviceError] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');

  const loadPublicProfiles = async () => {
    try {
      const response = await apiFetch('/api/v1/auth/profiles', {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;
      const payload = await response.json();
      if (Array.isArray(payload?.profiles)) {
        setProfileCards(payload.profiles);
      }
    } catch {}
  };

  const verifySession = async (): Promise<boolean> => {
    try {
      const response = await apiFetch('/api/v1/auth/me', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        clearClientSessionToken();
        clearActiveAccountScope();
        setStatus('anonymous');
        setSession(null);
        void loadPublicProfiles();
        return false;
      }
      const nextSession = (await response.json()) as SessionInfo;
      const accountId = nextSession.user_id || nextSession.subject_id;
      if (!accountId) throw new Error('A sessão não identificou a conta autenticada.');
      setActiveAccountScope(accountId);
      setSession(nextSession);
      setStatus('authenticated');
      return true;
    } catch {
      clearClientSessionToken();
      clearActiveAccountScope();
      setStatus('anonymous');
      setSession(null);
      void loadPublicProfiles();
      return false;
    }
  };

  useEffect(() => {
    void verifySession();
  }, []);

  useEffect(() => {
    const handleOpenAndroid = () => {
      setDeviceOpen(true);
      setDeviceToken('');
      setDeviceError('');
    };
    const handleOpenAccess = () => {
      setAccessOpen(true);
    };
    const handleLogout = () => {
      void logout();
    };
    window.addEventListener('jarvis:open-android-pairing', handleOpenAndroid);
    window.addEventListener('jarvis:open-access-management', handleOpenAccess);
    window.addEventListener('jarvis:logout', handleLogout);
    return () => {
      window.removeEventListener('jarvis:open-android-pairing', handleOpenAndroid);
      window.removeEventListener('jarvis:open-access-management', handleOpenAccess);
      window.removeEventListener('jarvis:logout', handleLogout);
    };
  }, []);

  const submitAccountLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch('/api/v1/auth/password-login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'Utilizador ou senha inválidos.');
      if (typeof payload.session_token === 'string' && payload.session_token) {
        setClientSessionToken(payload.session_token);
      }
      setPassword('');
      const ok = await verifySession();
      if (!ok) {
        throw new Error('Sessão criada, mas o navegador bloqueou a verificação. Tente novamente.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha de comunicação com o servidor.');
    } finally {
      setBusy(false);
    }
  };

  const submitPersonalRegistration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch('/api/v1/auth/register-personal', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          display_name: regDisplayName.trim(),
          username: regUsername.trim().toLowerCase(),
          password: regPassword,
          assistant_name: normalizeAssistantName(regAssistantName),
          experience_mode: regMode,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'Não foi possível criar sua conta.');
      if (typeof payload.session_token === 'string' && payload.session_token) {
        setClientSessionToken(payload.session_token);
      }
      setRegPassword('');
      const ok = await verifySession();
      if (!ok) {
        throw new Error('Conta criada, mas não foi possível iniciar a sessão.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erro ao criar conta pessoal.');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleBusy(true);
    setError('');
    try {
      const fbUser = await signInWithGooglePopup();
      const response = await apiFetch('/api/v1/auth/firebase-session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          uid: fbUser.uid,
          email: fbUser.email || '',
          display_name: fbUser.displayName || 'Usuário',
          email_verified: fbUser.emailVerified,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'Não foi possível concluir o login com Google.');
      if (typeof payload.session_token === 'string' && payload.session_token) {
        setClientSessionToken(payload.session_token);
      }
      const ok = await verifySession();
      if (!ok) {
        throw new Error('Sessão Google iniciada, mas falhou ao validar o workspace.');
      }
    } catch (cause: any) {
      const code = cause?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setError('Login com Google cancelado.');
      } else {
        setError(cause instanceof Error ? cause.message : 'Não foi possível entrar com o Google.');
      }
    } finally {
      setGoogleBusy(false);
    }
  };

  const submitAdvancedToken = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const endpoint =
        advancedMode === 'bootstrap' ? '/api/v1/auth/bootstrap/exchange' : '/api/v1/auth/login';
      const response = await apiFetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'Token inválido.');
      if (typeof payload.session_token === 'string' && payload.session_token) {
        setClientSessionToken(payload.session_token);
      }
      setToken('');
      const ok = await verifySession();
      if (!ok) {
        throw new Error('Sessão criada, mas falhou a verificação.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao validar token.');
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    try {
      await apiFetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
      await signOutFirebase().catch(() => {});
    } finally {
      clearClientSessionToken();
      clearActiveAccountScope();
      setSession(null);
      setStatus('anonymous');
      void loadPublicProfiles();
    }
  };

  const loadUsers = async () => {
    const response = await apiFetch('/api/v1/auth/users', { credentials: 'include' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'Não foi possível carregar os utilizadores.');
    setUsers(payload.users || []);
  };

  useEffect(() => {
    if (accessOpen && session?.role === 'admin') {
      void loadUsers().catch((cause) => setAccessMessage(cause.message));
    }
  }, [accessOpen, session?.role]);

  const createUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAccessBusy(true);
    setAccessMessage('');
    try {
      const response = await apiFetch('/api/v1/auth/users', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'Não foi possível criar a conta.');
      setNewUser({ username: '', display_name: '', password: '', role: 'developer' });
      setAccessMessage('Conta criada. Partilhe o utilizador e a palavra-passe por um canal seguro.');
      await loadUsers();
    } catch (cause) {
      setAccessMessage(cause instanceof Error ? cause.message : 'Erro ao criar conta.');
    } finally {
      setAccessBusy(false);
    }
  };

  const resetUserPassword = (user: UserRecord) => {
    setResetTarget(user.username);
    setResetPassword('');
    setAccessMessage('');
  };

  const submitPasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resetTarget || resetPassword.length < 12) {
      setAccessMessage('A palavra-passe precisa de pelo menos 12 caracteres.');
      return;
    }
    setAccessBusy(true);
    setAccessMessage('');
    try {
      const response = await apiFetch(`/api/v1/auth/users/${encodeURIComponent(resetTarget)}/password`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'Não foi possível redefinir a palavra-passe.');
      setAccessMessage(`Palavra-passe de @${resetTarget} atualizada. As sessões anteriores foram encerradas.`);
      setResetTarget(null);
      setResetPassword('');
    } catch (cause) {
      setAccessMessage(cause instanceof Error ? cause.message : 'Erro ao redefinir palavra-passe.');
    } finally {
      setAccessBusy(false);
    }
  };

  const pairOwnDevice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDeviceBusy(true);
    setDeviceError('');
    try {
      const response = await apiFetch('/api/v1/mobile/pair', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ device_name: deviceName.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'Não foi possível emparelhar o dispositivo.');
      if (!payload.device_token) throw new Error('O servidor não devolveu o token do dispositivo.');
      setDeviceToken(payload.device_token);
      try {
        const qrContent =
          payload.pairing_payload ||
          JSON.stringify({
            hub: 'jarvis-hub',
            v: '3.0.1',
            url: payload.server_url || window.location.origin,
            token: payload.device_token,
            device_name: deviceName.trim(),
          });
        const url = await QRCode.toDataURL(qrContent, {
          width: 200,
          margin: 2,
          color: { dark: '#0b0d12', light: '#ffffff' },
        });
        setQrDataUrl(url);
      } catch {}
    } catch (cause) {
      setDeviceError(cause instanceof Error ? cause.message : 'Falha ao emparelhar o dispositivo.');
    } finally {
      setDeviceBusy(false);
    }
  };

  const closeDevicePairing = () => {
    setDeviceOpen(false);
    setDeviceToken('');
    setQrDataUrl('');
    setDeviceError('');
  };

  const toggleUser = async (user: UserRecord) => {
    setAccessBusy(true);
    setAccessMessage('');
    try {
      const response = await apiFetch(`/api/v1/auth/users/${encodeURIComponent(user.username)}/status`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !user.is_active }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'Não foi possível alterar o acesso.');
      await loadUsers();
    } catch (cause) {
      setAccessMessage(cause instanceof Error ? cause.message : 'Erro ao atualizar conta.');
    } finally {
      setAccessBusy(false);
    }
  };

  if (status === 'checking') {
    return (
      <main style={styles.screen}>
        <section style={styles.panel}>
          <div style={styles.brandRow}>
            <div style={styles.mark}>J</div>
            <div>
              <div style={styles.brand}>JARVIS AI HUB</div>
              <div style={styles.brandSub}>Hub pessoal e multi-agentes</div>
            </div>
          </div>
          <p style={styles.muted}>Verificando sessão segura...</p>
          <div style={styles.progress} />
        </section>
      </main>
    );
  }

  if (status === 'anonymous') {
    return (
      <main style={styles.screen}>
        <section style={styles.panel} aria-labelledby="login-title">
          {/* Brand Header */}
          <div style={styles.brandRow}>
            <div style={styles.mark}>J</div>
            <div>
              <div style={styles.brand}>JARVIS AI HUB</div>
              <div style={styles.brandSub}>Seu assistente pessoal · Obsidian & Laranja</div>
            </div>
          </div>

          <h1 id="login-title" style={styles.title}>
            {primaryTab === 'login' ? 'Bem-vindo de volta' : 'Criar conta pessoal'}
          </h1>
          <p style={styles.muted}>
            {primaryTab === 'login'
              ? 'Entre com o Google ou selecione o seu perfil para continuar com o seu assistente.'
              : 'Crie um espaço privado em segundos e escolha o nome do seu assistente (ex.: Maria, João ou JARVIS).'}
          </p>

          {/* Primary 2-Tab Switcher */}
          <div
            role="tablist"
            aria-label="Tipo de acesso"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '6px',
              padding: '4px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              marginBottom: '18px',
            }}
          >
            <button
              role="tab"
              type="button"
              aria-selected={primaryTab === 'login'}
              className={primaryTab === 'login' ? 'auth-mode-link is-active' : 'auth-mode-link'}
              onClick={() => {
                setPrimaryTab('login');
                setError('');
              }}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <LogIn size={14} />
              <span>Entrar</span>
            </button>
            <button
              role="tab"
              type="button"
              aria-selected={primaryTab === 'register'}
              className={primaryTab === 'register' ? 'auth-mode-link is-active' : 'auth-mode-link'}
              onClick={() => {
                setPrimaryTab('register');
                setError('');
              }}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <UserPlus size={14} />
              <span>Criar conta pessoal</span>
            </button>
          </div>

          {primaryTab === 'login' ? (
            <>
              {/* One-Click Google Sign-In via Firebase */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleBusy || busy}
                className="btn btn-secondary btn-lg btn-block"
                style={{
                  marginBottom: '16px',
                  justifyContent: 'center',
                  borderColor: 'var(--border-hover)',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#EA4335"
                    d="M12 10.2v3.9h5.4c-.2 1.2-1.4 3.6-5.4 3.6-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.1 14.6 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-1.8H12z"
                  />
                </svg>
                <span>{googleBusy ? 'Conectando com Google...' : 'Continuar com Google'}</span>
              </button>

              <div style={styles.dividerRow}>
                <span style={styles.dividerLine} />
                <span style={styles.dividerText}>ou entre com seu perfil</span>
                <span style={styles.dividerLine} />
              </div>

              {/* Visual "Quem está usando?" Quick Profile Cards */}
              {profileCards.length > 0 && (
                <div style={{ marginBottom: '14px' }}>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      marginBottom: '8px',
                    }}
                  >
                    Quem está usando?
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
                      gap: '8px',
                    }}
                  >
                    {profileCards.slice(0, 4).map((card) => {
                      const isSelected = username.trim().toLowerCase() === card.username;
                      return (
                        <button
                          key={card.username}
                          type="button"
                          onClick={() => {
                            setUsername(card.username);
                            setError('');
                            const pwEl = document.getElementById('auth-password');
                            pwEl?.focus();
                          }}
                          aria-pressed={isSelected}
                          className={`jarvis-choice-card ${isSelected ? 'is-active' : ''}`}
                          style={{
                            padding: '9px 11px',
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: '10px',
                            textAlign: 'left',
                          }}
                        >
                          <div
                            style={{
                              width: '30px',
                              height: '30px',
                              borderRadius: '8px',
                              background: isSelected ? 'var(--accent-color)' : 'var(--accent-soft)',
                              color: isSelected ? '#ffffff' : 'var(--accent-light)',
                              border: '1px solid var(--border-accent)',
                              display: 'grid',
                              placeItems: 'center',
                              fontWeight: 700,
                              fontSize: '0.82rem',
                              flexShrink: 0,
                            }}
                          >
                            {card.avatar_icon}
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {card.display_name}
                            </div>
                            <div
                              style={{
                                fontSize: '0.7rem',
                                color: 'var(--text-muted)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {card.assistant_name} · {card.experience_mode === 'simple' ? 'Simples' : 'Completo'}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <form onSubmit={submitAccountLogin} style={styles.form}>
                <div>
                  <label style={styles.label} htmlFor="auth-user">
                    Utilizador
                  </label>
                  <input
                    id="auth-user"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Ex: admin ou seu utilizador"
                    className="jarvis-input"
                    style={styles.input}
                    required
                  />
                </div>
                <div>
                  <label style={styles.label} htmlFor="auth-password">
                    Senha
                  </label>
                  <input
                    id="auth-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Digite sua senha"
                    className="jarvis-input"
                    style={styles.input}
                    required
                  />
                </div>
                {error && (
                  <div role="alert" style={styles.error}>
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={busy || googleBusy}
                  className="btn btn-primary btn-lg btn-block"
                  style={{ marginTop: '4px' }}
                >
                  {busy ? 'Entrando...' : 'Entrar agora'}
                </button>
              </form>

              {/* Collapsible Advanced Access (Admin Token / Bootstrap) */}
              <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowAdvanced((prev) => !prev);
                    setError('');
                  }}
                  aria-expanded={showAdvanced}
                  className="btn btn-ghost btn-xs btn-block btn-between"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <span>Acesso avançado (Token / Primeiro acesso)</span>
                  {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {showAdvanced && (
                  <div style={{ marginTop: '12px', display: 'grid', gap: '10px' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => setAdvancedMode('admin')}
                        className={`btn btn-xs ${advancedMode === 'admin' ? 'btn-secondary is-active' : 'btn-ghost'}`}
                      >
                        Token admin
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdvancedMode('bootstrap')}
                        className={`btn btn-xs ${advancedMode === 'bootstrap' ? 'btn-secondary is-active' : 'btn-ghost'}`}
                      >
                        Primeiro acesso
                      </button>
                    </div>
                    {advancedMode === 'bootstrap' && (
                      <div style={styles.helpBox}>
                        Use o token inicial de ativação gerado pelo administrador para ativar a instância local.
                      </div>
                    )}
                    <form onSubmit={submitAdvancedToken} style={styles.form}>
                      <div>
                        <label style={styles.label} htmlFor="auth-token">
                          {advancedMode === 'bootstrap'
                            ? 'Token inicial de ativação'
                            : 'Token de administrador'}
                        </label>
                        <input
                          id="auth-token"
                          type="password"
                          autoComplete="off"
                          value={token}
                          onChange={(e) => setToken(e.target.value)}
                          placeholder="Cole o token de acesso"
                          className="jarvis-input"
                          style={styles.input}
                          required
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={busy}
                        className="btn btn-secondary btn-block"
                      >
                        {busy ? 'Validando...' : 'Validar token'}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </>
          ) : (
            <form onSubmit={submitPersonalRegistration} style={styles.form}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={styles.label} htmlFor="reg-name">
                    Seu nome
                  </label>
                  <input
                    id="reg-name"
                    value={regDisplayName}
                    onChange={(e) => setRegDisplayName(e.target.value)}
                    placeholder="Ex: Ana Clara"
                    className="jarvis-input"
                    style={styles.input}
                    minLength={2}
                    maxLength={80}
                    required
                  />
                </div>
                <div>
                  <label style={styles.label} htmlFor="reg-username">
                    Utilizador
                  </label>
                  <input
                    id="reg-username"
                    autoComplete="username"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value.replace(/[^a-zA-Z0-9._-]/g, ''))}
                    placeholder="Ex: ana"
                    className="jarvis-input"
                    style={styles.input}
                    minLength={3}
                    maxLength={32}
                    required
                  />
                </div>
              </div>

              <div>
                <label style={styles.label} htmlFor="reg-password">
                  Escolha uma senha (mín. 8 caracteres)
                </label>
                <input
                  id="reg-password"
                  type="password"
                  autoComplete="new-password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Mínimo de 8 caracteres"
                  className="jarvis-input"
                  style={styles.input}
                  minLength={8}
                  required
                />
              </div>

              <div
                style={{
                  padding: '12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  display: 'grid',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  <Sparkles size={14} color="var(--accent-light)" />
                  <span>Como você quer chamar seu assistente?</span>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {ASSISTANT_NAME_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => setRegAssistantName(preset.name)}
                      className={`btn btn-xs ${
                        regAssistantName.trim() === preset.name ? 'btn-secondary is-active' : 'btn-ghost'
                      }`}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
                <input
                  id="reg-assistant-name"
                  aria-label="Nome do assistente"
                  value={regAssistantName}
                  onChange={(e) => setRegAssistantName(e.target.value)}
                  placeholder="Ou digite qualquer nome (ex: Maria, João...)"
                  className="jarvis-input"
                  maxLength={40}
                  required
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <button
                    type="button"
                    aria-pressed={regMode === 'simple'}
                    onClick={() => setRegMode('simple')}
                    className={`jarvis-choice-card ${regMode === 'simple' ? 'is-active' : ''}`}
                    style={{ padding: '8px 10px' }}
                  >
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Modo Simples
                    </div>
                    <div style={{ fontSize: '0.69rem', color: 'var(--text-secondary)' }}>
                      Pessoal & Estudos
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-pressed={regMode === 'engineering'}
                    onClick={() => setRegMode('engineering')}
                    className={`jarvis-choice-card ${regMode === 'engineering' ? 'is-active' : ''}`}
                    style={{ padding: '8px 10px' }}
                  >
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Modo Completo
                    </div>
                    <div style={{ fontSize: '0.69rem', color: 'var(--text-secondary)' }}>
                      Engenharia & Código
                    </div>
                  </button>
                </div>
              </div>

              {error && (
                <div role="alert" style={styles.error}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="btn btn-primary btn-lg btn-block"
                style={{ marginTop: '2px' }}
              >
                {busy
                  ? 'Preparando seu espaço...'
                  : `Criar conta e conversar com ${normalizeAssistantName(regAssistantName)}`}
              </button>
            </form>
          )}

          <div style={styles.securityNote}>
            <Lock size={15} color="var(--accent-light)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>
              Cada conta tem memória, conversas e assistente isolados com segurança. Você pode alternar entre Modo Simples e Completo quando quiser.
            </span>
          </div>
        </section>
      </main>
    );
  }

  return (
    <>
      {children}

      {deviceOpen && (session?.role === 'admin' || session?.role === 'developer') && (
        <div style={styles.overlay} role="presentation" onClick={closeDevicePairing}>
          <section
            style={styles.accessPanel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="device-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div style={styles.accessHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="jarvis-page-header-icon">
                  <Smartphone size={18} />
                </div>
                <div>
                  <h2 id="device-title" style={styles.accessTitle}>
                    Conectar app Android
                  </h2>
                  <p style={styles.headerSub}>Dispositivo pessoal vinculado à sua conta</p>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={closeDevicePairing}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            {!deviceToken ? (
              <>
                <p style={styles.mutedSmall}>
                  Gere um token pessoal. O dispositivo ficará associado apenas à sua conta e não poderá consultar dados de outros utilizadores.
                </p>
                <form onSubmit={pairOwnDevice} style={styles.form}>
                  <div>
                    <label style={styles.label} htmlFor="device-name">
                      Nome do dispositivo
                    </label>
                    <input
                      id="device-name"
                      value={deviceName}
                      onChange={(e) => setDeviceName(e.target.value)}
                      className="jarvis-input"
                      style={styles.input}
                      maxLength={100}
                      required
                    />
                  </div>
                  {deviceError && (
                    <div role="alert" style={styles.error}>
                      {deviceError}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={deviceBusy}
                    className="btn btn-primary btn-lg btn-block"
                    style={{ marginTop: '4px' }}
                  >
                    {deviceBusy ? 'Emparelhando...' : 'Gerar token do dispositivo'}
                  </button>
                </form>
              </>
            ) : (
              <div style={{ display: 'grid', gap: 14, textAlign: 'center' }}>
                <p style={styles.mutedSmall}>
                  Escaneie o QR Code pelo aplicativo mobile ou copie o token abaixo para concluir o pareamento.
                </p>
                {qrDataUrl && (
                  <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
                    <div
                      style={{
                        background: '#ffffff',
                        padding: '12px',
                        borderRadius: '12px',
                        display: 'inline-block',
                      }}
                    >
                      <img
                        src={qrDataUrl}
                        alt="QR Code de Pareamento"
                        style={{ width: 180, height: 180, display: 'block' }}
                      />
                    </div>
                  </div>
                )}
                <input
                  aria-label="Token do dispositivo"
                  readOnly
                  value={deviceToken}
                  className="jarvis-input mono"
                  style={{ textAlign: 'center' }}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-secondary" onClick={closeDevicePairing}>
                    Concluído
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void navigator.clipboard.writeText(deviceToken)}
                  >
                    Copiar token
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {accessOpen && session?.role === 'admin' && (
        <div style={styles.overlay} role="presentation" onClick={() => setAccessOpen(false)}>
          <section
            style={styles.accessPanel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="access-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div style={styles.accessHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="jarvis-page-header-icon">
                  <Users size={18} />
                </div>
                <div>
                  <h2 id="access-title" style={styles.accessTitle}>
                    Gestão de acessos
                  </h2>
                  <p style={styles.headerSub}>Administração de contas locais</p>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setAccessOpen(false)}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <p style={styles.mutedSmall}>
              Crie ou gerencie contas individuais para membros da família ou equipe.
            </p>

            <form onSubmit={createUser} style={styles.form}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '10px',
                }}
              >
                <div>
                  <label style={styles.label}>Nome de utilizador</label>
                  <input
                    value={newUser.username}
                    onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                    className="jarvis-input"
                    minLength={3}
                    maxLength={48}
                    pattern="[a-zA-Z0-9._-]+"
                    required
                  />
                </div>
                <div>
                  <label style={styles.label}>Nome apresentado</label>
                  <input
                    value={newUser.display_name}
                    onChange={(e) => setNewUser({ ...newUser, display_name: e.target.value })}
                    className="jarvis-input"
                    minLength={2}
                    maxLength={100}
                    required
                  />
                </div>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '10px',
                }}
              >
                <div>
                  <label style={styles.label}>Palavra-passe inicial (mín. 12)</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    className="jarvis-input"
                    minLength={12}
                    required
                  />
                </div>
                <div>
                  <label style={styles.label}>Perfil de acesso</label>
                  <select
                    value={newUser.role}
                    onChange={(e) =>
                      setNewUser({ ...newUser, role: e.target.value as 'admin' | 'developer' | 'auditor' })
                    }
                    className="jarvis-select"
                  >
                    <option value="admin">Administrador — controlo total</option>
                    <option value="developer">Desenvolvedor — acesso de trabalho</option>
                    <option value="auditor">Auditor — apenas leitura</option>
                  </select>
                </div>
              </div>
              <button
                type="submit"
                disabled={accessBusy}
                className="btn btn-primary btn-lg btn-block"
                style={{ marginTop: '4px' }}
              >
                {accessBusy ? 'Criando...' : 'Criar conta'}
              </button>
            </form>

            {resetTarget && (
              <form onSubmit={submitPasswordReset} style={styles.resetForm}>
                <strong style={{ fontSize: '0.84rem', color: 'var(--text-primary)' }}>
                  Nova palavra-passe para @{resetTarget}
                </strong>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  className="jarvis-input"
                  minLength={12}
                  placeholder="Mínimo de 12 caracteres"
                  required
                />
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setResetTarget(null);
                      setResetPassword('');
                    }}
                  >
                    Cancelar
                  </button>
                  <button type="submit" disabled={accessBusy} className="btn btn-primary">
                    {accessBusy ? 'Salvando...' : 'Salvar senha'}
                  </button>
                </div>
              </form>
            )}

            {accessMessage && (
              <div role="status" style={styles.accessMessage}>
                <ShieldCheck size={14} color="var(--accent-light)" style={{ flexShrink: 0 }} />
                <span>{accessMessage}</span>
              </div>
            )}

            <h3 style={styles.listTitle}>Contas registadas ({users.length})</h3>
            <div style={{ display: 'grid', gap: '8px' }}>
              {users.map((user) => (
                <div key={user.username} style={styles.userRow}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.86rem', color: 'var(--text-primary)' }}>
                      {user.display_name}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', marginTop: '2px' }}>
                      @{user.username} · {getUserRoleLabel(user.role)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      disabled={accessBusy}
                      onClick={() => void resetUserPassword(user)}
                      className="btn btn-secondary btn-sm"
                    >
                      Redefinir senha
                    </button>
                    <button
                      type="button"
                      disabled={accessBusy}
                      onClick={() => void toggleUser(user)}
                      className={user.is_active ? 'btn btn-danger btn-sm' : 'btn btn-secondary btn-sm'}
                    >
                      {user.is_active ? 'Desativar' : 'Ativar'}
                    </button>
                  </div>
                </div>
              ))}
              {users.length === 0 && <p style={styles.mutedSmall}>Ainda não existem contas locais.</p>}
            </div>
          </section>
        </div>
      )}
    </>
  );
};

const styles: Record<string, React.CSSProperties> = {
  screen: {
    minHeight: '100dvh',
    display: 'grid',
    placeItems: 'center',
    padding: 'clamp(16px, 4vw, 32px)',
    backgroundColor: 'var(--bg-primary)',
    backgroundImage:
      'radial-gradient(circle at 50% 0%, rgba(249, 115, 22, 0.11) 0%, transparent 54%)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-sans)',
  },
  panel: {
    width: 'min(100%, 468px)',
    padding: 'clamp(22px, 4.5vw, 34px)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-xl)',
    background: 'var(--bg-secondary)',
    boxShadow: 'var(--shadow-lg)',
  },
  brandRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '20px',
  },
  mark: {
    width: '40px',
    height: '40px',
    display: 'grid',
    placeItems: 'center',
    borderRadius: '10px',
    background: 'linear-gradient(135deg, #f97316 0%, #c2410c 100%)',
    fontSize: '1.2rem',
    fontWeight: 700,
    color: '#ffffff',
    flexShrink: 0,
    boxShadow: '0 4px 14px rgba(249, 115, 22, 0.28)',
  },
  brand: {
    color: 'var(--text-primary)',
    fontSize: '0.92rem',
    letterSpacing: '0.04em',
    fontWeight: 700,
    lineHeight: 1.2,
  },
  brandSub: {
    color: 'var(--text-muted)',
    fontSize: '0.76rem',
    marginTop: '2px',
  },
  title: {
    fontSize: '1.45rem',
    fontWeight: 700,
    letterSpacing: '-0.025em',
    margin: '0 0 6px',
    color: 'var(--text-primary)',
  },
  muted: {
    color: 'var(--text-secondary)',
    fontSize: '0.86rem',
    lineHeight: 1.5,
    margin: '0 0 18px',
  },
  mutedSmall: {
    color: 'var(--text-secondary)',
    fontSize: '0.84rem',
    lineHeight: 1.55,
    margin: '0 0 16px',
  },
  dividerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '14px',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    background: 'var(--border-color)',
  },
  dividerText: {
    fontSize: '0.74rem',
    color: 'var(--text-muted)',
  },
  form: {
    display: 'grid',
    gap: '12px',
  },
  helpBox: {
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-secondary)',
    fontSize: '0.78rem',
    lineHeight: 1.5,
  },
  label: {
    display: 'block',
    color: 'var(--text-secondary)',
    fontSize: '0.78rem',
    fontWeight: 500,
    marginBottom: '5px',
  },
  input: {
    minHeight: '40px',
  },
  error: {
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    background: 'var(--danger-soft)',
    border: '1px solid rgba(239, 68, 68, 0.35)',
    color: '#fecaca',
    fontSize: '0.82rem',
  },
  securityNote: {
    display: 'flex',
    gap: '10px',
    alignItems: 'flex-start',
    marginTop: '18px',
    padding: '11px 12px',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border-subtle)',
    color: 'var(--text-secondary)',
    fontSize: '0.76rem',
    lineHeight: 1.48,
  },
  progress: {
    height: '3px',
    borderRadius: '999px',
    background: 'var(--accent-color)',
    marginTop: '18px',
    animation: 'pulse 1.4s ease-in-out infinite',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 4000,
    display: 'grid',
    placeItems: 'center',
    padding: '18px',
    background: 'rgba(5, 7, 11, 0.78)',
    backdropFilter: 'blur(6px)',
  },
  accessPanel: {
    width: 'min(100%, 580px)',
    maxHeight: 'min(90vh, 840px)',
    overflowY: 'auto',
    padding: '24px',
    borderRadius: 'var(--radius-xl)',
    border: '1px solid var(--border-color)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    boxShadow: 'var(--shadow-lg)',
  },
  accessHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    paddingBottom: '14px',
    marginBottom: '16px',
    borderBottom: '1px solid var(--border-color)',
  },
  accessTitle: {
    margin: 0,
    fontSize: '1.1rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  headerSub: {
    margin: '2px 0 0',
    fontSize: '0.78rem',
    color: 'var(--text-secondary)',
  },
  accessMessage: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '14px',
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    fontSize: '0.82rem',
  },
  listTitle: {
    margin: '22px 0 10px',
    fontSize: '0.88rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  userRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '10px',
    padding: '12px',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border-color)',
  },
  resetForm: {
    display: 'grid',
    gap: '10px',
    marginTop: '14px',
    padding: '14px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-color)',
    background: 'var(--bg-tertiary)',
  },
};
