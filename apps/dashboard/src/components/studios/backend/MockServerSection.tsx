import React, { useState, useEffect } from 'react';
import {
  Server,
  Plus,
  Trash2,
  CheckCircle,
  RefreshCw,
  Clock,
  Play,
} from 'lucide-react';
import {
  fetchMockEndpoints,
  saveMockEndpoint,
  deleteMockEndpoint,
} from '../../../api';

export const MockServerSection: React.FC = () => {
  const [mockEndpoints, setMockEndpoints] = useState<any[]>([]);
  const [mockLoading, setMockLoading] = useState(false);
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

  const loadMockEndpoints = async () => {
    setMockLoading(true);
    try {
      const data = await fetchMockEndpoints();
      setMockEndpoints(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setMockLoading(false);
    }
  };

  useEffect(() => {
    loadMockEndpoints();
  }, []);

  const handleSaveMock = async () => {
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
      loadMockEndpoints();
    } catch (err: any) {
      alert(`Erro ao salvar mock endpoint: ${err.message}`);
    }
  };

  const handleDeleteMock = async (id: string) => {
    if (!window.confirm('Deseja excluir este endpoint simulado?')) return;
    try {
      await deleteMockEndpoint(id);
      loadMockEndpoints();
    } catch (err: any) {
      alert(`Erro ao excluir: ${err.message}`);
    }
  };

  const handleTestMock = async (method: string, path: string) => {
    setTestLoading(true);
    const start = performance.now();
    try {
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      const url = `/api/v1/mock${cleanPath}`;
      const res = await fetch(url, { method });
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
          <span className="badge badge-info">127.0.0.1 Blindado</span>
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
          <button
            onClick={() => setShowMockModal(true)}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Plus size={16} />
            Novo Endpoint Simulado
          </button>
        </div>
      </div>

      {/* Lista de Mock Endpoints */}
      <div
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          overflow: 'hidden',
        }}
      >
        {mockEndpoints.length === 0 ? (
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
              Crie rotas simuladas com JSON customizado para testar seus frontends.
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

                  <button
                    onClick={() => handleTestMock(ep.method, ep.path)}
                    className="btn btn-ghost"
                    style={{
                      fontSize: '0.8rem',
                      padding: '4px 10px',
                      color: '#818cf8',
                      borderColor: 'rgba(129, 140, 248, 0.3)',
                    }}
                    disabled={testLoading}
                  >
                    <Play size={12} />
                    Testar Rota
                  </button>

                  <button
                    onClick={() => handleDeleteMock(ep.id)}
                    className="btn btn-ghost"
                    style={{ color: '#ef4444', padding: '6px' }}
                    title="Excluir endpoint simulado"
                  >
                    <Trash2 size={15} />
                  </button>
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
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(129, 140, 248, 0.3)',
            borderRadius: '12px',
            padding: '18px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <CheckCircle size={18} color="#34d399" />
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
              color: '#a5b4fc',
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
      {showMockModal && (
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
                  style={{ accentColor: 'var(--primary-color)', marginTop: '8px' }}
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
                  color: '#38bdf8',
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
              <button onClick={handleSaveMock} className="btn btn-primary">
                Salvar Endpoint
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
