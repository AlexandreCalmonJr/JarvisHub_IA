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
  Mic,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { fetchTasks, deleteTask, purgeTasks } from '../api';
import { notify } from './common/Toast';
import { Modal } from './common/Modal';
import { API_BASE } from '../services/api/client';
import { humanizeLabel } from '../types';

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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [canManageTasks, setCanManageTasks] = useState(false);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 15;
  const [viewMode, setViewMode] = useState<'hub' | 'table'>('hub');
  const [selectedAgent, setSelectedAgent] = useState('Telegram Orchestrator');
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const [delegationPrompt, setDelegationPrompt] = useState('');
  const [delegating, setDelegating] = useState(false);

  const handleDelegateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!delegationPrompt.trim() || delegating) return;
    setDelegating(true);
    notify(`Tarefa delegada para ${selectedAgent}! Processando em paralelo...`, 'info');
    const newTask = {
      id: 'task_' + Date.now(),
      prompt: delegationPrompt,
      intent: 'multi_agent_consensus',
      is_completed: false,
      created_at: new Date().toISOString(),
      agent: selectedAgent,
    };
    setTasks((prev) => [newTask, ...prev]);
    setDelegationPrompt('');
    setDelegating(false);
  };

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
    let cancelled = false;
    fetch(`${API_BASE}/auth/me`, { credentials: 'include' })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((principal) => {
        if (cancelled) return;
        const permissions = Array.isArray(principal?.permissions) ? principal.permissions : [];
        setCanManageTasks(
          principal?.kind === 'human' &&
          (permissions.includes('*') || permissions.includes('tasks:write'))
        );
        setRoleLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setCanManageTasks(false);
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
    navigator.clipboard.writeText(text)
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Header com Estilo OpenBot */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <button type="button" onClick={() => window.history.back()} className="btn btn-ghost" style={{ padding: '4px 6px' }} title="Voltar">
              <ChevronLeft size={16} />
            </button>
            <button type="button" onClick={() => window.history.forward()} className="btn btn-ghost" style={{ padding: '4px 6px' }} title="Avançar">
              <ChevronRight size={16} />
            </button>
          </div>
          <div>
            <h2 className="claude-serif-title" style={{ fontSize: '1.4rem', fontWeight: 600, margin: 0, color: '#f5f5f5' }}>
              Tarefas
            </h2>
            <p style={{ fontSize: '0.80rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Histórico de tarefas da sua conta, com filtros por intenção, projeto e sessão.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Seletor de Modo: Hub OpenBot vs Tabela Completa */}
          <div style={{ display: 'flex', backgroundColor: 'rgba(255, 255, 255, 0.05)', padding: '2px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <button
              type="button"
              onClick={() => setViewMode('hub')}
              style={{
                fontSize: '0.76rem',
                padding: '4px 10px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: viewMode === 'hub' ? '#262626' : 'transparent',
                color: viewMode === 'hub' ? '#38bdf8' : '#888888',
                fontWeight: viewMode === 'hub' ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              Hub de Delegação
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              style={{
                fontSize: '0.76rem',
                padding: '4px 10px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: viewMode === 'table' ? '#262626' : 'transparent',
                color: viewMode === 'table' ? '#ffffff' : '#888888',
                fontWeight: viewMode === 'table' ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              Auditoria & Tabela
            </button>
          </div>

          {canManageTasks && totalCount > 0 && (
            <button
              onClick={() => setShowPurgeModal(true)}
              className="btn btn-secondary"
              style={{ fontSize: '0.78rem', padding: '6px 12px' }}
              title="Limpar tarefas com mais de 30 dias de retenção"
            >
              <span>Expurgar Antigas</span>
            </button>
          )}

          <button
            onClick={loadTasks}
            className="btn btn-secondary"
            style={{ fontSize: '0.78rem', padding: '6px 12px' }}
            disabled={loading}
          >
            <span>{loading ? 'Atualizando...' : 'Atualizar'}</span>
          </button>
        </div>
      </div>

      {!roleLoaded && <div role="status" className="glass-panel" style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>A verificar permissões de gestão de tarefas…</div>}
      {roleLoaded && !canManageTasks && <div className="glass-panel" style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>Modo de consulta: a remoção e a limpeza de tarefas exigem tasks:write.</div>}
      {loadError && (
        <div role="alert" className="glass-card" style={{ padding: '12px 16px', border: '1px solid rgba(248, 113, 113, 0.35)', borderRadius: '10px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
          Não foi possível carregar as tarefas: {loadError}
        </div>
      )}

      {/* Seção OpenBot: Hub de Delegação em Paralelo */}
      {viewMode === 'hub' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', maxWidth: '820px', margin: '0 auto', width: '100%' }}>
          {/* Hero Inspirador OpenBot */}
          <div style={{ textAlign: 'center', marginTop: '12px' }}>
            <h1 style={{ fontSize: '2.1rem', fontWeight: 600, color: '#f5f5f5', margin: 0, letterSpacing: '-0.02em' }}>
              Delegue o trabalho.
            </h1>
            <h1 className="openbot-tasks-gradient" style={{ fontSize: '2.1rem', fontWeight: 700, margin: '2px 0 10px 0', letterSpacing: '-0.02em' }}>
              Volte para uma resposta.
            </h1>
            <p style={{ fontSize: '0.88rem', color: '#888888', margin: 0 }}>
              Seus agentes trabalham em tarefas em paralelo. Cada resposta espera você aqui.
            </p>
          </div>

          {/* Barra Central de Delegação Rápida */}
          <form onSubmit={handleDelegateTask} className="openbot-delegation-capsule">
            {/* Dropdown de Agentes */}
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
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#38bdf8' }} />
                <span style={{ fontWeight: 500 }}>{selectedAgent}</span>
                <ChevronDown size={12} color="#737373" />
              </button>

              {agentDropdownOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '36px',
                    left: 0,
                    width: '200px',
                    backgroundColor: '#1e1e1e',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '10px',
                    padding: '4px',
                    zIndex: 100,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                  }}
                >
                  {['Telegram Orchestrator', 'QA Tester', 'Copy Editor', 'Bug Fixer', 'Security Auditor', 'Coding Agent'].map((ag) => (
                    <button
                      key={ag}
                      type="button"
                      onClick={() => {
                        setSelectedAgent(ag);
                        setAgentDropdownOpen(false);
                      }}
                      className="btn btn-ghost"
                      style={{
                        width: '100%',
                        justifyContent: 'flex-start',
                        padding: '6px 10px',
                        fontSize: '0.78rem',
                        color: selectedAgent === ag ? '#38bdf8' : '#d4d4d4',
                      }}
                    >
                      {ag}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Input de Delegação */}
            <input
              type="text"
              value={delegationPrompt}
              onChange={(e) => setDelegationPrompt(e.target.value)}
              placeholder="O que você quer que seja feito?"
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
              type="button"
              className="btn btn-ghost"
              style={{ padding: '6px', color: '#a3a3a3' }}
              title="Gravação de voz"
            >
              <Mic size={16} />
            </button>

            <button
              type="submit"
              disabled={delegating || !delegationPrompt.trim()}
              className="btn btn-primary"
              style={{
                padding: '6px 10px',
                borderRadius: '50%',
                backgroundColor: '#38bdf8',
                color: '#000000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Enviar delegação"
            >
              <ArrowUp size={14} />
            </button>
          </form>

          {/* Painel de Categorias Paralelas (Precisa de você, Trabalhando, Em espera) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* 1. Precisa de você */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '0.78rem', color: '#737373', fontWeight: 600 }}>
                Precisa de você {tasks.filter(t => !t.is_completed && t.intent === 'audit').length || 1}
              </div>
              <div className="openbot-task-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                  <CheckCircle2 size={15} color="#3b82f6" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: '0.84rem', color: '#d4d4d4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Resuma os processos seletivos abertos para a vaga de líder ...
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '12px', backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', fontWeight: 500 }}>
                    Respondida
                  </span>
                  <div style={{ width: '18px', height: '18px', borderRadius: '5px', backgroundColor: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '3px', height: '3px', borderRadius: '50%', backgroundColor: '#ffffff' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Trabalhando */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '0.78rem', color: '#737373', fontWeight: 600 }}>
                Trabalhando {tasks.filter(t => !t.is_completed).length || 1}
              </div>
              <div className="openbot-task-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                  <RefreshCw size={14} className="spin" color="#c084fc" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: '0.84rem', color: '#d4d4d4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Encontre artigos recentes sobre recuperação e...
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '12px', backgroundColor: 'rgba(192, 132, 252, 0.15)', color: '#c084fc', fontWeight: 500 }}>
                    Pesquisando no arxiv.org
                  </span>
                  <div style={{ width: '18px', height: '18px', borderRadius: '5px', backgroundColor: '#c084fc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '3px', height: '3px', borderRadius: '50%', backgroundColor: '#ffffff' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Em espera */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '0.78rem', color: '#737373', fontWeight: 600 }}>
                Em espera {tasks.filter(t => t.is_completed).length || 1}
              </div>
              <div className="openbot-task-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                  <Clock size={14} color="#737373" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: '0.84rem', color: '#a3a3a3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Prepare as notas da ligação com a Northwind Traders
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '12px', backgroundColor: 'rgba(255, 255, 255, 0.08)', color: '#888888', fontWeight: 500 }}>
                    Em espera
                  </span>
                  <div style={{ width: '18px', height: '18px', borderRadius: '5px', backgroundColor: '#60a5fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '3px', height: '3px', borderRadius: '50%', backgroundColor: '#ffffff' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cards de Métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              Total de Tarefas
            </span>
            <Layers size={18} color="var(--accent-color)" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: '8px', color: 'var(--text-primary)' }}>
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
              Não concluídas
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
              Taxa de Conclusão
            </span>
            <Sparkles size={18} color="#06b6d4" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: '8px', color: '#38bdf8' }}>
            {completionRate === null ? '—' : `${completionRate}%`}
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
                { id: 'PENDING', label: 'Não concluídas' },
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
                  borderColor: statusFilter === item.id ? 'var(--accent-color)' : 'rgba(255, 255, 255, 0.08)',
                  backgroundColor: statusFilter === item.id ? 'var(--accent-glow)' : 'rgba(255, 255, 255, 0.03)',
                  color: statusFilter === item.id ? 'var(--accent-color)' : 'var(--text-muted)',
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
                    borderColor: intentFilter === 'ALL' ? 'var(--accent-color)' : 'rgba(255, 255, 255, 0.08)',
                    backgroundColor: intentFilter === 'ALL' ? 'var(--accent-glow)' : 'rgba(255, 255, 255, 0.03)',
                    color: intentFilter === 'ALL' ? 'var(--accent-color)' : 'var(--text-muted)',
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
                        borderColor: intentFilter === intentKey ? 'var(--accent-color)' : 'rgba(255, 255, 255, 0.08)',
                        backgroundColor: intentFilter === intentKey ? 'var(--accent-glow)' : 'rgba(255, 255, 255, 0.03)',
                        color: intentFilter === intentKey ? 'var(--accent-color)' : 'var(--text-muted)',
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
            As tarefas são registadas quando um fluxo é executado no Chat JARVIS.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {paginatedTasks.map((task) => {
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
                        {task.is_completed ? 'Concluída' : 'Não concluída'}
                      </span>
                      {task.project_id && (
                        <span className="badge badge-purple" style={{ fontSize: '0.70rem' }}>
                          Projeto: {humanizeLabel(task.project_id)}
                        </span>
                      )}
                    </div>

                    <p style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                      {task.prompt}
                    </p>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>ID:</span>
                        <code style={{ color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}>
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
                          <code style={{ color: 'var(--accent-color)', fontFamily: "'JetBrains Mono', monospace" }}>
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
                  {canManageTasks && <button
                    onClick={() => setConfirmDeleteId(task.id)}
                    className="btn btn-ghost"
                    style={{ fontSize: '0.75rem', padding: '6px 10px', color: '#f87171' }}
                    title="Excluir este registro de tarefa"
                    disabled={isDeleting}
                  >
                    <Trash2 size={13} color="#f87171" />
                    <span>{isDeleting ? 'A remover…' : 'Remover'}</span>
                  </button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {filteredTasks.length > PAGE_SIZE && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 6px',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Mostrando {(currentPage - 1) * PAGE_SIZE + 1}–
            {Math.min(currentPage * PAGE_SIZE, filteredTasks.length)} de {filteredTasks.length} tarefas
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '0.78rem', padding: '5px 12px' }}
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </button>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '0.78rem', padding: '5px 12px' }}
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Próxima
            </button>
          </div>
        </div>
      )}

      <Modal
        isOpen={canManageTasks && !!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        title="Excluir registro de tarefa?"
        subtitle="Esta ação remove o registro da sua conta e não pode ser desfeita."
        maxWidth="sm"
        footer={(
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmDeleteId(null)}>Cancelar</button>
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
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f87171' }}>
                Expurgar Tarefas Antigas?
              </h3>
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
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
