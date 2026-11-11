import React, { useState, useEffect, useMemo } from 'react';
import {
  ListTodo,
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  Trash2,
  Check,
  Copy,
  Layers,
  Sparkles,
} from 'lucide-react';
import { fetchTasks, deleteTask, purgeTasks } from '../api';
import { notify } from './common/Toast';

const INTENT_MAP: Record<string, { label: string; color: string }> = {
  multi_agent_consensus: { label: 'Mesa Redonda / Consenso', color: 'badge-purple' },
  architecture_analysis: { label: 'Análise Arquitetural', color: 'badge-info' },
  code_generation: { label: 'Geração de Código', color: 'badge-success' },
  code_review: { label: 'Revisão de Código', color: 'badge-warning' },
  security_audit: { label: 'Auditoria de Segurança', color: 'badge-danger' },
  audit: { label: 'Auditoria Técnica', color: 'badge-danger' },
  test_generation: { label: 'Geração de Testes', color: 'badge-info' },
  troubleshooting: { label: 'Diagnóstico Técnico', color: 'badge-warning' },
  project_management: { label: 'Gestão de Projeto', color: 'badge-purple' },
  planejamento: { label: 'Planejamento Geral', color: 'badge-info' },
};

export const TaskManagerView: React.FC = () => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLETED' | 'PENDING'>('ALL');
  const [intentFilter, setIntentFilter] = useState('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);
  const [showPurgeModal, setShowPurgeModal] = useState(false);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const data = await fetchTasks();
      setTasks(data || []);
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e.message || 'Falha ao carregar tarefas.');
      notify(`Erro ao carregar tarefas: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    notify('Copiado para a área de transferência!', 'info');
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleDeleteTask = async (taskId: string) => {
    setDeletingId(taskId);
    try {
      const success = await deleteTask(taskId);
      if (success) {
        notify('Tarefa removida com sucesso.', 'success');
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
      } else {
        notify('Não foi possível remover a tarefa.', 'warning');
      }
    } catch (e: any) {
      notify(`Erro ao remover tarefa: ${e.message}`, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handlePurgeOldTasks = async () => {
    setPurging(true);
    try {
      const res = await purgeTasks(30);
      notify(`${res.purged_count} tarefa(s) antiga(s) expurgada(s) do banco SQLite.`, 'success');
      setShowPurgeModal(false);
      await loadTasks();
    } catch (e: any) {
      notify(`Erro ao expurgar tarefas: ${e.message}`, 'error');
    } finally {
      setPurging(false);
    }
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const q = searchFilter.toLowerCase();
      const matchesSearch =
        !q ||
        (t.prompt && t.prompt.toLowerCase().includes(q)) ||
        (t.id && t.id.toLowerCase().includes(q)) ||
        (t.session_id && t.session_id.toLowerCase().includes(q)) ||
        (t.project_id && t.project_id.toLowerCase().includes(q)) ||
        (t.intent && t.intent.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (statusFilter === 'COMPLETED' && !t.is_completed) return false;
      if (statusFilter === 'PENDING' && t.is_completed) return false;

      if (intentFilter !== 'ALL' && (t.intent || '').toLowerCase() !== intentFilter.toLowerCase()) {
        return false;
      }

      return true;
    });
  }, [tasks, searchFilter, statusFilter, intentFilter]);

  // Estatísticas Rápidas
  const totalCount = tasks.length;
  const completedCount = tasks.filter((t) => t.is_completed).length;
  const pendingCount = totalCount - completedCount;
  const successRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : null;

  const uniqueIntents = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => {
      if (t.intent) set.add(t.intent);
    });
    return Array.from(set);
  }, [tasks]);

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'Data recente';
    try {
      const d = new Date(isoString);
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 className="claude-serif-title" style={{ fontSize: '1.6rem', fontWeight: 500, margin: 0, letterSpacing: '-0.02em' }}>
            Gerenciador de Tarefas
          </h2>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
            Histórico persistido no SQLite (WAL) de deliberações, execuções e checkpoints do monólito
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {totalCount > 0 && (
            <button
              onClick={() => setShowPurgeModal(true)}
              className="btn btn-secondary"
              style={{ fontSize: '0.78rem', padding: '7px 12px' }}
              title="Limpar tarefas com mais de 30 dias de retenção"
            >
              <span>Expurgar Antigas</span>
            </button>
          )}

          <button
            onClick={loadTasks}
            className="btn btn-secondary"
            style={{ fontSize: '0.78rem', padding: '7px 12px' }}
            disabled={loading}
          >
            <span>{loading ? 'Atualizando...' : 'Atualizar'}</span>
          </button>
        </div>
      </div>

      {loadError && (
        <div role="alert" className="glass-card" style={{ padding: '12px 16px', border: '1px solid rgba(248, 113, 113, 0.35)', borderRadius: '10px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
          Não foi possível carregar as tarefas: {loadError}
        </div>
      )}

      {/* Cards de Métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              Total de Tarefas
            </span>
            <Layers size={18} color="#818cf8" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: '8px', color: '#fff' }}>
            {totalCount}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              Concluídas
            </span>
            <CheckCircle2 size={18} color="#10b981" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: '8px', color: '#34d399' }}>
            {completedCount}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              Em Execução / Pendentes
            </span>
            <Clock size={18} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: '8px', color: '#fbbf24' }}>
            {pendingCount}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              Taxa de Sucesso
            </span>
            <Sparkles size={18} color="#06b6d4" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: '8px', color: '#38bdf8' }}>
            {successRate === null ? '—' : `${successRate}%`}
          </div>
        </div>
      </div>

      {/* Barra de Busca e Filtros */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div
          className="glass-panel"
          style={{
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <Search size={18} color="var(--text-secondary)" />
          <input
            type="text"
            placeholder="Buscar por descrição da tarefa, ID, sessão, projeto..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: '0.88rem',
            }}
          />
          {searchFilter && (
            <button
              onClick={() => setSearchFilter('')}
              className="btn btn-ghost"
              style={{ fontSize: '0.75rem', padding: '2px 8px' }}
            >
              Limpar
            </button>
          )}
        </div>

        {/* Chips de Filtro por Status e Tipo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {(
              [
                { id: 'ALL', label: 'Todas' },
                { id: 'COMPLETED', label: 'Concluídas' },
                { id: 'PENDING', label: 'Em Andamento' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                onClick={() => setStatusFilter(item.id)}
                style={{
                  fontSize: '0.75rem',
                  padding: '4px 10px',
                  borderRadius: '8px',
                  border: '1px solid',
                  borderColor: statusFilter === item.id ? '#6366f1' : 'rgba(255, 255, 255, 0.08)',
                  backgroundColor: statusFilter === item.id ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                  color: statusFilter === item.id ? '#818cf8' : 'var(--text-muted)',
                  fontWeight: statusFilter === item.id ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          {uniqueIntents.length > 0 && (
            <>
              <span style={{ color: 'var(--border-color)', margin: '0 4px' }}>|</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setIntentFilter('ALL')}
                  style={{
                    fontSize: '0.75rem',
                    padding: '4px 10px',
                    borderRadius: '8px',
                    border: '1px solid',
                    borderColor: intentFilter === 'ALL' ? '#6366f1' : 'rgba(255, 255, 255, 0.08)',
                    backgroundColor: intentFilter === 'ALL' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                    color: intentFilter === 'ALL' ? '#818cf8' : 'var(--text-muted)',
                    fontWeight: intentFilter === 'ALL' ? 600 : 400,
                    cursor: 'pointer',
                  }}
                >
                  Todas as Intenções
                </button>
                {uniqueIntents.map((intentKey) => {
                  const mapped = INTENT_MAP[intentKey] || {
                    label: intentKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
                    color: 'badge-info',
                  };
                  return (
                    <button
                      key={intentKey}
                      onClick={() => setIntentFilter(intentKey)}
                      style={{
                        fontSize: '0.75rem',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        border: '1px solid',
                        borderColor: intentFilter === intentKey ? '#6366f1' : 'rgba(255, 255, 255, 0.08)',
                        backgroundColor: intentFilter === intentKey ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                        color: intentFilter === intentKey ? '#818cf8' : 'var(--text-muted)',
                        fontWeight: intentFilter === intentKey ? 600 : 400,
                        cursor: 'pointer',
                      }}
                    >
                      {mapped.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Lista de Tarefas */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
          <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px' }} />
          Carregando tarefas do banco de dados...
        </div>
      ) : loadError && tasks.length === 0 ? (
        <div role="status" className="glass-panel" style={{ textAlign: 'center', padding: '36px 24px', color: 'var(--text-secondary)' }}>
          A lista não está disponível. Tente atualizar após verificar a comunicação com o servidor.
        </div>
      ) : filteredTasks.length === 0 ? (
        <div
          className="glass-panel"
          style={{
            textAlign: 'center',
            padding: '48px 24px',
            color: 'var(--text-secondary)',
          }}
        >
          <ListTodo size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Nenhuma tarefa encontrada
          </h3>
          <p style={{ fontSize: '0.84rem', marginTop: '6px' }}>
            Inicie um fluxo técnico no <b>Chat Master</b> para gerar novas deliberações, planos e checkpoints.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredTasks.map((task) => {
            const mappedIntent = INTENT_MAP[task.intent] || {
              label: (task.intent || 'Planejamento Geral').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
              color: 'badge-info',
            };
            const isDeleting = deletingId === task.id;

            return (
              <div
                key={task.id}
                className="glass-panel"
                style={{
                  padding: '16px 20px',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '16px',
                  flexWrap: 'wrap',
                  transition: 'border-color 0.2s, background-color 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', flex: 1, minWidth: '280px' }}>
                  <div
                    style={{
                      padding: '10px',
                      borderRadius: '10px',
                      backgroundColor: task.is_completed ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                      color: task.is_completed ? 'var(--success-color)' : 'var(--warning-color)',
                      flexShrink: 0,
                      marginTop: '2px',
                    }}
                  >
                    {task.is_completed ? <CheckCircle2 size={20} /> : <Clock size={20} />}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span className={`badge ${mappedIntent.color}`} style={{ fontSize: '0.72rem' }}>
                        {mappedIntent.label}
                      </span>
                      <span className={`badge ${task.is_completed ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.72rem' }}>
                        {task.is_completed ? 'Concluída' : 'Em Execução'}
                      </span>
                      {task.project_id && (
                        <span className="badge badge-purple" style={{ fontSize: '0.70rem' }}>
                          Projeto: {task.project_id}
                        </span>
                      )}
                    </div>

                    <p style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                      {task.prompt}
                    </p>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>ID:</span>
                        <code style={{ color: '#e2e8f0', fontFamily: "'JetBrains Mono', monospace" }}>
                          #{String(task.id || '').slice(0, 12)}
                        </code>
                        <button
                          onClick={() => handleCopy(task.id, `tsk-${task.id}`)}
                          className="btn btn-ghost"
                          style={{ padding: '2px 4px', fontSize: '0.68rem' }}
                          title="Copiar ID da tarefa"
                        >
                          {copiedId === `tsk-${task.id}` ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                        </button>
                      </div>

                      {task.session_id && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>Sessão:</span>
                          <code style={{ color: '#818cf8', fontFamily: "'JetBrains Mono', monospace" }}>
                            {String(task.session_id).slice(0, 14)}
                          </code>
                          <button
                            onClick={() => handleCopy(task.session_id, `ses-${task.session_id}`)}
                            className="btn btn-ghost"
                            style={{ padding: '2px 4px', fontSize: '0.68rem' }}
                            title="Copiar ID da sessão de conversa"
                          >
                            {copiedId === `ses-${task.session_id}` ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                          </button>
                        </div>
                      )}

                      <span>Registrado em: {formatDate(task.created_at)}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    onClick={() => handleDeleteTask(task.id)}
                    className="btn btn-ghost"
                    style={{ fontSize: '0.75rem', padding: '6px 10px', color: '#f87171' }}
                    title="Excluir este registro de tarefa"
                    disabled={isDeleting}
                  >
                    <Trash2 size={13} color="#f87171" />
                    <span>{isDeleting ? 'Excluindo...' : 'Remover'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Confirmação para Expurgar Antigas */}
      {showPurgeModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
          onClick={() => setShowPurgeModal(false)}
        >
          <div
            style={{
              maxWidth: '440px',
              width: '100%',
              backgroundColor: '#0f172a',
              border: '1px solid rgba(248, 113, 113, 0.3)',
              borderRadius: '14px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.8)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: 'rgba(248, 113, 113, 0.15)', color: '#f87171' }}>
                <Trash2 size={20} />
              </div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f87171' }}>
                Expurgar Tarefas Antigas?
              </h3>
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Esta ação removerá do banco de dados SQLite todas as tarefas registradas com mais de <b>30 dias</b> de retenção. Tarefas recentes e memórias de projetos ativos não serão afetadas.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button onClick={() => setShowPurgeModal(false)} className="btn btn-secondary" style={{ fontSize: '0.80rem' }} disabled={purging}>
                Cancelar
              </button>
              <button
                onClick={handlePurgeOldTasks}
                className="btn btn-danger"
                style={{ fontSize: '0.80rem', padding: '6px 14px', backgroundColor: '#dc2626', color: '#fff' }}
                disabled={purging}
              >
                {purging ? 'Expurgando...' : 'Confirmar Expurgo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
