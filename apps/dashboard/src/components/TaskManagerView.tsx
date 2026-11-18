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
  Sparkles,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  X,
  AlignLeft,
  Kanban,
  TableProperties,
  Bot,
} from 'lucide-react';
import { fetchTasks, deleteTask, purgeTasks } from '../api';
import { notify } from './common/Toast';
import { Modal } from './common/Modal';
import { API_BASE } from '../services/api/client';
import { humanizeLabel } from '../types';
import { ALL_26_AGENTS } from '../data/agentsCatalog';

const INTENT_MAP: Record<string, { label: string; color: string; border: string }> = {
  multi_agent_consensus: { label: 'Mesa Redonda / Consenso', color: 'rgba(192, 132, 252, 0.15)', border: '#c084fc' },
  architecture_analysis: { label: 'Análise Arquitetural', color: 'rgba(56, 189, 248, 0.15)', border: '#38bdf8' },
  code_generation: { label: 'Geração de Código', color: 'rgba(52, 211, 153, 0.15)', border: '#34d399' },
  code_review: { label: 'Revisão de Código', color: 'rgba(251, 191, 36, 0.15)', border: '#fbbf24' },
  security_audit: { label: 'Auditoria de Segurança', color: 'rgba(248, 113, 113, 0.15)', border: '#f87171' },
  audit: { label: 'Auditoria Técnica', color: 'rgba(248, 113, 113, 0.15)', border: '#f87171' },
  test_generation: { label: 'Geração de Testes', color: 'rgba(56, 189, 248, 0.15)', border: '#38bdf8' },
  troubleshooting: { label: 'Diagnóstico Técnico', color: 'rgba(251, 191, 36, 0.15)', border: '#fbbf24' },
  project_management: { label: 'Gestão de Projeto', color: 'rgba(192, 132, 252, 0.15)', border: '#c084fc' },
  planejamento: { label: 'Planejamento Geral', color: 'rgba(56, 189, 248, 0.15)', border: '#38bdf8' },
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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [canManageTasks, setCanManageTasks] = useState(false);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;
  const [viewMode, setViewMode] = useState<'hub' | 'list' | 'kanban' | 'table'>('hub');
  const [selectedAgentRole, setSelectedAgentRole] = useState('jarvis_master');
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const [delegationPrompt, setDelegationPrompt] = useState('');
  const [delegating, setDelegating] = useState(false);
  const [canDelegate, setCanDelegate] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any | null>(null);

  const selectedAgent = ALL_26_AGENTS.find((a) => a.id === selectedAgentRole) || ALL_26_AGENTS[0];

  const handleDelegateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = delegationPrompt.trim();
    if (!prompt || delegating) return;
    setDelegating(true);
    try {
      const res = await fetch(`${API_BASE}/agents/${encodeURIComponent(selectedAgentRole)}/task`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, mode: 'ask' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify(data.detail || `O especialista ${selectedAgent.name} não concluiu a tarefa.`, 'error');
        return;
      }
      const summary = data.summary || data.objective || 'Tarefa registada.';
      notify(`${selectedAgent.name} respondeu: ${String(summary).slice(0, 160)}`, 'success');
      setDelegationPrompt('');
      await loadTasks();
    } catch (err: any) {
      notify(`Falha ao delegar: ${err?.message || 'erro de rede'}`, 'error');
    } finally {
      setDelegating(false);
    }
  };

  const loadTasks = async () => {
    setLoading(true);
    try {
      const data = await fetchTasks();
      setTasks(data || []);
      setLoadError(null);
      if (selectedTask) {
        const updated = (data || []).find((t: any) => t.id === selectedTask.id);
        if (updated) setSelectedTask(updated);
      }
    } catch (e: any) {
      setLoadError(e.message || 'Falha ao carregar tarefas.');
      notify(`Erro ao carregar tarefas: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/auth/me`, { credentials: 'include' })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((principal) => {
        if (cancelled) return;
        const permissions = Array.isArray(principal?.permissions) ? principal.permissions : [];
        const isHuman = principal?.kind === 'human';
        setCanManageTasks(
          isHuman && (permissions.includes('*') || permissions.includes('tasks:write'))
        );
        setCanDelegate(
          isHuman && (permissions.includes('*') || permissions.includes('agents:use'))
        );
        setRoleLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setCanManageTasks(false);
          setCanDelegate(false);
          setRoleLoaded(true);
        }
      });
    void loadTasks();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCopy = (text: string, id: string) => {
    if (!navigator.clipboard?.writeText) {
      notify('A cópia automática não está disponível neste navegador.', 'warning');
      return;
    }
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedId(id);
        notify('Copiado para a área de transferência!', 'info');
        window.setTimeout(() => setCopiedId(null), 1800);
      })
      .catch(() => notify('Não foi possível copiar. Verifique as permissões do navegador.', 'error'));
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!canManageTasks) return;
    setDeletingId(taskId);
    try {
      const success = await deleteTask(taskId);
      if (success) {
        notify('Tarefa removida com sucesso.', 'success');
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
        if (selectedTask?.id === taskId) {
          setSelectedTask(null);
        }
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
    if (!canManageTasks) return;
    setPurging(true);
    try {
      const res = await purgeTasks(30);
      notify(`${res.purged_count} tarefa(s) antiga(s) expurgada(s) da sua conta.`, 'success');
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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchFilter, statusFilter, intentFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / PAGE_SIZE));
  const paginatedTasks = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredTasks.slice(start, start + PAGE_SIZE);
  }, [filteredTasks, currentPage, PAGE_SIZE]);

  // Estatísticas Rápidas
  const totalCount = tasks.length;
  const completedCount = tasks.filter((t) => t.is_completed).length;
  const pendingCount = totalCount - completedCount;
  const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : null;

  const uniqueIntents = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => {
      if (t.intent) set.add(t.intent);
    });
    return Array.from(set);
  }, [tasks]);

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'Data indisponível';
    try {
      const d = new Date(isoString);
      return d.toLocaleString('pt-PT', {
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

  const getAgentForTask = (task: any) => {
    if (task.agent_role) {
      const found = ALL_26_AGENTS.find((a) => a.id === task.agent_role);
      if (found) return found;
    }
    if (task.intent && task.intent.includes('architecture')) {
      return ALL_26_AGENTS.find((a) => a.id === 'software_architect') || ALL_26_AGENTS[0];
    }
    if (task.intent && task.intent.includes('security')) {
      return ALL_26_AGENTS.find((a) => a.id === 'security_specialist') || ALL_26_AGENTS[0];
    }
    if (task.intent && task.intent.includes('code')) {
      return ALL_26_AGENTS.find((a) => a.id === 'backend_developer') || ALL_26_AGENTS[0];
    }
    return ALL_26_AGENTS[0];
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', minHeight: '100%' }}>
      {/* ========================================================
          HEADER LIMPO (OPÇÃO A: FOCO E EQUILÍBRIO VISUAL)
          ======================================================== */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          paddingBottom: '16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
        }}
      >
        {/* Lado Esquerdo: Título + Métricas Compactas em Linha */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <button
              type="button"
              onClick={() => window.history.back()}
              className="btn btn-ghost"
              style={{ padding: '6px 8px', borderRadius: '6px' }}
              title="Voltar"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => window.history.forward()}
              className="btn btn-ghost"
              style={{ padding: '6px 8px', borderRadius: '6px' }}
              title="Avançar"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 className="claude-serif-title" style={{ fontSize: '1.45rem', fontWeight: 600, margin: 0, color: '#f5f5f5', letterSpacing: '-0.02em' }}>
                Tarefas
              </h1>
              <span className="linear-pill-badge" style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)', color: '#d4d4d8' }}>
                {totalCount} total
              </span>
            </div>

            {/* Subtítulo com telemetria sutil, sem poluir a barra direita */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap', fontSize: '0.76rem', color: '#a1a1aa' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <RefreshCw size={11} className={pendingCount > 0 ? 'spin' : ''} color="#c084fc" />
                <strong style={{ color: '#c084fc' }}>{pendingCount}</strong> em andamento
              </span>
              <span style={{ color: 'rgba(255, 255, 255, 0.2)' }}>•</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={11} color="#34d399" />
                <strong style={{ color: '#34d399' }}>{completedCount}</strong> concluídas
              </span>
              <span style={{ color: 'rgba(255, 255, 255, 0.2)' }}>•</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Sparkles size={11} color="#38bdf8" />
                Taxa: <strong style={{ color: '#38bdf8' }}>{completionRate === null ? '—' : `${completionRate}%`}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Lado Direito: Seletor de Visões + Botões de Ação */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Seletor de Visões Estilo Linear */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: '#161619',
              padding: '3px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              gap: '2px',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setViewMode('hub');
                setSelectedTask(null);
              }}
              title="Hub de Delegação OpenBot"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.74rem',
                padding: '4px 10px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: viewMode === 'hub' ? '#26262a' : 'transparent',
                color: viewMode === 'hub' ? '#38bdf8' : '#888888',
                fontWeight: viewMode === 'hub' ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Bot size={13} />
              <span>Hub</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              title="Lista Densa Linear"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.74rem',
                padding: '4px 10px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: viewMode === 'list' ? '#26262a' : 'transparent',
                color: viewMode === 'list' ? '#ffffff' : '#888888',
                fontWeight: viewMode === 'list' ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <AlignLeft size={13} />
              <span>Lista</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              title="Quadro Kanban"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.74rem',
                padding: '4px 10px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: viewMode === 'kanban' ? '#26262a' : 'transparent',
                color: viewMode === 'kanban' ? '#ffffff' : '#888888',
                fontWeight: viewMode === 'kanban' ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Kanban size={13} />
              <span>Quadro</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              title="Tabela de Auditoria"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.74rem',
                padding: '4px 10px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: viewMode === 'table' ? '#26262a' : 'transparent',
                color: viewMode === 'table' ? '#ffffff' : '#888888',
                fontWeight: viewMode === 'table' ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <TableProperties size={13} />
              <span>Tabela</span>
            </button>
          </div>

          {canManageTasks && totalCount > 0 && (
            <button
              onClick={() => setShowPurgeModal(true)}
              className="btn btn-ghost"
              style={{ fontSize: '0.74rem', padding: '5px 10px', borderRadius: '7px', color: '#f87171' }}
              title="Expurgar tarefas com mais de 30 dias de retenção"
            >
              <Trash2 size={13} />
              <span>Expurgar</span>
            </button>
          )}

          <button
            onClick={loadTasks}
            className="btn btn-secondary"
            style={{ fontSize: '0.76rem', padding: '5px 12px', borderRadius: '7px' }}
            disabled={loading}
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            <span>{loading ? 'Atualizando...' : 'Atualizar'}</span>
          </button>
        </div>
      </div>

      {!roleLoaded && (
        <div role="status" className="glass-panel" style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
          A verificar permissões de gestão de tarefas…
        </div>
      )}
      {roleLoaded && !canManageTasks && (
        <div className="glass-panel" style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
          Modo de consulta: a remoção e a limpeza de tarefas exigem tasks:write.
        </div>
      )}
      {loadError && (
        <div
          role="alert"
          className="glass-card"
          style={{ padding: '12px 16px', border: '1px solid rgba(248, 113, 113, 0.35)', borderRadius: '10px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}
        >
          Não foi possível carregar as tarefas: {loadError}
        </div>
      )}

      {/* ========================================================
          ABA HUB: CENTRAL DE DELEGAÇÃO & ACOMPANHAMENTO (SEM DUPLICAÇÃO)
          ======================================================== */}
      {viewMode === 'hub' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%' }}>
          {/* Hero Inspirador OpenBot */}
          <div style={{ textAlign: 'center', padding: '6px 0 2px' }}>
            <h2 style={{ fontSize: '1.95rem', fontWeight: 600, color: '#f5f5f5', margin: 0, letterSpacing: '-0.02em' }}>
              Delegue o trabalho.
            </h2>
            <h2 className="openbot-tasks-gradient" style={{ fontSize: '1.95rem', fontWeight: 700, margin: '2px 0 8px 0', letterSpacing: '-0.02em' }}>
              Volte para uma resposta.
            </h2>
            <p style={{ fontSize: '0.86rem', color: '#888888', margin: 0 }}>
              Seus agentes trabalham em tarefas em paralelo. Cada resposta espera você aqui.
            </p>
          </div>

          {/* Barra Central de Delegação Rápida (OpenBot Capsule) */}
          <div style={{ maxWidth: '780px', margin: '0 auto', width: '100%' }}>
            <form onSubmit={handleDelegateTask} className="openbot-delegation-capsule">
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
                  className="btn btn-ghost"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.78rem',
                    color: '#d4d4d4',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    padding: '5px 12px',
                    borderRadius: '999px',
                  }}
                >
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: selectedAgent.color }} />
                  <span style={{ fontWeight: 500 }}>{selectedAgent.name}</span>
                  <ChevronDown size={12} color="#737373" />
                </button>

                {agentDropdownOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '36px',
                      left: 0,
                      width: '270px',
                      maxHeight: '320px',
                      overflowY: 'auto',
                      backgroundColor: '#18181b',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '10px',
                      padding: '4px',
                      zIndex: 100,
                      boxShadow: '0 12px 32px rgba(0,0,0,0.7)',
                    }}
                  >
                    {ALL_26_AGENTS.map((ag) => (
                      <button
                        key={ag.id}
                        type="button"
                        onClick={() => {
                          setSelectedAgentRole(ag.id);
                          setAgentDropdownOpen(false);
                        }}
                        className="btn btn-ghost"
                        style={{
                          width: '100%',
                          justifyContent: 'flex-start',
                          padding: '6px 10px',
                          fontSize: '0.78rem',
                          color: selectedAgentRole === ag.id ? '#38bdf8' : '#d4d4d4',
                          borderRadius: '6px',
                        }}
                      >
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: ag.color, marginRight: '8px', flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ag.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <input
                type="text"
                value={delegationPrompt}
                onChange={(e) => setDelegationPrompt(e.target.value)}
                placeholder="O que você quer que seja feito?"
                aria-label="Descrição da tarefa a delegar"
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#f5f5f5',
                  fontSize: '0.88rem',
                }}
              />

              <button
                type="submit"
                disabled={!canDelegate || delegating || !delegationPrompt.trim()}
                className="btn btn-primary"
                style={{
                  padding: '6px 10px',
                  borderRadius: '50%',
                  backgroundColor: '#38bdf8',
                  color: '#000000',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: canDelegate ? 1 : 0.5,
                }}
                title={canDelegate ? 'Enviar delegação' : 'O seu perfil não pode executar especialistas'}
              >
                <ArrowUp size={14} />
              </button>
            </form>

            {roleLoaded && !canDelegate && (
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'center' }}>
                A delegação de tarefas exige a permissão <code>agents:use</code>. Peça acesso ao administrador.
              </div>
            )}
          </div>

          {/* Fila de Acompanhamento no Hub: 2 Colunas Limpas (Em andamento / Concluídas) + Inspector */}
          <div style={{ display: 'flex', gap: '18px', alignItems: 'flex-start', width: '100%' }}>
            {/* Duas Colunas de Tarefas */}
            <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
              {/* Coluna 1: Em andamento */}
              <div
                style={{
                  backgroundColor: 'rgba(18, 18, 20, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <RefreshCw size={14} className="spin" color="#c084fc" />
                    <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#f4f4f5' }}>Em andamento</span>
                  </div>
                  <span className="linear-pill-badge" style={{ backgroundColor: 'rgba(192, 132, 252, 0.15)', color: '#c084fc' }}>
                    {tasks.filter((t) => !t.is_completed).length}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {tasks.filter((t) => !t.is_completed).length === 0 ? (
                    <div style={{ fontSize: '0.80rem', color: '#71717a', textAlign: 'center', padding: '32px 12px' }}>
                      Nenhuma tarefa em andamento no momento.
                    </div>
                  ) : (
                    tasks
                      .filter((t) => !t.is_completed)
                      .map((task) => {
                        const isSelected = selectedTask?.id === task.id;
                        return (
                          <div
                            key={task.id}
                            className={`openbot-task-row ${isSelected ? 'is-selected' : ''}`}
                            onClick={() => setSelectedTask(task)}
                            style={{
                              cursor: 'pointer',
                              borderColor: isSelected ? 'rgba(56, 189, 248, 0.5)' : undefined,
                              backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.06)' : undefined,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                              <RefreshCw size={13} className="spin" color="#c084fc" style={{ flexShrink: 0 }} />
                              <span style={{ fontSize: '0.84rem', color: '#e4e4e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {task.prompt}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                              <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '12px', backgroundColor: 'rgba(192, 132, 252, 0.15)', color: '#c084fc', fontWeight: 500 }}>
                                {INTENT_MAP[task.intent]?.label || humanizeLabel(task.intent) || 'Aguardando'}
                              </span>
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>

              {/* Coluna 2: Concluídas */}
              <div
                style={{
                  backgroundColor: 'rgba(18, 18, 20, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle2 size={14} color="#34d399" />
                    <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#f4f4f5' }}>Concluídas</span>
                  </div>
                  <span className="linear-pill-badge" style={{ backgroundColor: 'rgba(52, 211, 153, 0.15)', color: '#34d399' }}>
                    {tasks.filter((t) => t.is_completed).length}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {tasks.filter((t) => t.is_completed).length === 0 ? (
                    <div style={{ fontSize: '0.80rem', color: '#71717a', textAlign: 'center', padding: '32px 12px' }}>
                      Nenhuma tarefa concluída ainda.
                    </div>
                  ) : (
                    tasks
                      .filter((t) => t.is_completed)
                      .slice(0, 10)
                      .map((task) => {
                        const isSelected = selectedTask?.id === task.id;
                        return (
                          <div
                            key={task.id}
                            className={`openbot-task-row ${isSelected ? 'is-selected' : ''}`}
                            onClick={() => setSelectedTask(task)}
                            style={{
                              cursor: 'pointer',
                              borderColor: isSelected ? 'rgba(52, 211, 153, 0.5)' : undefined,
                              backgroundColor: isSelected ? 'rgba(52, 211, 153, 0.06)' : undefined,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                              <CheckCircle2 size={14} color="#34d399" style={{ flexShrink: 0 }} />
                              <span style={{ fontSize: '0.84rem', color: '#e4e4e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {task.prompt}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                              <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '12px', backgroundColor: 'rgba(52, 211, 153, 0.15)', color: '#34d399', fontWeight: 500 }}>
                                {INTENT_MAP[task.intent]?.label || humanizeLabel(task.intent) || 'Respondida'}
                              </span>
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            </div>

            {/* Inspector Lateral integrado ao Hub quando uma tarefa for clicada */}
            {selectedTask && (
              <div
                className="linear-inspector"
                style={{
                  width: '360px',
                  flexShrink: 0,
                  position: 'sticky',
                  top: '16px',
                  maxHeight: 'calc(100vh - 120px)',
                  overflowY: 'auto',
                }}
              >
                {/* Header do Inspetor */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.80rem', fontWeight: 600, color: '#f4f4f5' }}>Detalhes da Tarefa</span>
                    <span style={{ fontSize: '0.72rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
                      #{String(selectedTask.id || '').slice(0, 8)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => handleCopy(selectedTask.id, `tsk-${selectedTask.id}`)}
                      className="btn btn-ghost"
                      style={{ padding: '4px 6px', color: '#a1a1aa' }}
                      title="Copiar ID da tarefa"
                    >
                      {copiedId === `tsk-${selectedTask.id}` ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedTask(null)}
                      className="btn btn-ghost"
                      style={{ padding: '4px 6px', color: '#a1a1aa' }}
                      title="Fechar inspetor"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>

                {/* Status e Agente */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.75rem', color: '#71717a' }}>Status</span>
                    <span
                      className="linear-pill-badge"
                      style={{
                        backgroundColor: selectedTask.is_completed ? 'rgba(52, 211, 153, 0.15)' : 'rgba(251, 191, 36, 0.15)',
                        color: selectedTask.is_completed ? '#34d399' : '#fbbf24',
                      }}
                    >
                      {selectedTask.is_completed ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                      {selectedTask.is_completed ? 'Concluída' : 'Em andamento'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.75rem', color: '#71717a' }}>Especialista</span>
                    {(() => {
                      const ag = getAgentForTask(selectedTask);
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', color: '#f4f4f5' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: ag.color }} />
                          <span style={{ fontWeight: 500 }}>{ag.name}</span>
                        </div>
                      );
                    })()}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.75rem', color: '#71717a' }}>Intenção</span>
                    <span className="linear-pill-badge" style={{ backgroundColor: INTENT_MAP[selectedTask.intent]?.color || 'rgba(255, 255, 255, 0.06)', color: INTENT_MAP[selectedTask.intent]?.border || '#d4d4d8' }}>
                      {INTENT_MAP[selectedTask.intent]?.label || humanizeLabel(selectedTask.intent) || 'Geral'}
                    </span>
                  </div>

                  {selectedTask.project_id && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.75rem', color: '#71717a' }}>Projeto</span>
                      <span style={{ fontSize: '0.76rem', color: '#c084fc', fontWeight: 500 }}>
                        {humanizeLabel(selectedTask.project_id)}
                      </span>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.75rem', color: '#71717a' }}>Registrado em</span>
                    <span style={{ fontSize: '0.74rem', color: '#a1a1aa' }}>
                      {formatDate(selectedTask.created_at)}
                    </span>
                  </div>
                </div>

                {/* Prompt Completo */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#a1a1aa' }}>Instrução / Prompt</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(selectedTask.prompt, `prm-${selectedTask.id}`)}
                      className="btn btn-ghost"
                      style={{ padding: '2px 4px', fontSize: '0.70rem', color: '#a1a1aa' }}
                    >
                      {copiedId === `prm-${selectedTask.id}` ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                  <div
                    style={{
                      backgroundColor: '#18181b',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      fontSize: '0.82rem',
                      lineHeight: 1.5,
                      color: '#e4e4e7',
                      maxHeight: '180px',
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {selectedTask.prompt}
                  </div>
                </div>

                {/* Sessão de Chat Associada */}
                {selectedTask.session_id && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#a1a1aa' }}>Sessão de Conversa</span>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        backgroundColor: '#18181b',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                      }}
                    >
                      <code style={{ fontSize: '0.72rem', color: '#38bdf8', fontFamily: "'JetBrains Mono', monospace" }}>
                        {String(selectedTask.session_id).slice(0, 16)}…
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopy(selectedTask.session_id, `ses-${selectedTask.session_id}`)}
                        className="btn btn-ghost"
                        style={{ padding: '2px 4px' }}
                        title="Copiar ID da sessão"
                      >
                        {copiedId === `ses-${selectedTask.session_id}` ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Ações do Inspetor */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  {selectedTask.session_id && (
                    <button
                      type="button"
                      onClick={() => {
                        window.location.hash = `#/chat?session_id=${encodeURIComponent(selectedTask.session_id)}`;
                      }}
                      className="btn btn-primary"
                      style={{
                        width: '100%',
                        justifyContent: 'center',
                        fontSize: '0.78rem',
                        gap: '6px',
                        backgroundColor: '#38bdf8',
                        color: '#000000',
                      }}
                    >
                      <ExternalLink size={13} />
                      <span>Abrir Conversa no Chat</span>
                    </button>
                  )}

                  {canManageTasks && (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(selectedTask.id)}
                      className="btn btn-ghost"
                      style={{
                        width: '100%',
                        justifyContent: 'center',
                        fontSize: '0.76rem',
                        color: '#f87171',
                        gap: '6px',
                      }}
                    >
                      <Trash2 size={13} />
                      <span>Excluir Tarefa</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          ABAS DE VISUALIZAÇÃO AVANÇADA: LISTA, QUADRO E TABELA
          (Mostram a Barra de Busca, Filtros e Lista Completa)
          ======================================================== */}
      {viewMode !== 'hub' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
          {/* Barra de Filtros e Busca */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              backgroundColor: '#121214',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '10px',
              padding: '8px 14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '240px' }}>
              <Search size={16} color="#71717a" />
              <input
                type="text"
                placeholder="Filtrar tarefas, IDs, intenções ou projetos..."
                aria-label="Buscar tarefas"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                style={{
                  flex: 1,
                  backgroundColor: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#f4f4f5',
                  fontSize: '0.84rem',
                }}
              />
              {searchFilter && (
                <button
                  onClick={() => setSearchFilter('')}
                  className="btn btn-ghost"
                  style={{ fontSize: '0.72rem', padding: '2px 6px', color: '#a1a1aa' }}
                >
                  Limpar
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {(
                [
                  { id: 'ALL', label: 'Todas' },
                  { id: 'PENDING', label: 'Em andamento' },
                  { id: 'COMPLETED', label: 'Concluídas' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  onClick={() => setStatusFilter(item.id)}
                  style={{
                    fontSize: '0.74rem',
                    padding: '3px 10px',
                    borderRadius: '6px',
                    border: '1px solid',
                    borderColor: statusFilter === item.id ? 'var(--accent-color, #38bdf8)' : 'rgba(255, 255, 255, 0.06)',
                    backgroundColor: statusFilter === item.id ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                    color: statusFilter === item.id ? 'var(--accent-color, #38bdf8)' : '#a1a1aa',
                    fontWeight: statusFilter === item.id ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.12s ease',
                  }}
                >
                  {item.label}
                </button>
              ))}

              {uniqueIntents.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: 'rgba(255, 255, 255, 0.15)', margin: '0 2px' }}>|</span>
                  <select
                    value={intentFilter}
                    onChange={(e) => setIntentFilter(e.target.value)}
                    style={{
                      fontSize: '0.74rem',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      backgroundColor: '#18181b',
                      color: '#d4d4d8',
                      border: '1px solid rgba(255, 255, 255, 0.10)',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="ALL">Todas as Intenções</option>
                    {uniqueIntents.map((intentKey) => (
                      <option key={intentKey} value={intentKey}>
                        {INTENT_MAP[intentKey]?.label || intentKey}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Área de Conteúdo (Lista / Kanban / Tabela + Inspetor Lateral) */}
          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', position: 'relative' }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                    borderRadius: '12px',
                  }}
                >
                  <ListTodo size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Nenhuma tarefa encontrada
                  </h3>
                  <p style={{ fontSize: '0.84rem', marginTop: '6px' }}>
                    As tarefas são registadas quando um fluxo é executado no Chat JARVIS.
                  </p>
                </div>
              ) : viewMode === 'kanban' ? (
                /* Quadro Kanban */
                <div className="linear-kanban-board">
                  <div className="linear-kanban-column">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <RefreshCw size={13} className="spin" color="#c084fc" />
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#f4f4f5' }}>Em andamento</span>
                      </div>
                      <span className="linear-pill-badge" style={{ backgroundColor: 'rgba(192, 132, 252, 0.15)', color: '#c084fc' }}>
                        {filteredTasks.filter((t) => !t.is_completed).length}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {filteredTasks.filter((t) => !t.is_completed).length === 0 ? (
                        <div style={{ fontSize: '0.78rem', color: '#71717a', textAlign: 'center', padding: '24px 8px' }}>
                          Nenhuma tarefa em andamento.
                        </div>
                      ) : (
                        filteredTasks
                          .filter((t) => !t.is_completed)
                          .map((task) => {
                            const agent = getAgentForTask(task);
                            const isSelected = selectedTask?.id === task.id;
                            return (
                              <div
                                key={task.id}
                                className="linear-kanban-card"
                                onClick={() => setSelectedTask(task)}
                                style={{
                                  borderColor: isSelected ? 'rgba(56, 189, 248, 0.5)' : undefined,
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                                  <span
                                    className="linear-pill-badge"
                                    style={{
                                      backgroundColor: INTENT_MAP[task.intent]?.color || 'rgba(56, 189, 248, 0.12)',
                                      color: INTENT_MAP[task.intent]?.border || '#38bdf8',
                                    }}
                                  >
                                    {INTENT_MAP[task.intent]?.label || humanizeLabel(task.intent) || 'Geral'}
                                  </span>
                                  <span style={{ fontSize: '0.70rem', color: '#71717a' }}>#{String(task.id || '').slice(0, 8)}</span>
                                </div>

                                <p style={{ fontSize: '0.84rem', color: '#f4f4f5', margin: 0, lineHeight: 1.4, fontWeight: 500 }}>
                                  {task.prompt}
                                </p>

                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid rgba(255, 255, 255, 0.04)', fontSize: '0.72rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#a1a1aa' }}>
                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: agent.color }} />
                                    <span>{agent.name}</span>
                                  </div>
                                  <span style={{ color: '#71717a' }}>{formatDate(task.created_at)}</span>
                                </div>
                              </div>
                            );
                          })
                      )}
                    </div>
                  </div>

                  <div className="linear-kanban-column">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CheckCircle2 size={13} color="#34d399" />
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#f4f4f5' }}>Concluídas</span>
                      </div>
                      <span className="linear-pill-badge" style={{ backgroundColor: 'rgba(52, 211, 153, 0.15)', color: '#34d399' }}>
                        {filteredTasks.filter((t) => t.is_completed).length}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {filteredTasks.filter((t) => t.is_completed).length === 0 ? (
                        <div style={{ fontSize: '0.78rem', color: '#71717a', textAlign: 'center', padding: '24px 8px' }}>
                          Nenhuma tarefa concluída ainda.
                        </div>
                      ) : (
                        filteredTasks
                          .filter((t) => t.is_completed)
                          .map((task) => {
                            const agent = getAgentForTask(task);
                            const isSelected = selectedTask?.id === task.id;
                            return (
                              <div
                                key={task.id}
                                className="linear-kanban-card"
                                onClick={() => setSelectedTask(task)}
                                style={{
                                  borderColor: isSelected ? 'rgba(52, 211, 153, 0.5)' : undefined,
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                                  <span
                                    className="linear-pill-badge"
                                    style={{
                                      backgroundColor: INTENT_MAP[task.intent]?.color || 'rgba(52, 211, 153, 0.12)',
                                      color: INTENT_MAP[task.intent]?.border || '#34d399',
                                    }}
                                  >
                                    {INTENT_MAP[task.intent]?.label || humanizeLabel(task.intent) || 'Geral'}
                                  </span>
                                  <span style={{ fontSize: '0.70rem', color: '#71717a' }}>#{String(task.id || '').slice(0, 8)}</span>
                                </div>

                                <p style={{ fontSize: '0.84rem', color: '#e4e4e7', margin: 0, lineHeight: 1.4 }}>
                                  {task.prompt}
                                </p>

                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid rgba(255, 255, 255, 0.04)', fontSize: '0.72rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#a1a1aa' }}>
                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: agent.color }} />
                                    <span>{agent.name}</span>
                                  </div>
                                  <span style={{ color: '#71717a' }}>{formatDate(task.created_at)}</span>
                                </div>
                              </div>
                            );
                          })
                      )}
                    </div>
                  </div>
                </div>
              ) : viewMode === 'table' ? (
                /* Tabela de Auditoria */
                <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', textAlign: 'left', backgroundColor: '#121214' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#a1a1aa' }}>
                        <th style={{ padding: '10px 14px', width: '36px' }}>Status</th>
                        <th style={{ padding: '10px 14px' }}>Descrição da Tarefa</th>
                        <th style={{ padding: '10px 14px' }}>Intenção</th>
                        <th style={{ padding: '10px 14px' }}>Projeto</th>
                        <th style={{ padding: '10px 14px' }}>Sessão</th>
                        <th style={{ padding: '10px 14px' }}>Data</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedTasks.map((task) => {
                        const isSelected = selectedTask?.id === task.id;
                        return (
                          <tr
                            key={task.id}
                            onClick={() => setSelectedTask(task)}
                            style={{
                              borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                              backgroundColor: isSelected ? '#1c1c20' : 'transparent',
                              cursor: 'pointer',
                              transition: 'background-color 0.12s ease',
                            }}
                          >
                            <td style={{ padding: '10px 14px' }}>
                              {task.is_completed ? <CheckCircle2 size={15} color="#34d399" /> : <Clock size={15} color="#fbbf24" />}
                            </td>
                            <td style={{ padding: '10px 14px', maxWidth: '320px', color: '#f4f4f5', fontWeight: 500 }}>
                              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {task.prompt}
                              </div>
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <span className="linear-pill-badge" style={{ backgroundColor: INTENT_MAP[task.intent]?.color || 'rgba(255, 255, 255, 0.05)', color: INTENT_MAP[task.intent]?.border || '#d4d4d8' }}>
                                {INTENT_MAP[task.intent]?.label || humanizeLabel(task.intent) || 'Geral'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', color: '#a1a1aa' }}>
                              {task.project_id ? humanizeLabel(task.project_id) : '—'}
                            </td>
                            <td style={{ padding: '10px 14px', fontFamily: "'JetBrains Mono', monospace", color: '#71717a' }}>
                              {task.session_id ? `${String(task.session_id).slice(0, 10)}…` : '—'}
                            </td>
                            <td style={{ padding: '10px 14px', color: '#71717a', whiteSpace: 'nowrap' }}>
                              {formatDate(task.created_at)}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                              {canManageTasks && (
                                <button
                                  onClick={() => setConfirmDeleteId(task.id)}
                                  className="btn btn-ghost"
                                  style={{ padding: '4px 6px', color: '#f87171' }}
                                  title="Excluir tarefa"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* Lista Densa (Estilo Linear) */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {paginatedTasks.map((task) => {
                    const mappedIntent = INTENT_MAP[task.intent] || {
                      label: (task.intent || 'Planejamento Geral').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
                      color: 'rgba(56, 189, 248, 0.12)',
                      border: '#38bdf8',
                    };
                    const agent = getAgentForTask(task);
                    const isSelected = selectedTask?.id === task.id;

                    return (
                      <div
                        key={task.id}
                        className={`linear-task-item ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => setSelectedTask(task)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                          <div style={{ flexShrink: 0 }}>
                            {task.is_completed ? (
                              <CheckCircle2 size={17} color="#34d399" />
                            ) : (
                              <Clock size={17} color="#fbbf24" />
                            )}
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span
                                className="linear-pill-badge"
                                style={{
                                  backgroundColor: mappedIntent.color,
                                  color: mappedIntent.border,
                                }}
                              >
                                {mappedIntent.label}
                              </span>

                              <span
                                className="linear-pill-badge"
                                style={{
                                  backgroundColor: task.is_completed ? 'rgba(52, 211, 153, 0.12)' : 'rgba(251, 191, 36, 0.12)',
                                  color: task.is_completed ? '#34d399' : '#fbbf24',
                                }}
                              >
                                {task.is_completed ? 'Concluída' : 'Em andamento'}
                              </span>

                              {task.project_id && (
                                <span className="linear-pill-badge" style={{ backgroundColor: 'rgba(192, 132, 252, 0.12)', color: '#c084fc' }}>
                                  {humanizeLabel(task.project_id)}
                                </span>
                              )}

                              <span style={{ fontSize: '0.72rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
                                #{String(task.id || '').slice(0, 10)}
                              </span>
                            </div>

                            <p
                              style={{
                                fontSize: '0.88rem',
                                fontWeight: 500,
                                color: '#f4f4f5',
                                margin: 0,
                                lineHeight: 1.4,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {task.prompt}
                            </p>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', color: '#a1a1aa' }}>
                            <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: agent.color }} />
                            <span>{agent.name}</span>
                          </div>

                          <span style={{ fontSize: '0.72rem', color: '#71717a' }}>{formatDate(task.created_at)}</span>

                          {canManageTasks && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteId(task.id);
                              }}
                              className="btn btn-ghost"
                              style={{ padding: '4px 6px', color: '#f87171' }}
                              title="Excluir tarefa"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Paginação */}
              {filteredTasks.length > PAGE_SIZE && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 6px',
                    flexWrap: 'wrap',
                    gap: '10px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                    marginTop: '4px',
                  }}
                >
                  <span style={{ fontSize: '0.78rem', color: '#a1a1aa' }}>
                    Mostrando {(currentPage - 1) * PAGE_SIZE + 1}–
                    {Math.min(currentPage * PAGE_SIZE, filteredTasks.length)} de {filteredTasks.length} tarefas
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: '6px' }}
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    >
                      Anterior
                    </button>
                    <span style={{ fontSize: '0.76rem', color: '#71717a' }}>
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: '6px' }}
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Próxima
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Inspector Lateral para Lista, Quadro e Tabela */}
            {selectedTask && (
              <div
                className="linear-inspector"
                style={{
                  width: '360px',
                  flexShrink: 0,
                  position: 'sticky',
                  top: '16px',
                  maxHeight: 'calc(100vh - 120px)',
                  overflowY: 'auto',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.80rem', fontWeight: 600, color: '#f4f4f5' }}>Detalhes da Tarefa</span>
                    <span style={{ fontSize: '0.72rem', color: '#71717a', fontFamily: "'JetBrains Mono', monospace" }}>
                      #{String(selectedTask.id || '').slice(0, 8)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => handleCopy(selectedTask.id, `tsk-${selectedTask.id}`)}
                      className="btn btn-ghost"
                      style={{ padding: '4px 6px', color: '#a1a1aa' }}
                      title="Copiar ID da tarefa"
                    >
                      {copiedId === `tsk-${selectedTask.id}` ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedTask(null)}
                      className="btn btn-ghost"
                      style={{ padding: '4px 6px', color: '#a1a1aa' }}
                      title="Fechar inspetor"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.75rem', color: '#71717a' }}>Status</span>
                    <span
                      className="linear-pill-badge"
                      style={{
                        backgroundColor: selectedTask.is_completed ? 'rgba(52, 211, 153, 0.15)' : 'rgba(251, 191, 36, 0.15)',
                        color: selectedTask.is_completed ? '#34d399' : '#fbbf24',
                      }}
                    >
                      {selectedTask.is_completed ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                      {selectedTask.is_completed ? 'Concluída' : 'Em andamento'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.75rem', color: '#71717a' }}>Especialista</span>
                    {(() => {
                      const ag = getAgentForTask(selectedTask);
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', color: '#f4f4f5' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: ag.color }} />
                          <span style={{ fontWeight: 500 }}>{ag.name}</span>
                        </div>
                      );
                    })()}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.75rem', color: '#71717a' }}>Intenção</span>
                    <span className="linear-pill-badge" style={{ backgroundColor: INTENT_MAP[selectedTask.intent]?.color || 'rgba(255, 255, 255, 0.06)', color: INTENT_MAP[selectedTask.intent]?.border || '#d4d4d8' }}>
                      {INTENT_MAP[selectedTask.intent]?.label || humanizeLabel(selectedTask.intent) || 'Geral'}
                    </span>
                  </div>

                  {selectedTask.project_id && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.75rem', color: '#71717a' }}>Projeto</span>
                      <span style={{ fontSize: '0.76rem', color: '#c084fc', fontWeight: 500 }}>
                        {humanizeLabel(selectedTask.project_id)}
                      </span>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.75rem', color: '#71717a' }}>Registrado em</span>
                    <span style={{ fontSize: '0.74rem', color: '#a1a1aa' }}>
                      {formatDate(selectedTask.created_at)}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#a1a1aa' }}>Instrução / Prompt</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(selectedTask.prompt, `prm-${selectedTask.id}`)}
                      className="btn btn-ghost"
                      style={{ padding: '2px 4px', fontSize: '0.70rem', color: '#a1a1aa' }}
                    >
                      {copiedId === `prm-${selectedTask.id}` ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                  <div
                    style={{
                      backgroundColor: '#18181b',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      fontSize: '0.82rem',
                      lineHeight: 1.5,
                      color: '#e4e4e7',
                      maxHeight: '180px',
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {selectedTask.prompt}
                  </div>
                </div>

                {selectedTask.session_id && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#a1a1aa' }}>Sessão de Conversa</span>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        backgroundColor: '#18181b',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                      }}
                    >
                      <code style={{ fontSize: '0.72rem', color: '#38bdf8', fontFamily: "'JetBrains Mono', monospace" }}>
                        {String(selectedTask.session_id).slice(0, 16)}…
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopy(selectedTask.session_id, `ses-${selectedTask.session_id}`)}
                        className="btn btn-ghost"
                        style={{ padding: '2px 4px' }}
                        title="Copiar ID da sessão"
                      >
                        {copiedId === `ses-${selectedTask.session_id}` ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
                      </button>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  {selectedTask.session_id && (
                    <button
                      type="button"
                      onClick={() => {
                        window.location.hash = `#/chat?session_id=${encodeURIComponent(selectedTask.session_id)}`;
                      }}
                      className="btn btn-primary"
                      style={{
                        width: '100%',
                        justifyContent: 'center',
                        fontSize: '0.78rem',
                        gap: '6px',
                        backgroundColor: '#38bdf8',
                        color: '#000000',
                      }}
                    >
                      <ExternalLink size={13} />
                      <span>Abrir Conversa no Chat</span>
                    </button>
                  )}

                  {canManageTasks && (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(selectedTask.id)}
                      className="btn btn-ghost"
                      style={{
                        width: '100%',
                        justifyContent: 'center',
                        fontSize: '0.76rem',
                        color: '#f87171',
                        gap: '6px',
                      }}
                    >
                      <Trash2 size={13} />
                      <span>Excluir Tarefa</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Confirmação para Excluir Tarefa Individual */}
      <Modal
        isOpen={canManageTasks && !!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        title="Excluir registro de tarefa?"
        subtitle="Esta ação remove o registro da sua conta e não pode ser desfeita."
        maxWidth="sm"
        footer={(
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmDeleteId(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!!deletingId}
              onClick={async () => {
                if (!confirmDeleteId) return;
                const targetId = confirmDeleteId;
                setConfirmDeleteId(null);
                await handleDeleteTask(targetId);
              }}
            >
              {deletingId ? 'Removendo…' : 'Excluir tarefa'}
            </button>
          </>
        )}
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', margin: 0 }}>
          Confirme a exclusão do registro selecionado. Os dados de outras contas não são afetados.
        </p>
      </Modal>

      {/* Modal de Confirmação para Expurgar Antigas */}
      {canManageTasks && showPurgeModal && (
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
              backgroundColor: 'var(--bg-secondary)',
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
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f87171', margin: 0 }}>
                Expurgar Tarefas Antigas?
              </h3>
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
              Esta ação removerá apenas as tarefas da sua conta com mais de <b>30 dias</b>. Tarefas recentes e dados de outras contas não serão afetados.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button onClick={() => setShowPurgeModal(false)} className="btn btn-secondary" style={{ fontSize: '0.80rem' }} disabled={purging}>
                Cancelar
              </button>
              <button
                onClick={handlePurgeOldTasks}
                className="btn btn-danger"
                style={{ fontSize: '0.80rem', padding: '6px 14px' }}
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
