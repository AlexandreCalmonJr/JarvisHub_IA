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
import { Modal } from '../../../shared/common/Modal';

const getMethodTone = (method: string) => {
  switch (method) {
    case 'GET':
      return { bg: 'var(--accent-soft)', color: 'var(--accent-light)' };
    case 'POST':
      return { bg: 'var(--success-soft)', color: 'var(--success-color)' };
    case 'DELETE':
      return { bg: 'var(--danger-soft)', color: 'var(--danger-color)' };
    default:
      return { bg: 'var(--warning-soft)', color: 'var(--warning-color)' };
  }
};

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
      setMockEndpoints(Array.isArray(data) ? data : []);
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

  const handleSaveMock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageMocks || savingMock || !newMockPath.trim()) return;
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {!roleLoaded && (
        <div role="status" className="jarvis-callout jarvis-callout--info">
          A verificar permissões do Mock Server…
        </div>
      )}

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
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
            fontSize: '0.82rem',
            color: 'var(--text-secondary)',
          }}
        >
          <span style={{ color: 'var(--accent-light)', fontWeight: 600 }}>Isolado por conta</span>
          <span aria-hidden="true">·</span>
          <span>
            Roteador coringa ativo em{' '}
            <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
              /api/v1/mock/*
            </code>
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={loadMockEndpoints}
            className="btn btn-secondary btn-sm"
            disabled={mockLoading}
            title="Atualizar lista"
          >
            <RefreshCw size={14} className={mockLoading ? 'spin' : ''} />
            <span>Atualizar</span>
          </button>
          {canManageMocks && (
            <button
              type="button"
              onClick={() => setShowMockModal(true)}
              className="btn btn-primary btn-sm"
            >
              <Plus size={14} />
              <span>Novo Endpoint Simulado</span>
            </button>
          )}
        </div>
      </div>

      {mockError && (
        <div
          role="alert"
          className="jarvis-error-banner"
          style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}
        >
          <AlertCircle size={16} color="var(--danger-color)" style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{mockError}</span>
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={loadMockEndpoints}
            disabled={mockLoading}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Lista de Mock Endpoints */}
      <div className="jarvis-settings-card" style={{ padding: 0, overflow: 'hidden', gap: 0 }}>
        {mockLoading && mockEndpoints.length === 0 ? (
          <div className="jarvis-empty-state" style={{ border: 'none', borderRadius: 0 }}>
            <RefreshCw size={20} className="spin" color="var(--text-muted)" />
            <span style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>Carregando endpoints...</span>
          </div>
        ) : mockEndpoints.length === 0 && !mockError ? (
          <div className="jarvis-empty-state" style={{ border: 'none', borderRadius: 0 }}>
            <Server size={28} color="var(--text-muted)" />
            <div style={{ fontWeight: 600, fontSize: '0.94rem', color: 'var(--text-primary)' }}>
              Nenhum mock cadastrado
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
              {canManageMocks
                ? 'Crie rotas simuladas com JSON customizado para testar os seus frontends.'
                : 'Não existem endpoints simulados registados nesta conta.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {mockEndpoints.map((ep, idx) => {
              const tone = getMethodTone(ep.method);
              return (
                <div
                  key={ep.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 18px',
                    borderBottom: idx < mockEndpoints.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                    gap: '14px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 'min(100%, 220px)', flex: 1 }}>
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: '0.72rem',
                        fontFamily: 'var(--font-mono)',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        backgroundColor: tone.bg,
                        color: tone.color,
                        flexShrink: 0,
                      }}
                    >
                      {ep.method}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: '0.88rem',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {ep.path}
                      </div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{ep.name}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <span
                      className="jarvis-tabular"
                      style={{ fontSize: '0.76rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}
                    >
                      HTTP {ep.status_code}
                    </span>
                    {ep.latency_ms > 0 && (
                      <span
                        className="jarvis-tabular"
                        style={{
                          fontSize: '0.76rem',
                          color: 'var(--text-muted)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Clock size={12} />
                        {ep.latency_ms} ms
                      </span>
                    )}

                    {canManageMocks && (
                      <button
                        type="button"
                        onClick={() => handleTestMock(ep.method, ep.path)}
                        className="btn btn-secondary btn-xs"
                        disabled={testLoading}
                      >
                        <Play size={12} />
                        <span>Testar Rota</span>
                      </button>
                    )}

                    {canManageMocks && confirmDeleteId === ep.id && (
                      <>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Excluir este mock?</span>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancelar
                        </button>
                      </>
                    )}
                    {canManageMocks && (
                      <button
                        type="button"
                        onClick={() => handleDeleteMock(ep.id)}
                        className={`btn btn-xs ${
                          confirmDeleteId === ep.id ? 'btn-danger' : 'btn-danger-ghost btn-icon-sm'
                        }`}
                        title={confirmDeleteId === ep.id ? 'Confirmar exclusão' : 'Excluir endpoint simulado'}
                        aria-label={confirmDeleteId === ep.id ? 'Confirmar exclusão' : `Excluir endpoint ${ep.path}`}
                      >
                        {confirmDeleteId === ep.id ? 'Confirmar' : <Trash2 size={14} />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Painel de Resultado do Teste */}
      {testResult && (
        <div
          className="jarvis-settings-card"
          style={{ borderColor: 'var(--border-accent)', gap: '12px' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {testResult.status >= 400 ? (
                <AlertCircle size={17} color="var(--danger-color)" />
              ) : (
                <CheckCircle size={17} color="var(--success-color)" />
              )}
              <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                Resposta ao Vivo da Rota Simulada
              </span>
              <span
                className="jarvis-tabular"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--accent-light)' }}
              >
                HTTP {testResult.status}
              </span>
              <span className="jarvis-tabular" style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                · {testResult.durationMs} ms
              </span>
            </div>
            <button type="button" onClick={() => setTestResult(null)} className="btn btn-ghost btn-xs">
              Fechar
            </button>
          </div>

          <pre
            style={{
              margin: 0,
              padding: '12px',
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              fontSize: '0.8rem',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              overflowX: 'auto',
              maxHeight: '220px',
            }}
          >
            {JSON.stringify(testResult.body, null, 2)}
          </pre>
        </div>
      )}

      {/* Modal Criar Novo Mock Endpoint */}
      <Modal
        isOpen={canManageMocks && showMockModal}
        onClose={() => setShowMockModal(false)}
        title="Novo Endpoint Simulado"
        subtitle="Configure método, status HTTP, latência e payload JSON para a rota simulada."
        icon={<Server size={18} color="var(--accent-light)" />}
        maxWidth="md"
      >
        <form onSubmit={handleSaveMock} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label htmlFor="mock-name-input" className="user-profile-field-label">
              Nome Amigável
            </label>
            <input
              id="mock-name-input"
              type="text"
              placeholder="Ex: Consulta de Usuários"
              value={newMockName}
              onChange={(e) => setNewMockName(e.target.value)}
              className="jarvis-input"
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))',
              gap: '12px',
            }}
          >
            <div>
              <label htmlFor="mock-method-select" className="user-profile-field-label">
                Método
              </label>
              <select
                id="mock-method-select"
                value={newMockMethod}
                onChange={(e) => setNewMockMethod(e.target.value)}
                className="jarvis-select"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
                <option value="PATCH">PATCH</option>
              </select>
            </div>

            <div>
              <label htmlFor="mock-path-input" className="user-profile-field-label">
                Caminho da Rota *
              </label>
              <input
                id="mock-path-input"
                type="text"
                placeholder="/api/usuarios"
                value={newMockPath}
                onChange={(e) => setNewMockPath(e.target.value)}
                className="jarvis-input"
                style={{ fontFamily: 'var(--font-mono)' }}
                required
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
            <div>
              <label htmlFor="mock-status-input" className="user-profile-field-label">
                Status HTTP
              </label>
              <input
                id="mock-status-input"
                type="number"
                min={100}
                max={599}
                value={newMockStatus}
                onChange={(e) => setNewMockStatus(Number(e.target.value))}
                className="jarvis-input jarvis-tabular"
              />
            </div>

            <div>
              <label htmlFor="mock-latency-range" className="user-profile-field-label jarvis-tabular">
                Latência Artificial ({newMockLatency} ms)
              </label>
              <input
                id="mock-latency-range"
                type="range"
                min="0"
                max="3000"
                step="50"
                value={newMockLatency}
                onChange={(e) => setNewMockLatency(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent-color)', marginTop: '10px' }}
              />
            </div>
          </div>

          <div>
            <label htmlFor="mock-body-textarea" className="user-profile-field-label">
              Corpo da Resposta (JSON)
            </label>
            <textarea
              id="mock-body-textarea"
              rows={6}
              value={newMockBody}
              onChange={(e) => setNewMockBody(e.target.value)}
              className="jarvis-textarea"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
            <button type="button" onClick={() => setShowMockModal(false)} className="btn btn-secondary btn-sm">
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={savingMock || !newMockPath.trim()}
            >
              {savingMock ? 'A guardar…' : 'Salvar Endpoint'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
