import React, { FormEvent, useEffect, useState } from 'react';

type AuthMode = 'admin' | 'bootstrap';

interface AuthGateProps {
  children: React.ReactNode;
}

interface SessionInfo {
  subject_id?: string;
  user_id?: string;
  role?: string;
}

export const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  const [status, setStatus] = useState<'checking' | 'anonymous' | 'authenticated'>('checking');
  const [mode, setMode] = useState<AuthMode>('admin');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [session, setSession] = useState<SessionInfo | null>(null);

  const verifySession = async () => {
    try {
      const response = await fetch('/api/v1/auth/me', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        setStatus('anonymous');
        setSession(null);
        return;
      }
      setSession(await response.json());
      setStatus('authenticated');
    } catch {
      setStatus('anonymous');
    }
  };

  useEffect(() => {
    void verifySession();
  }, []);

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token.trim()) {
      setError('Informe o token de acesso.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const endpoint = mode === 'bootstrap'
        ? '/api/v1/auth/bootstrap/exchange'
        : '/api/v1/auth/login';
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || 'Não foi possível autenticar. Verifique o token e tente novamente.');
      }
      setToken('');
      await verifySession();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha de comunicação com o servidor.');
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
    } finally {
      setSession(null);
      setStatus('anonymous');
    }
  };

  if (status === 'checking') {
    return (
      <main style={styles.screen}>
        <div style={styles.panel}>
          <div style={styles.mark}>J</div>
          <h1 style={styles.title}>JARVIS AI HUB</h1>
          <p style={styles.muted}>A verificar sessão segura...</p>
          <div style={styles.progress} />
        </div>
      </main>
    );
  }

  if (status === 'anonymous') {
    return (
      <main style={styles.screen}>
        <section style={styles.panel} aria-labelledby="login-title">
          <div style={styles.mark}>J</div>
          <p style={styles.eyebrow}>AMBIENTE PRIVADO</p>
          <h1 id="login-title" style={styles.title}>Bem-vindo de volta</h1>
          <p style={styles.muted}>Entre com as suas credenciais para aceder ao seu espaço de trabalho.</p>

          <form onSubmit={submitLogin} style={styles.form}>
            <label style={styles.label} htmlFor="auth-mode">Tipo de credencial</label>
            <select id="auth-mode" value={mode} onChange={(e) => setMode(e.target.value as AuthMode)} style={styles.input}>
              <option value="admin">Token de administrador</option>
              <option value="bootstrap">Token inicial de ativação (uso único)</option>
            </select>

            <label style={styles.label} htmlFor="auth-token">Token de acesso</label>
            <input
              id="auth-token"
              type="password"
              autoComplete="current-password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Introduza o token fornecido pelo administrador"
              style={styles.input}
              required
            />
            {error && <div role="alert" style={styles.error}>{error}</div>}
            <button type="submit" disabled={busy} style={{ ...styles.button, opacity: busy ? 0.65 : 1 }}>
              {busy ? 'A autenticar...' : 'Entrar em segurança'}
            </button>
          </form>

          <div style={styles.securityNote}>
            <span aria-hidden="true">🔒</span>
            <span>A sessão é mantida num cookie HttpOnly. O token não é guardado no navegador.</span>
          </div>
          <p style={styles.footer}>JARVIS AI HUB · Acesso protegido</p>
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
        <button type="button" onClick={logout} style={styles.logout}>Terminar sessão</button>
      </div>
    </>
  );
};

const styles: Record<string, React.CSSProperties> = {
  screen: {
    minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24,
    background: 'radial-gradient(ellipse at top, #172554 0%, #0b1120 48%, #070a12 100%)',
    color: '#e5e7eb', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  },
  panel: {
    width: 'min(100%, 430px)', boxSizing: 'border-box', padding: 36,
    border: '1px solid rgba(148,163,184,.2)', borderRadius: 20,
    background: 'rgba(15,23,42,.88)', boxShadow: '0 24px 80px rgba(0,0,0,.4)',
  },
  mark: {
    width: 48, height: 48, display: 'grid', placeItems: 'center', borderRadius: 14,
    background: 'linear-gradient(135deg,#2563eb,#7c3aed)', fontSize: 25, fontWeight: 800,
    color: '#fff', marginBottom: 24,
  },
  eyebrow: { color: '#60a5fa', fontSize: 11, fontWeight: 700, letterSpacing: '.16em', margin: '0 0 8px' },
  title: { fontSize: 26, letterSpacing: '-.04em', margin: '0 0 10px', color: '#f8fafc' },
  muted: { color: '#94a3b8', fontSize: 14, lineHeight: 1.6, margin: '0 0 26px' },
  form: { display: 'grid', gap: 10 },
  label: { color: '#cbd5e1', fontSize: 12, fontWeight: 600, marginTop: 8 },
  input: {
    width: '100%', boxSizing: 'border-box', padding: '12px 13px', borderRadius: 10,
    border: '1px solid #334155', background: '#0b1220', color: '#f8fafc', outline: 'none',
  },
  button: {
    marginTop: 12, padding: '13px 16px', border: 0, borderRadius: 10,
    background: 'linear-gradient(135deg,#2563eb,#4f46e5)', color: '#fff',
    fontWeight: 700, cursor: 'pointer',
  },
  error: { padding: 11, borderRadius: 9, background: 'rgba(127,29,29,.3)', border: '1px solid #7f1d1d', color: '#fecaca', fontSize: 13 },
  securityNote: {
    display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 22, padding: 12,
    borderRadius: 10, background: 'rgba(30,41,59,.65)', color: '#94a3b8', fontSize: 11, lineHeight: 1.5,
  },
  footer: { textAlign: 'center', color: '#64748b', fontSize: 11, margin: '24px 0 0' },
  progress: { height: 3, borderRadius: 3, background: 'linear-gradient(90deg,#2563eb,#818cf8)', marginTop: 24, animation: 'pulse 1.4s infinite' },
  sessionPill: {
    position: 'fixed', right: 16, bottom: 14, zIndex: 3000, display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 11px', borderRadius: 999, background: 'rgba(15,23,42,.94)',
    border: '1px solid rgba(148,163,184,.25)', color: '#cbd5e1', fontSize: 11,
    boxShadow: '0 8px 30px rgba(0,0,0,.25)',
  },
  sessionDot: { width: 7, height: 7, borderRadius: '50%', background: '#22c55e' },
  logout: { border: 0, borderLeft: '1px solid #334155', paddingLeft: 9, background: 'transparent', color: '#93c5fd', cursor: 'pointer', fontSize: 11 },
};
