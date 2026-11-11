import React, { useState, useEffect } from 'react';
import { API_BASE } from '../../../services/api/client';
import {
  Server,
  Plus,
  Trash2,
  CheckCircle,
  RefreshCw,
  Clock,
  Play,
  AlertCircle,
} from 'lucide-react';
import {
  fetchMockEndpoints,
  saveMockEndpoint,
  deleteMockEndpoint,
} from '../../../api';

export const MockServerSection: React.FC = () => {
  const [mockEndpoints, setMockEndpoints] = useState<any[]>([]);
  const [mockLoading, setMockLoading] = useState(false);
  const [mockError, setMockError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showMockModal, setShowMockModal] = useState(false);
  const [newMockName, setNewMockName] = useState('');
  const [newMockMethod, setNewMockMethod] = useState('GET');
  const [newMockPath, setNewMockPath] = useState('/api/users');
  const [newMockStatus, setNewMockStatus] = useState(200);
  const [newMockLatency, setNewMockLatency] = useState(0);
  const [newMockBody, setNewMockBody] = useState(
    '{\n  "status": "sucesso",\n  "itens": [\n    {"id": 1, "nome": "Item 1"}\n  ]\n}'
  );
  const [testResult, setTestResult] = useState<{
    path: string;
    status: number;
    body: any;
    durationMs: number;
  } | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [canManageMocks, setCanManageMocks] = useState(false);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [savingMock, setSavingMock] = useState(false);

  const loadMockEndpoints = async () => {
    setMockLoading(true);
    try {
      const data = await fetchMockEndpoints();
      setMockEndpoints(data);
      setMockError(null);
    } catch (e: any) {
      setMockError(e?.message || 'Não foi possível carregar os endpoints simulados.');
    } finally {
      setMockLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/auth/me`, { credentials: 'include' })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((principal) => {
        if (!cancelled) {
          setCanManageMocks(
            principal?.kind === 'human' &&
            (principal?.role === 'admin' || principal?.role === 'developer')
          );
          setRoleLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCanManageMocks(false);
          setRoleLoaded(true);
        }
      });
    loadMockEndpoints();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveMock = async () => {
    if (!canManageMocks || savingMock) return;
    setSavingMock(true);
    try {
      let parsedBody: any;
      try {
        parsedBody = JSON.parse(newMockBody);
      } catch {
        parsedBody = newMockBody;
      }

      await saveMockEndpoint({
        name: newMockName.trim() || 'Endpoint Simulado',
        method: newMockMethod,
        path: newMockPath.trim(),
        status_code: Number(newMockStatus),
        latency_ms: Number(newMockLatency),
        response_body: parsedBody,
        enabled: true,
      });

      setShowMockModal(false);
      await loadMockEndpoints();
    } catch (err: any) {
      setMockError(`Erro ao salvar mock endpoint: ${err.message}`);
    } finally {
      setSavingMock(false);
    }
  };

  const handleDeleteMock = async (id: string) => {
    if (!canManageMocks) return;
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    try {
      await deleteMockEndpoint(id);
      setConfirmDeleteId(null);
      await loadMockEndpoints();
    } catch (err: any) {
      setMockError(`Erro ao excluir endpoint: ${err.message}`);
    }
  };

  const handleTestMock = async (method: string, path: string) => {
    if (!canManageMocks) return;
    setTestLoading(true);
    const start = performance.now();
    try {
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      const url = `/api/v1/mock${cleanPath}`;
      const res = await fetch(url, { method, credentials: 'include' });
      const durationMs = Math.round(performance.now() - start);
      const body = await res.json().catch(() => ({}));
      setTestResult({
        path: cleanPath,
        status: res.status,
        body,
        durationMs,
      });
    } catch (err: any) {
      setTestResult({
        path,
        status: 500,
        body: { erro: err.message },
        durationMs: Math.round(performance.now() - start),
      });
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {!roleLoaded && <div role="status" className="glass-panel" style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>A verificar permissões do Mock Server…</div>}
      {/* Barra de Ações do Mock */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="badge badge-info">Isolado por conta</span>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Roteador coringa ativo em <code>/api/v1/mock/*</code>
          </span>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={loadMockEndpoints}
            className="btn btn-ghost"
            disabled={mockLoading}
            title="Atualizar lista"
          >
            <RefreshCw size={15} className={mockLoading ? 'animate-spin' : ''} />
            Atualizar
          </button>
          {canManageMocks && <button
            onClick={() => setShowMockModal(true)}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus size={16} />
            Novo Endpoint Simulado
          </button>}
        </div>
      </div>

      {mockError && (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.35)', background: 'rgba(239, 68, 68, 0.08)', color: 'var(--text-primary)' }}>
          <AlertCircle size={16} color="#f87171" />
          <span style={{ flex: 1, fontSize: '0.84rem' }}>{mockError}</span>
          <button className="btn btn-ghost" onClick={loadMockEndpoints} disabled={mockLoading}>Tentar novamente</button>
        </div>
      )}

      {/* Lista de Mock Endpoints */}
      <div
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          overflow: 'hidden',
        }}
      >
        {mockLoading && mockEndpoints.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>Carregando endpoints...</div>
        ) : mockEndpoints.length === 0 && !mockError ? (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: 'var(--text-secondary)',
            }}
          >
            <Server size={36} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
            <p style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Nenhum mock cadastrado</p>
            <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>
              {canManageMocks ? 'Crie rotas simuladas com JSON customizado para testar os seus frontends.' : 'Não existem endpoints simulados registados nesta conta.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {mockEndpoints.map((ep) => (
              <div
                key={ep.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 20px',
                  borderBottom: '1px solid var(--border-color)',
                  gap: '16px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '240px' }}>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      backgroundColor:
                        ep.method === 'GET'
                          ? 'rgba(59, 130, 246, 0.2)'
                          : ep.method === 'POST'
                          ? 'rgba(16, 185, 129, 0.2)'
                          : ep.method === 'DELETE'
                          ? 'rgba(239, 68, 68, 0.2)'
                          : 'rgba(245, 158, 11, 0.2)',
                      color:
                        ep.method === 'GET'
                          ? '#60a5fa'
                          : ep.method === 'POST'
                          ? '#34d399'
                          : ep.method === 'DELETE'
                          ? '#f87171'
                          : '#fbbf24',
                    }}
                  >
                    {ep.method}
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                      {ep.path}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{ep.name}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  <span className="badge badge-info" style={{ fontFamily: 'monospace' }}>
                    HTTP {ep.status_code}
                  </span>
                  {ep.latency_ms > 0 && (
                    <span
                      style={{
                        fontSize: '0.78rem',
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Clock size={12} />
                      {ep.latency_ms} ms
                    </span>
                  )}

                  {canManageMocks && <button
                    onClick={() => handleTestMock(ep.method, ep.path)}
                    className="btn btn-ghost"
                    style={{
                      fontSize: '0.8rem',
                      padding: '4px 10px',
                      color: 'var(--accent-color)',
                      borderColor: 'var(--border-accent)',
                    }}
                    disabled={testLoading}
                  >
                    <Play size={12} />
                    Testar Rota
                  </button>}

                  {canManageMocks && confirmDeleteId === ep.id && (
                    <>
                      <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Excluir este mock?</span>
                      <button className="btn btn-ghost" onClick={() => setConfirmDeleteId(null)} style={{ padding: '4px 8px' }}>Cancelar</button>
                    </>
                  )}
                  {canManageMocks && <button
                    onClick={() => handleDeleteMock(ep.id)}
                    className="btn btn-ghost"
                    style={{ color: '#ef4444', padding: '6px' }}
                    title={confirmDeleteId === ep.id ? 'Confirmar exclusão' : 'Excluir endpoint simulado'}
                  >
                    {confirmDeleteId === ep.id ? 'Confirmar' : <Trash2 size={15} />}
                  </button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Painel de Resultado do Teste */}
      {testResult && (
        <div
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-accent)',
            borderRadius: '12px',
            padding: '18px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {testResult.status >= 400 ? <AlertCircle size={18} color="var(--danger-color)" /> : <CheckCircle size={18} color="var(--success-color)" />}
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                Resposta ao Vivo da Rota Simulada
              </span>
              <span className="badge badge-info">HTTP {testResult.status}</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {testResult.durationMs} ms
              </span>
            </div>
            <button
              onClick={() => setTestResult(null)}
              className="btn btn-ghost"
              style={{ fontSize: '0.75rem', padding: '2px 8px' }}
            >
              Fechar
            </button>
          </div>

          <pre
            style={{
              margin: 0,
              padding: '12px',
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              borderRadius: '8px',
              fontSize: '0.82rem',
              color: 'var(--text-primary)',
              fontFamily: 'monospace',
              overflowX: 'auto',
              maxHeight: '200px',
            }}
          >
            {JSON.stringify(testResult.body, null, 2)}
          </pre>
        </div>
      )}

      {/* Modal Criar Novo Mock Endpoint */}
      {canManageMocks && showMockModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '16px',
              padding: '24px',
              width: '100%',
              maxWidth: '540px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Novo Endpoint Simulado</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Nome Amigável
              </label>
              <input
                type="text"
                placeholder="Ex: Consulta de Usuários"
                value={newMockName}
                onChange={(e) => setNewMockName(e.target.value)}
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                }}
              />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Método</label>
                <select
                  value={newMockMethod}
                  onChange={(e) => setNewMockMethod(e.target.value)}
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                  }}
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                  <option value="PATCH">PATCH</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Caminho da Rota
                </label>
                <input
                  type="text"
                  placeholder="/api/usuarios"
                  value={newMockPath}
                  onChange={(e) => setNewMockPath(e.target.value)}
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                  }}
                />
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Status HTTP
                </label>
                <input
                  type="number"
                  min={100}
                  max={599}
                  value={newMockStatus}
                  onChange={(e) => setNewMockStatus(Number(e.target.value))}
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Latência Artificial ({newMockLatency} ms)
                </label>
                <input
                  type="range"
                  min="0"
                  max="3000"
                  step="50"
                  value={newMockLatency}
                  onChange={(e) => setNewMockLatency(Number(e.target.value))}
                  style={{ accentColor: 'var(--accent-color)', marginTop: '8px' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Corpo da Resposta (JSON)
              </label>
              <textarea
                rows={6}
                value={newMockBody}
                onChange={(e) => setNewMockBody(e.target.value)}
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--accent-color)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '12px',
                  fontFamily: 'monospace',
                  fontSize: '0.82rem',
                }}
              />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
                marginTop: '8px',
              }}
            >
              <button onClick={() => setShowMockModal(false)} className="btn btn-ghost">
                Cancelar
              </button>
              <button onClick={handleSaveMock} className="btn btn-primary" disabled={savingMock || !newMockPath.trim()}>
                {savingMock ? 'A guardar…' : 'Salvar Endpoint'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
