import React, { FormEvent, useEffect, useState } from 'react';

type LoginMode = 'account' | 'admin' | 'bootstrap';

interface AuthGateProps { children: React.ReactNode; }
interface SessionInfo { subject_id?: string; user_id?: string; role?: string; }
interface UserRecord {
  username: string;
  display_name: string;
  role: 'admin' | 'developer' | 'auditor';
  is_active: boolean;
  created_at: string;
}

export const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  const [status, setStatus] = useState<'checking' | 'anonymous' | 'authenticated'>('checking');
  const [mode, setMode] = useState<LoginMode>('account');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [accessOpen, setAccessOpen] = useState(false);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [newUser, setNewUser] = useState({ username: '', display_name: '', password: '', role: 'developer' as 'admin' | 'developer' | 'auditor' });
  const [accessBusy, setAccessBusy] = useState(false);
  const [accessMessage, setAccessMessage] = useState('');
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');

  const verifySession = async () => {
    try {
      const response = await fetch('/api/v1/auth/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (!response.ok) { setStatus('anonymous'); setSession(null); return; }
      setSession(await response.json());
      setStatus('authenticated');
    } catch { setStatus('anonymous'); }
  };

  useEffect(() => { void verifySession(); }, []);

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const endpoint = mode === 'account' ? '/api/v1/auth/password-login'
        : mode === 'bootstrap' ? '/api/v1/auth/bootstrap/exchange' : '/api/v1/auth/login';
      const body = mode === 'account' ? { username: username.trim(), password } : { token: token.trim() };
      const response = await fetch(endpoint, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'Não foi possível autenticar.');
      setPassword(''); setToken('');
      await verifySession();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha de comunicação com o servidor.');
    } finally { setBusy(false); }
  };

  const logout = async () => {
    try { await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'same-origin' }); }
    finally { setSession(null); setStatus('anonymous'); }
  };

  const loadUsers = async () => {
    const response = await fetch('/api/v1/auth/users', { credentials: 'same-origin' });
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
    setAccessBusy(true); setAccessMessage('');
    try {
      const response = await fetch('/api/v1/auth/users', {
        method: 'POST', credentials: 'same-origin',
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
    } finally { setAccessBusy(false); }
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
    setAccessBusy(true); setAccessMessage('');
    try {
      const response = await fetch(`/api/v1/auth/users/${encodeURIComponent(resetTarget)}/password`, {
        method: 'PUT', credentials: 'same-origin',
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
    } finally { setAccessBusy(false); }
  };

  const toggleUser = async (user: UserRecord) => {
    setAccessBusy(true); setAccessMessage('');
    try {
      const response = await fetch(`/api/v1/auth/users/${encodeURIComponent(user.username)}/status`, {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !user.is_active }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'Não foi possível alterar o acesso.');
      await loadUsers();
    } catch (cause) {
      setAccessMessage(cause instanceof Error ? cause.message : 'Erro ao atualizar conta.');
    } finally { setAccessBusy(false); }
  };

  if (status === 'checking') {
    return <main style={styles.screen}><section style={styles.panel}><div style={styles.mark}>J</div><h1 style={styles.title}>JARVIS AI HUB</h1><p style={styles.muted}>A verificar sessão segura...</p><div style={styles.progress} /></section></main>;
  }

  if (status === 'anonymous') {
    return (
      <main style={styles.screen}>
        <section style={styles.panel} aria-labelledby="login-title">
          <div style={styles.brandRow}><div style={styles.mark}>J</div><span style={styles.brand}>JARVIS <b>AI HUB</b></span></div>
          <p style={styles.eyebrow}>AMBIENTE PRIVADO · ACESSO PROTEGIDO</p>
          <h1 id="login-title" style={styles.title}>Bem-vindo de volta</h1>
          <p style={styles.muted}>Entre na sua conta para continuar o trabalho com o Jarvis e a sua equipa de agentes.</p>
          {mode === 'account' ? (
            <form onSubmit={submitLogin} style={styles.form}>
              <label style={styles.label} htmlFor="auth-user">Utilizador</label>
              <input id="auth-user" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="O seu utilizador" style={styles.input} required />
              <label style={styles.label} htmlFor="auth-password">Palavra-passe</label>
              <input id="auth-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="A sua palavra-passe" style={styles.input} required />
              {error && <div role="alert" style={styles.error}>{error}</div>}
              <button type="submit" disabled={busy} style={styles.button}>{busy ? 'A autenticar...' : 'Entrar no Jarvis'}</button>
            </form>
          ) : (
            <form onSubmit={submitLogin} style={styles.form}>
              <label style={styles.label} htmlFor="auth-token">{mode === 'bootstrap' ? 'Token inicial de ativação' : 'Token de administrador'}</label>
              <input id="auth-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Cole o token de acesso" style={styles.input} required />
              {error && <div role="alert" style={styles.error}>{error}</div>}
              <button type="submit" disabled={busy} style={styles.button}>{busy ? 'A autenticar...' : 'Validar acesso'}</button>
            </form>
          )}
          <div style={styles.modeLinks}>
            <button type="button" onClick={() => { setMode('account'); setError(''); }}>Conta e palavra-passe</button>
            <button type="button" onClick={() => { setMode('bootstrap'); setError(''); }}>Primeiro acesso</button>
            <button type="button" onClick={() => { setMode('admin'); setError(''); }}>Token admin</button>
          </div>
          <div style={styles.securityNote}><span aria-hidden="true">🔒</span><span>As palavras-passe são armazenadas com hash seguro. A sessão utiliza cookie HttpOnly e o navegador não guarda as credenciais.</span></div>
          <p style={styles.footer}>JARVIS AI HUB · Orquestração inteligente multiagente</p>
        </section>
      </main>
    );
  }

  return (
    <>
      {children}
      <div style={styles.sessionPill}>
        <span style={styles.sessionDot} />
        <span>{session?.user_id || session?.subject_id || 'Sessão ativa'} · {session?.role || 'utilizador'}</span>
        {session?.role === 'admin' && <button type="button" onClick={() => setAccessOpen(true)} style={styles.pillButton}>Gerir acessos</button>}
        <button type="button" onClick={logout} style={styles.logout}>Sair</button>
      </div>
      {accessOpen && session?.role === 'admin' && (
        <div style={styles.overlay} role="presentation" onClick={() => setAccessOpen(false)}>
          <section style={styles.accessPanel} role="dialog" aria-modal="true" aria-labelledby="access-title" onClick={(e) => e.stopPropagation()}>
            <div style={styles.accessHeader}><div><p style={styles.eyebrow}>ADMINISTRAÇÃO</p><h2 id="access-title" style={styles.accessTitle}>Gestão de acessos</h2></div><button type="button" style={styles.close} onClick={() => setAccessOpen(false)}>×</button></div>
            <p style={styles.mutedSmall}>Crie uma conta individual para cada pessoa. O registo público está desativado.</p>
            <form onSubmit={createUser} style={styles.userForm}>
              <label style={styles.label}>Nome de utilizador</label>
              <input value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} style={styles.input} minLength={3} maxLength={48} pattern="[a-zA-Z0-9._-]+" required />
              <label style={styles.label}>Nome apresentado</label>
              <input value={newUser.display_name} onChange={(e) => setNewUser({ ...newUser, display_name: e.target.value })} style={styles.input} minLength={2} maxLength={100} required />
              <label style={styles.label}>Palavra-passe inicial (mínimo 12 caracteres)</label>
              <input type="password" autoComplete="new-password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} style={styles.input} minLength={12} required />
              <label style={styles.label}>Perfil de acesso</label>
              <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value as 'admin' | 'developer' | 'auditor' })} style={styles.input}>
                <option value="admin">Administrador — controlo total</option>
                <option value="developer">Desenvolvedor — acesso de trabalho</option>
                <option value="auditor">Auditor — apenas leitura</option>
              </select>
              <button type="submit" disabled={accessBusy} style={styles.button}>{accessBusy ? 'A criar...' : 'Criar conta'}</button>
            </form>
            {resetTarget && (
              <form onSubmit={submitPasswordReset} style={styles.resetForm}>
                <b style={styles.resetHeading}>Nova palavra-passe para @{resetTarget}</b>
                <input type="password" autoComplete="new-password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} style={styles.input} minLength={12} placeholder="Mínimo de 12 caracteres" required />
                <div style={styles.resetActions}>
                  <button type="button" onClick={() => { setResetTarget(null); setResetPassword(''); }} style={styles.cancelButton}>Cancelar</button>
                  <button type="submit" disabled={accessBusy} style={styles.resetConfirmButton}>{accessBusy ? 'A guardar...' : 'Guardar palavra-passe'}</button>
                </div>
              </form>
            )}
            {accessMessage && <p role="status" style={styles.accessMessage}>{accessMessage}</p>}
            <h3 style={styles.listTitle}>Contas registadas</h3>
            <div style={styles.userList}>
              {users.map((user) => <div key={user.username} style={styles.userRow}>
                <div><b>{user.display_name}</b><span style={styles.userMeta}>@{user.username} · {user.role}</span></div>
                <div style={styles.userActions}>
                  <button type="button" disabled={accessBusy} onClick={() => void resetUserPassword(user)} style={styles.resetButton}>Redefinir senha</button>
                  <button type="button" disabled={accessBusy} onClick={() => void toggleUser(user)} style={user.is_active ? styles.disableButton : styles.enableButton}>{user.is_active ? 'Desativar' : 'Ativar'}</button>
                </div>
              </div>)}
              {users.length === 0 && <p style={styles.mutedSmall}>Ainda não existem contas locais.</p>}
            </div>
          </section>
        </div>
      )}
    </>
  );
};

const styles: Record<string, React.CSSProperties> = {
  screen: { minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: 'radial-gradient(ellipse at 50% 0%, #172554 0%, #0b1120 48%, #070a12 100%)', color: '#e5e7eb', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' },
  panel: { width: 'min(100%, 440px)', boxSizing: 'border-box', padding: 36, border: '1px solid rgba(148,163,184,.2)', borderRadius: 22, background: 'rgba(15,23,42,.92)', boxShadow: '0 24px 80px rgba(0,0,0,.45)' },
  brandRow: { display: 'flex', alignItems: 'center', gap: 13, marginBottom: 26 },
  brand: { color: '#f8fafc', fontSize: 15, letterSpacing: '.12em', fontWeight: 600 },
  mark: { width: 48, height: 48, display: 'grid', placeItems: 'center', borderRadius: 14, background: 'linear-gradient(135deg,#2563eb,#7c3aed)', fontSize: 25, fontWeight: 800, color: '#fff' },
  eyebrow: { color: '#60a5fa', fontSize: 10, fontWeight: 700, letterSpacing: '.16em', margin: '0 0 9px' },
  title: { fontSize: 27, letterSpacing: '-.04em', margin: '0 0 10px', color: '#f8fafc' },
  muted: { color: '#94a3b8', fontSize: 13, lineHeight: 1.65, margin: '0 0 25px' },
  mutedSmall: { color: '#94a3b8', fontSize: 12, lineHeight: 1.55, margin: '0 0 18px' },
  form: { display: 'grid', gap: 10 },
  userForm: { display: 'grid', gap: 8 },
  label: { color: '#cbd5e1', fontSize: 11, fontWeight: 650, marginTop: 6 },
  input: { width: '100%', boxSizing: 'border-box', padding: '12px 13px', borderRadius: 10, border: '1px solid #334155', background: '#0b1220', color: '#f8fafc', outline: 'none', fontSize: 13 },
  button: { marginTop: 10, padding: '13px 16px', border: 0, borderRadius: 10, background: 'linear-gradient(135deg,#2563eb,#4f46e5)', color: '#fff', fontWeight: 700, cursor: 'pointer' },
  error: { padding: 11, borderRadius: 9, background: 'rgba(127,29,29,.3)', border: '1px solid #7f1d1d', color: '#fecaca', fontSize: 12 },
  modeLinks: { display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 19 },
  securityNote: { display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 21, padding: 12, borderRadius: 10, background: 'rgba(30,41,59,.65)', color: '#94a3b8', fontSize: 10, lineHeight: 1.5 },
  footer: { textAlign: 'center', color: '#64748b', fontSize: 10, margin: '23px 0 0' },
  progress: { height: 3, borderRadius: 3, background: 'linear-gradient(90deg,#2563eb,#818cf8)', marginTop: 24, animation: 'pulse 1.4s infinite' },
  sessionPill: { position: 'fixed', right: 16, bottom: 14, zIndex: 3000, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', borderRadius: 999, background: 'rgba(15,23,42,.96)', border: '1px solid rgba(148,163,184,.25)', color: '#cbd5e1', fontSize: 11, boxShadow: '0 8px 30px rgba(0,0,0,.25)' },
  sessionDot: { width: 7, height: 7, borderRadius: '50%', background: '#22c55e' },
  pillButton: { border: 0, borderLeft: '1px solid #334155', paddingLeft: 9, background: 'transparent', color: '#93c5fd', cursor: 'pointer', fontSize: 11 },
  logout: { border: 0, borderLeft: '1px solid #334155', paddingLeft: 9, background: 'transparent', color: '#fca5a5', cursor: 'pointer', fontSize: 11 },
  overlay: { position: 'fixed', inset: 0, zIndex: 4000, display: 'grid', placeItems: 'center', padding: 18, background: 'rgba(2,6,23,.78)', backdropFilter: 'blur(8px)' },
  accessPanel: { width: 'min(100%, 560px)', maxHeight: 'min(90vh, 850px)', overflowY: 'auto', boxSizing: 'border-box', padding: 25, borderRadius: 18, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', boxShadow: '0 25px 90px rgba(0,0,0,.5)' },
  accessHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  accessTitle: { margin: 0, fontSize: 23, color: '#f8fafc' },
  close: { border: 0, background: 'transparent', color: '#94a3b8', fontSize: 28, cursor: 'pointer' },
  accessMessage: { padding: 10, borderRadius: 8, background: 'rgba(37,99,235,.12)', color: '#bfdbfe', fontSize: 12 },
  listTitle: { margin: '24px 0 10px', fontSize: 14 },
  userList: { display: 'grid', gap: 8 },
  userRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 11, borderRadius: 9, background: '#172033', border: '1px solid #293548' },
  userMeta: { display: 'block', marginTop: 3, color: '#94a3b8', fontSize: 10 },
  resetForm: { display: 'grid', gap: 9, marginTop: 14, padding: 13, borderRadius: 10, border: '1px solid #334155', background: '#111c30' },
  resetHeading: { fontSize: 12, color: '#e2e8f0' },
  resetActions: { display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' },
  cancelButton: { border: '1px solid #334155', background: 'transparent', color: '#cbd5e1', borderRadius: 7, padding: '8px 11px', cursor: 'pointer', fontSize: 11 },
  resetConfirmButton: { border: 0, background: '#2563eb', color: '#fff', borderRadius: 7, padding: '8px 11px', cursor: 'pointer', fontSize: 11, fontWeight: 650 },
  userActions: { display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' },
  resetButton: { border: '1px solid #334155', background: '#1e293b', color: '#cbd5e1', borderRadius: 7, padding: '7px 10px', cursor: 'pointer', fontSize: 11 },
  disableButton: { border: '1px solid #7f1d1d', background: 'rgba(127,29,29,.2)', color: '#fecaca', borderRadius: 7, padding: '7px 10px', cursor: 'pointer', fontSize: 11 },
  enableButton: { border: '1px solid #166534', background: 'rgba(22,101,52,.2)', color: '#bbf7d0', borderRadius: 7, padding: '7px 10px', cursor: 'pointer', fontSize: 11 },
};
