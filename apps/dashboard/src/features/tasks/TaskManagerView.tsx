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
  ExternalLink,
  X,
  AlignLeft,
  Kanban,
  TableProperties,
  Bot,
} from 'lucide-react';
import { fetchTasks, deleteTask, purgeTasks } from '../../api';
import { notify } from '../../shared/common/Toast';
import { Modal } from '../../shared/common/Modal';
import { PageHeader } from '../../shared/layout/PageHeader';
import { API_BASE } from '../../services/api/client';
import { humanizeLabel } from '../../types';
import { ALL_26_AGENTS } from '../../data/agentsCatalog';

const INTENT_MAP: Record<string, { label: string; tone: string }> = {
  multi_agent_consensus: { label: 'Mesa Redonda / Consenso', tone: 'var(--accent-light)' },
  architecture_analysis: { label: 'Análise Arquitetural', tone: 'var(--accent-light)' },
  code_generation: { label: 'Geração de Código', tone: 'var(--success-color)' },
  code_review: { label: 'Revisão de Código', tone: 'var(--warning-color)' },
  security_audit: { label: 'Auditoria de Segurança', tone: 'var(--danger-color)' },
  audit: { label: 'Auditoria Técnica', tone: 'var(--danger-color)' },
  test_generation: { label: 'Geração de Testes', tone: 'var(--accent-light)' },
  troubleshooting: { label: 'Diagnóstico Técnico', tone: 'var(--warning-color)' },
  project_management: { label: 'Gestão de Projeto', tone: 'var(--accent-light)' },
  planejamento: { label: 'Planejamento Geral', tone: 'var(--accent-light)' },
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

  const totalCount = tasks.length;
  const completedCount = tasks.filter((t) => t.is_completed).length;
  const pendingCount = totalCount - completedCount;
  const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : null;

  const pendingTasks = useMemo(() => tasks.filter((t) => !t.is_completed), [tasks]);
  const completedTasks = useMemo(() => tasks.filter((t) => t.is_completed), [tasks]);
  const filteredPendingTasks = useMemo(() => filteredTasks.filter((t) => !t.is_completed), [filteredTasks]);
  const filteredCompletedTasks = useMemo(() => filteredTasks.filter((t) => t.is_completed), [filteredTasks]);

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

  const getIntentInfo = (intent?: string) => {
    if (intent && INTENT_MAP[intent]) return INTENT_MAP[intent];
    return {
      label: humanizeLabel(intent) || 'Geral',
      tone: 'var(--text-secondary)',
    };
  };

  const renderTaskInspector = () => {
    if (!selectedTask) return null;
    const ag = getAgentForTask(selectedTask);
    const intentInfo = getIntentInfo(selectedTask.intent);

    return (
      <aside
        className="jarvis-settings-card"
        aria-label="Detalhes da tarefa selecionada"
        style={{
          width: 'min(100%, 360px)',
          flex: '1 1 320px',
          maxWidth: '380px',
          position: 'sticky',
          top: '16px',
          maxHeight: 'calc(100vh - 140px)',
          overflowY: 'auto',
          gap: '14px',
        }}
      >
        {/* Header do Inspetor */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: '12px',
            borderBottom: '1px solid var(--border-subtle)',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Detalhes da Tarefa
            </span>
            <span
              className="jarvis-tabular"
              style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
            >
              #{String(selectedTask.id || '').slice(0, 8)}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => handleCopy(selectedTask.id, `tsk-${selectedTask.id}`)}
              className="btn btn-ghost btn-icon-sm"
              title="Copiar ID da tarefa"
              aria-label="Copiar ID da tarefa"
            >
              {copiedId === `tsk-${selectedTask.id}` ? (
                <Check size={13} color="var(--success-color)" />
              ) : (
                <Copy size={13} />
              )}
            </button>
            <button
              type="button"
              onClick={() => setSelectedTask(null)}
              className="btn btn-ghost btn-icon-sm"
              title="Fechar inspetor"
              aria-label="Fechar inspetor"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Metadados */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.78rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Status</span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontWeight: 600,
                color: selectedTask.is_completed ? 'var(--success-color)' : 'var(--warning-color)',
              }}
            >
              {selectedTask.is_completed ? <CheckCircle2 size={13} /> : <Clock size={13} />}
              {selectedTask.is_completed ? 'Concluída' : 'Em andamento'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Especialista</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: ag.color }} />
              <span style={{ fontWeight: 500 }}>{ag.name}</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Intenção</span>
            <span style={{ color: intentInfo.tone, fontWeight: 500 }}>{intentInfo.label}</span>
          </div>

          {selectedTask.project_id && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Projeto</span>
              <span style={{ color: 'var(--accent-light)', fontWeight: 500 }}>
                {humanizeLabel(selectedTask.project_id)}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Registrado em</span>
            <span className="jarvis-tabular" style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
              {formatDate(selectedTask.created_at)}
            </span>
          </div>
        </div>

        {/* Prompt Completo */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Instrução / Prompt
            </span>
            <button
              type="button"
              onClick={() => handleCopy(selectedTask.prompt, `prm-${selectedTask.id}`)}
              className={`btn btn-xs ${copiedId === `prm-${selectedTask.id}` ? 'btn-success' : 'btn-ghost'}`}
            >
              {copiedId === `prm-${selectedTask.id}` ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <div
            style={{
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: '0.8rem',
              lineHeight: 1.55,
              color: 'var(--text-primary)',
              maxHeight: '180px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {selectedTask.prompt}
          </div>
        </div>

        {/* Sessão de Chat Associada */}
        {selectedTask.session_id && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Sessão de Conversa
            </span>
            <div
              className="jarvis-settings-subcard"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
              }}
            >
              <code style={{ fontSize: '0.72rem', color: 'var(--accent-light)', fontFamily: 'var(--font-mono)' }}>
                {String(selectedTask.session_id).slice(0, 16)}…
              </code>
              <button
                type="button"
                onClick={() => handleCopy(selectedTask.session_id, `ses-${selectedTask.session_id}`)}
                className="btn btn-ghost btn-icon-sm"
                title="Copiar ID da sessão"
                aria-label="Copiar ID da sessão"
              >
                {copiedId === `ses-${selectedTask.session_id}` ? (
                  <Check size={11} color="var(--success-color)" />
                ) : (
                  <Copy size={11} />
                )}
              </button>
            </div>
          </div>
        )}

        {/* Ações do Inspetor */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            paddingTop: '12px',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          {selectedTask.session_id && (
            <button
              type="button"
              onClick={() => {
                window.location.hash = `#/chat?session_id=${encodeURIComponent(selectedTask.session_id)}`;
              }}
              className="btn btn-primary btn-sm btn-block"
            >
              <ExternalLink size={13} />
              <span>Abrir Conversa no Chat</span>
            </button>
          )}

          {canManageTasks && (
            <button
              type="button"
              onClick={() => setConfirmDeleteId(selectedTask.id)}
              className="btn btn-danger-ghost btn-sm btn-block"
            >
              <Trash2 size={13} />
              <span>Excluir Tarefa</span>
            </button>
          )}
        </div>
      </aside>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', minHeight: '100%' }}>
      <PageHeader
        title="Tarefas"
        subtitle="Delegue objetivos em paralelo aos especialistas e acompanhe a execução em tempo real."
        icon={<ListTodo size={16} />}
        meta={[
          <span key="total" className="jarvis-tabular">
            {totalCount} total
          </span>,
          <span key="pending" className="jarvis-tabular" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <RefreshCw size={11} className={pendingCount > 0 ? 'spin' : ''} color="var(--warning-color)" />
            <strong style={{ color: 'var(--text-primary)' }}>{pendingCount}</strong> em andamento
          </span>,
          <span key="done" className="jarvis-tabular" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <CheckCircle2 size={11} color="var(--success-color)" />
            <strong style={{ color: 'var(--text-primary)' }}>{completedCount}</strong> concluídas
          </span>,
          <span key="rate" className="jarvis-tabular" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Sparkles size={11} color="var(--accent-light)" />
            Taxa: <strong style={{ color: 'var(--accent-light)' }}>{completionRate === null ? '—' : `${completionRate}%`}</strong>
          </span>,
        ]}
        actions={
          <>
            <div className="jarvis-segmented" role="tablist" aria-label="Modo de visualização de tarefas">
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'hub'}
                onClick={() => {
                  setViewMode('hub');
                  setSelectedTask(null);
                }}
                title="Hub de Delegação"
                className={`jarvis-segmented-btn ${viewMode === 'hub' ? 'is-active' : ''}`}
              >
                <Bot size={13} />
                <span>Hub</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'list'}
                onClick={() => setViewMode('list')}
                title="Lista Densa"
                className={`jarvis-segmented-btn ${viewMode === 'list' ? 'is-active' : ''}`}
              >
                <AlignLeft size={13} />
                <span>Lista</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'kanban'}
                onClick={() => setViewMode('kanban')}
                title="Quadro Kanban"
                className={`jarvis-segmented-btn ${viewMode === 'kanban' ? 'is-active' : ''}`}
              >
                <Kanban size={13} />
                <span>Quadro</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'table'}
                onClick={() => setViewMode('table')}
                title="Tabela de Auditoria"
                className={`jarvis-segmented-btn ${viewMode === 'table' ? 'is-active' : ''}`}
              >
                <TableProperties size={13} />
                <span>Tabela</span>
              </button>
            </div>

            {canManageTasks && totalCount > 0 && (
              <button
                type="button"
                onClick={() => setShowPurgeModal(true)}
                className="btn btn-danger-ghost btn-sm"
                title="Expurgar tarefas com mais de 30 dias de retenção"
              >
                <Trash2 size={13} />
                <span>Expurgar</span>
              </button>
            )}

            <button
              type="button"
              onClick={loadTasks}
              className="btn btn-secondary btn-sm"
              disabled={loading}
            >
              <RefreshCw size={13} className={loading ? 'spin' : ''} />
              <span>{loading ? 'Atualizando...' : 'Atualizar'}</span>
            </button>
          </>
        }
      />

      {!roleLoaded && (
        <div role="status" className="jarvis-callout jarvis-callout--info">
          A verificar permissões de gestão de tarefas…
        </div>
      )}
      {roleLoaded && !canManageTasks && (
        <div className="jarvis-callout">
          Modo de consulta: a remoção e a limpeza de tarefas exigem <code>tasks:write</code>.
        </div>
      )}
      {loadError && (
        <div role="alert" className="jarvis-error-banner">
          Não foi possível carregar as tarefas: {loadError}
        </div>
      )}

      {/* ABA HUB: CENTRAL DE DELEGAÇÃO & ACOMPANHAMENTO */}
      {viewMode === 'hub' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%' }}>
          {/* Hero Conciso */}
          <div style={{ textAlign: 'center', padding: '6px 0 2px' }}>
            <h2
              style={{
                fontSize: 'clamp(1.4rem, 2.6vw, 1.85rem)',
                fontWeight: 600,
                color: 'var(--text-primary)',
                margin: 0,
                letterSpacing: '-0.025em',
              }}
            >
              Delegue o trabalho.{' '}
              <span style={{ color: 'var(--accent-light)' }}>Volte para uma resposta.</span>
            </h2>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: '6px 0 0 0' }}>
              Seus agentes trabalham em tarefas em paralelo. Cada resposta espera por você aqui.
            </p>
          </div>

          {/* Cápsula de Delegação Rápida */}
          <div style={{ maxWidth: '780px', margin: '0 auto', width: '100%' }}>
            <form onSubmit={handleDelegateTask} className="openbot-delegation-capsule">
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
                  className="btn btn-secondary btn-xs btn-pill"
                  aria-expanded={agentDropdownOpen}
                >
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: selectedAgent.color,
                    }}
                  />
                  <span style={{ fontWeight: 500 }}>{selectedAgent.name}</span>
                  <ChevronDown size={12} color="var(--text-muted)" />
                </button>

                {agentDropdownOpen && (
                  <div
                    className="jarvis-popover"
                    style={{
                      position: 'absolute',
                      top: '36px',
                      left: 0,
                      width: '270px',
                      maxHeight: '320px',
                      overflowY: 'auto',
                      zIndex: 100,
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
                        className={`btn btn-ghost btn-sm btn-block btn-start ${
                          selectedAgentRole === ag.id ? 'is-active' : ''
                        }`}
                      >
                        <span
                          style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            backgroundColor: ag.color,
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ag.name}
                        </span>
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
                className="jarvis-search-box__input"
                style={{ fontSize: '0.88rem' }}
              />

              <button
                type="submit"
                disabled={!canDelegate || delegating || !delegationPrompt.trim()}
                className="btn btn-primary btn-icon-sm btn-pill"
                title={canDelegate ? 'Enviar delegação' : 'O seu perfil não pode executar especialistas'}
                aria-label="Enviar delegação"
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

          {/* Fila de Acompanhamento no Hub + Inspetor */}
          <div style={{ display: 'flex', gap: '18px', alignItems: 'flex-start', width: '100%', flexWrap: 'wrap' }}>
            <div
              style={{
                flex: '999 1 480px',
                minWidth: 0,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
                gap: '16px',
              }}
            >
              {/* Coluna 1: Em andamento */}
              <div className="jarvis-settings-card" style={{ gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <RefreshCw size={14} className={pendingTasks.length > 0 ? 'spin' : ''} color="var(--warning-color)" />
                    <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Em andamento
                    </span>
                  </div>
                  <span className="jarvis-tabular" style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--warning-color)' }}>
                    {pendingTasks.length}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {pendingTasks.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '28px 12px' }}>
                      Nenhuma tarefa em andamento no momento.
                    </div>
                  ) : (
                    pendingTasks.map((task, idx) => {
                      const taskKey = task.id || task.task_id || `pending-${idx}`;
                      const isSelected = selectedTask?.id === task.id;
                      const intentInfo = getIntentInfo(task.intent);
                      return (
                        <button
                          key={taskKey}
                          type="button"
                          onClick={() => setSelectedTask(task)}
                          className={`jarvis-choice-card ${isSelected ? 'is-active' : ''}`}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '10px',
                            padding: '10px 12px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                            <RefreshCw size={13} className="spin" color="var(--warning-color)" style={{ flexShrink: 0 }} />
                            <span
                              style={{
                                fontSize: '0.82rem',
                                color: 'var(--text-primary)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {task.prompt}
                            </span>
                          </div>
                          <span style={{ fontSize: '0.7rem', color: intentInfo.tone, fontWeight: 500, flexShrink: 0 }}>
                            {intentInfo.label}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Coluna 2: Concluídas */}
              <div className="jarvis-settings-card" style={{ gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle2 size={14} color="var(--success-color)" />
                    <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Concluídas
                    </span>
                  </div>
                  <span className="jarvis-tabular" style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--success-color)' }}>
                    {completedTasks.length}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {completedTasks.length === 0 ? (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '28px 12px' }}>
                      Nenhuma tarefa concluída ainda.
                    </div>
                  ) : (
                    completedTasks.slice(0, 10).map((task, idx) => {
                      const taskKey = task.id || task.task_id || `completed-${idx}`;
                      const isSelected = selectedTask?.id === task.id;
                      const intentInfo = getIntentInfo(task.intent);
                      return (
                        <button
                          key={taskKey}
                          type="button"
                          onClick={() => setSelectedTask(task)}
                          className={`jarvis-choice-card ${isSelected ? 'is-active' : ''}`}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '10px',
                            padding: '10px 12px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                            <CheckCircle2 size={14} color="var(--success-color)" style={{ flexShrink: 0 }} />
                            <span
                              style={{
                                fontSize: '0.82rem',
                                color: 'var(--text-primary)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {task.prompt}
                            </span>
                          </div>
                          <span style={{ fontSize: '0.7rem', color: intentInfo.tone, fontWeight: 500, flexShrink: 0 }}>
                            {intentInfo.label}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {renderTaskInspector()}
          </div>
        </div>
      )}

      {/* ABAS DE VISUALIZAÇÃO AVANÇADA: LISTA, QUADRO E TABELA */}
      {viewMode !== 'hub' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
          {/* Barra de Filtros e Busca */}
          <div className="jarvis-filter-bar">
            <div className="jarvis-search-box" style={{ flex: 1, minWidth: 'min(100%, 240px)' }}>
              <Search size={15} />
              <input
                type="text"
                placeholder="Filtrar tarefas, IDs, intenções ou projetos..."
                aria-label="Buscar tarefas"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="jarvis-search-box__input"
              />
              {searchFilter && (
                <button
                  type="button"
                  onClick={() => setSearchFilter('')}
                  className="btn btn-ghost btn-icon-sm"
                  aria-label="Limpar busca de tarefas"
                  style={{ width: '24px', height: '24px' }}
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div className="jarvis-segmented" role="tablist" aria-label="Filtrar tarefas por status">
                {(
                  [
                    { id: 'ALL', label: 'Todas' },
                    { id: 'PENDING', label: 'Em andamento' },
                    { id: 'COMPLETED', label: 'Concluídas' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={statusFilter === item.id}
                    onClick={() => setStatusFilter(item.id)}
                    className={`jarvis-segmented-btn ${statusFilter === item.id ? 'is-active' : ''}`}
                    style={{ fontSize: '0.75rem', padding: '5px 9px' }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {uniqueIntents.length > 0 && (
                <select
                  value={intentFilter}
                  onChange={(e) => setIntentFilter(e.target.value)}
                  aria-label="Filtrar por intenção"
                  className="jarvis-select"
                  style={{ width: 'auto', minWidth: '160px', fontSize: '0.78rem', padding: '6px 10px' }}
                >
                  <option value="ALL">Todas as Intenções</option>
                  {uniqueIntents.map((intentKey) => (
                    <option key={intentKey} value={intentKey}>
                      {INTENT_MAP[intentKey]?.label || humanizeLabel(intentKey) || intentKey}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Área de Conteúdo + Inspetor Lateral */}
          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: '999 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {loading ? (
                <div className="jarvis-empty-state">
                  <RefreshCw size={22} className="spin" color="var(--text-muted)" />
                  <span style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                    Carregando tarefas do banco de dados...
                  </span>
                </div>
              ) : loadError && tasks.length === 0 ? (
                <div role="status" className="jarvis-error-banner">
                  A lista não está disponível. Tente atualizar após verificar a comunicação com o servidor.
                </div>
              ) : filteredTasks.length === 0 ? (
                <div className="jarvis-empty-state">
                  <ListTodo size={28} color="var(--text-muted)" />
                  <div style={{ fontSize: '0.94rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Nenhuma tarefa encontrada
                  </div>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
                    As tarefas são registadas quando um fluxo é executado no Chat JARVIS.
                  </p>
                </div>
              ) : viewMode === 'kanban' ? (
                /* Quadro Kanban */
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
                    gap: '16px',
                  }}
                >
                  {/* Coluna Em andamento */}
                  <div className="jarvis-settings-card" style={{ gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <RefreshCw size={13} className={filteredPendingTasks.length > 0 ? 'spin' : ''} color="var(--warning-color)" />
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          Em andamento
                        </span>
                      </div>
                      <span className="jarvis-tabular" style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--warning-color)' }}>
                        {filteredPendingTasks.length}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {filteredPendingTasks.length === 0 ? (
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', padding: '24px 8px' }}>
                          Nenhuma tarefa em andamento.
                        </div>
                      ) : (
                        filteredPendingTasks.map((task) => {
                          const agent = getAgentForTask(task);
                          const isSelected = selectedTask?.id === task.id;
                          const intentInfo = getIntentInfo(task.intent);
                          return (
                            <button
                              key={task.id}
                              type="button"
                              className={`jarvis-choice-card ${isSelected ? 'is-active' : ''}`}
                              onClick={() => setSelectedTask(task)}
                              style={{ gap: '8px', textAlign: 'left' }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', width: '100%' }}>
                                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: intentInfo.tone }}>
                                  {intentInfo.label}
                                </span>
                                <span
                                  className="jarvis-tabular"
                                  style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
                                >
                                  #{String(task.id || '').slice(0, 8)}
                                </span>
                              </div>

                              <p style={{ fontSize: '0.83rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.45, fontWeight: 500 }}>
                                {task.prompt}
                              </p>

                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  paddingTop: '6px',
                                  borderTop: '1px solid var(--border-subtle)',
                                  fontSize: '0.72rem',
                                  width: '100%',
                                  gap: '8px',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: agent.color }} />
                                  <span>{agent.name}</span>
                                </div>
                                <span className="jarvis-tabular" style={{ color: 'var(--text-muted)' }}>
                                  {formatDate(task.created_at)}
                                </span>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Coluna Concluídas */}
                  <div className="jarvis-settings-card" style={{ gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CheckCircle2 size={13} color="var(--success-color)" />
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          Concluídas
                        </span>
                      </div>
                      <span className="jarvis-tabular" style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--success-color)' }}>
                        {filteredCompletedTasks.length}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {filteredCompletedTasks.length === 0 ? (
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', padding: '24px 8px' }}>
                          Nenhuma tarefa concluída ainda.
                        </div>
                      ) : (
                        filteredCompletedTasks.map((task) => {
                          const agent = getAgentForTask(task);
                          const isSelected = selectedTask?.id === task.id;
                          const intentInfo = getIntentInfo(task.intent);
                          return (
                            <button
                              key={task.id}
                              type="button"
                              className={`jarvis-choice-card ${isSelected ? 'is-active' : ''}`}
                              onClick={() => setSelectedTask(task)}
                              style={{ gap: '8px', textAlign: 'left' }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', width: '100%' }}>
                                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: intentInfo.tone }}>
                                  {intentInfo.label}
                                </span>
                                <span
                                  className="jarvis-tabular"
                                  style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
                                >
                                  #{String(task.id || '').slice(0, 8)}
                                </span>
                              </div>

                              <p style={{ fontSize: '0.83rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.45 }}>
                                {task.prompt}
                              </p>

                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  paddingTop: '6px',
                                  borderTop: '1px solid var(--border-subtle)',
                                  fontSize: '0.72rem',
                                  width: '100%',
                                  gap: '8px',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: agent.color }} />
                                  <span>{agent.name}</span>
                                </div>
                                <span className="jarvis-tabular" style={{ color: 'var(--text-muted)' }}>
                                  {formatDate(task.created_at)}
                                </span>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              ) : viewMode === 'table' ? (
                /* Tabela de Auditoria */
                <div className="jarvis-table-wrap">
                  <table className="jarvis-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px' }}>Status</th>
                        <th>Descrição da Tarefa</th>
                        <th>Intenção</th>
                        <th>Projeto</th>
                        <th>Sessão</th>
                        <th>Data</th>
                        <th style={{ textAlign: 'right' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedTasks.map((task) => {
                        const isSelected = selectedTask?.id === task.id;
                        const intentInfo = getIntentInfo(task.intent);
                        return (
                          <tr
                            key={task.id}
                            onClick={() => setSelectedTask(task)}
                            style={{
                              backgroundColor: isSelected ? 'var(--bg-surface)' : undefined,
                              cursor: 'pointer',
                            }}
                          >
                            <td>
                              {task.is_completed ? (
                                <CheckCircle2 size={15} color="var(--success-color)" />
                              ) : (
                                <Clock size={15} color="var(--warning-color)" />
                              )}
                            </td>
                            <td style={{ maxWidth: '320px', fontWeight: 500 }}>
                              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {task.prompt}
                              </div>
                            </td>
                            <td>
                              <span style={{ color: intentInfo.tone, fontSize: '0.78rem', fontWeight: 500 }}>
                                {intentInfo.label}
                              </span>
                            </td>
                            <td style={{ color: 'var(--text-secondary)' }}>
                              {task.project_id ? humanizeLabel(task.project_id) : '—'}
                            </td>
                            <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '0.76rem' }}>
                              {task.session_id ? `${String(task.session_id).slice(0, 10)}…` : '—'}
                            </td>
                            <td className="jarvis-tabular" style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
                              {formatDate(task.created_at)}
                            </td>
                            <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                              {canManageTasks && (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(task.id)}
                                  className="btn btn-danger-ghost btn-icon-sm"
                                  title="Excluir tarefa"
                                  aria-label={`Excluir tarefa ${String(task.id || '').slice(0, 8)}`}
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
                /* Lista Densa */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {paginatedTasks.map((task) => {
                    const intentInfo = getIntentInfo(task.intent);
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
                              <CheckCircle2 size={16} color="var(--success-color)" />
                            ) : (
                              <Clock size={16} color="var(--warning-color)" />
                            )}
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                flexWrap: 'wrap',
                                fontSize: '0.71rem',
                                color: 'var(--text-muted)',
                              }}
                            >
                              <span style={{ color: intentInfo.tone, fontWeight: 600 }}>{intentInfo.label}</span>
                              <span aria-hidden="true">·</span>
                              <span
                                style={{
                                  color: task.is_completed ? 'var(--success-color)' : 'var(--warning-color)',
                                  fontWeight: 500,
                                }}
                              >
                                {task.is_completed ? 'Concluída' : 'Em andamento'}
                              </span>
                              {task.project_id && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span style={{ color: 'var(--accent-light)' }}>
                                    {humanizeLabel(task.project_id)}
                                  </span>
                                </>
                              )}
                              <span aria-hidden="true">·</span>
                              <span className="jarvis-tabular" style={{ fontFamily: 'var(--font-mono)' }}>
                                #{String(task.id || '').slice(0, 10)}
                              </span>
                            </div>

                            <p
                              style={{
                                fontSize: '0.86rem',
                                fontWeight: 500,
                                color: 'var(--text-primary)',
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

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0, flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                            <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: agent.color }} />
                            <span>{agent.name}</span>
                          </div>

                          <span className="jarvis-tabular" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {formatDate(task.created_at)}
                          </span>

                          {canManageTasks && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteId(task.id);
                              }}
                              className="btn btn-danger-ghost btn-icon-sm"
                              title="Excluir tarefa"
                              aria-label={`Excluir tarefa ${String(task.id || '').slice(0, 8)}`}
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
                    borderTop: '1px solid var(--border-subtle)',
                    marginTop: '4px',
                  }}
                >
                  <span className="jarvis-tabular" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Mostrando {(currentPage - 1) * PAGE_SIZE + 1}–
                    {Math.min(currentPage * PAGE_SIZE, filteredTasks.length)} de {filteredTasks.length} tarefas
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    >
                      Anterior
                    </button>
                    <span className="jarvis-tabular" style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Próxima
                    </button>
                  </div>
                </div>
              )}
            </div>

            {renderTaskInspector()}
          </div>
        </div>
      )}

      {/* Modal de Confirmação para Excluir Tarefa Individual */}
      <Modal
        isOpen={canManageTasks && !!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        title="Excluir registro de tarefa?"
        subtitle="Esta ação remove o registro da sua conta e não pode ser desfeita."
        icon={<Trash2 size={18} color="var(--danger-color)" />}
        maxWidth="sm"
        footer={
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmDeleteId(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
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
        }
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', margin: 0, lineHeight: 1.55 }}>
          Confirme a exclusão do registro selecionado. Os dados de outras contas não são afetados.
        </p>
      </Modal>

      {/* Modal de Confirmação para Expurgar Antigas */}
      <Modal
        isOpen={canManageTasks && showPurgeModal}
        onClose={() => setShowPurgeModal(false)}
        title="Expurgar tarefas antigas?"
        subtitle="Limpeza de registros antigos da sua conta"
        icon={<Trash2 size={18} color="var(--danger-color)" />}
        maxWidth="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowPurgeModal(false)}
              className="btn btn-secondary btn-sm"
              disabled={purging}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handlePurgeOldTasks}
              className="btn btn-danger btn-sm"
              disabled={purging}
            >
              {purging ? 'Expurgando...' : 'Confirmar Expurgo'}
            </button>
          </>
        }
      >
        <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0 }}>
          Esta ação removerá apenas as tarefas da sua conta com mais de <strong>30 dias</strong>. Tarefas recentes e dados de outras contas não serão afetados.
        </p>
      </Modal>
    </div>
  );
};
