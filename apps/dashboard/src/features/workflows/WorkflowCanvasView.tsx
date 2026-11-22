import React, { useState, useRef, useEffect } from 'react';
import {
  Zap,
  Plus,
  Play,
  ZoomIn,
  ZoomOut,
  MousePointer2,
  Hand,
  StickyNote,
  ChevronDown,
  Bot,
  Webhook,
  Clock,
  Sparkles,
  Trash2,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  LayoutTemplate,
  History,
  X,
} from 'lucide-react';
import { notify } from '../../shared/common/Toast';
import {
  fetchAgents,
  fetchWorkflowsHub,
  generateWorkflowFromPrompt,
  saveWorkflowRecord,
  deleteWorkflowRecord,
  executeWorkflowNow,
  subscribeJarvisRealtime,
} from '../../api';
import type { AgentInfo } from '../../types';
import type {
  SavedWorkflowRecord,
  WorkflowRunRecord,
  WorkflowTemplateItem,
} from '../../services/api/orchestration';
import { validateCronSchedule } from '../../services/multiOrchestrator';

export interface WorkflowNode {
  id: string;
  type: 'trigger' | 'agent' | 'condition' | 'action' | 'note';
  title: string;
  subtitle: string;
  iconName: 'zap' | 'bot' | 'clock' | 'webhook' | 'sparkles' | 'note';
  x: number;
  y: number;
  status: 'idle' | 'running' | 'success' | 'error';
  agentRole?: string;
  config?: Record<string, any>;
}

export interface WorkflowConnection {
  id: string;
  fromNodeId: string;
  toNodeId: string;
}

const FALLBACK_NODES: WorkflowNode[] = [
  {
    id: 'node-trigger-1',
    type: 'trigger',
    title: 'Gatilho de Entrada',
    subtitle: 'Agendamento Cron ou Comando no Chat',
    iconName: 'clock',
    x: 90,
    y: 160,
    status: 'idle',
  },
  {
    id: 'node-agent-1',
    type: 'agent',
    title: 'Atlas · Arquiteto',
    subtitle: 'Pesquisa profunda e síntese estruturada',
    iconName: 'bot',
    x: 410,
    y: 160,
    status: 'idle',
  },
  {
    id: 'node-action-1',
    type: 'action',
    title: 'Entregar & Salvar no Cérebro',
    subtitle: 'Notificação + registro no Segundo Cérebro',
    iconName: 'sparkles',
    x: 730,
    y: 160,
    status: 'idle',
  },
];

const FALLBACK_CONNECTIONS: WorkflowConnection[] = [
  { id: 'conn-1', fromNodeId: 'node-trigger-1', toNodeId: 'node-agent-1' },
  { id: 'conn-2', fromNodeId: 'node-agent-1', toNodeId: 'node-action-1' },
];

export const WorkflowCanvasView: React.FC = () => {
  const [workflows, setWorkflows] = useState<SavedWorkflowRecord[]>([]);
  const [templates, setTemplates] = useState<WorkflowTemplateItem[]>([]);
  const [runs, setRuns] = useState<WorkflowRunRecord[]>([]);
  const [installedAgents, setInstalledAgents] = useState<AgentInfo[]>([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);

  const [workflowTitle, setWorkflowTitle] = useState('Rotina Proativa Inteligente');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [scheduleCron, setScheduleCron] = useState('0 8 * * 1-5');
  const [scheduleLabel, setScheduleLabel] = useState('Seg-Sex às 08:00');
  const [scheduleEnabled, setScheduleEnabled] = useState(true);
  const [nodes, setNodes] = useState<WorkflowNode[]>(FALLBACK_NODES);
  const [connections, setConnections] = useState<WorkflowConnection[]>(FALLBACK_CONNECTIONS);

  // Flow Architect natural-language bar
  const [architectPrompt, setArchitectPrompt] = useState('');
  const [generatingFlow, setGeneratingFlow] = useState(false);
  const [savingFlow, setSavingFlow] = useState(false);
  const [runningFlow, setRunningFlow] = useState(false);
  const [loadingHub, setLoadingHub] = useState(true);

  // Panels
  const [showTemplates, setShowTemplates] = useState(false);
  const [showRunLog, setShowRunLog] = useState(false);
  const [activeRun, setActiveRun] = useState<WorkflowRunRecord | null>(null);

  // Canvas interaction state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<'select' | 'pan'>('select');
  const [zoom, setZoom] = useState(100);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [titleDropdownOpen, setTitleDropdownOpen] = useState(false);
  const [isRenamingTitle, setIsRenamingTitle] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [addNodeMenuOpen, setAddNodeMenuOpen] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const applyWorkflowToCanvas = (wf: SavedWorkflowRecord) => {
    setActiveWorkflowId(wf.id);
    setWorkflowTitle(wf.title);
    setWorkflowDescription(wf.description || '');
    setScheduleCron(wf.schedule_cron || '0 9 * * *');
    setScheduleLabel(wf.schedule_label || 'Agendamento ativo');
    setScheduleEnabled(wf.schedule_enabled !== false);
    setNodes(
      Array.isArray(wf.nodes) && wf.nodes.length > 0
        ? wf.nodes.map((n) => ({ ...n, status: n.status || 'idle' }))
        : FALLBACK_NODES
    );
    setConnections(Array.isArray(wf.connections) ? wf.connections : FALLBACK_CONNECTIONS);
    setSelectedNodeId(null);
    setPanOffset({ x: 0, y: 0 });
    setZoom(100);
  };

  useEffect(() => {
    let active = true;
    setLoadingHub(true);
    fetchWorkflowsHub()
      .then((hub) => {
        if (!active) return;
        const wfList = Array.isArray(hub.workflows) ? hub.workflows : [];
        setWorkflows(wfList);
        setTemplates(Array.isArray(hub.templates) ? hub.templates : []);
        const runList = Array.isArray(hub.runs) ? hub.runs : [];
        setRuns(runList);
        if (runList.length > 0) setActiveRun(runList[0]);
        if (wfList.length > 0) {
          applyWorkflowToCanvas(wfList[0]);
        }
      })
      .catch((err) => {
        if (active) console.warn('Falha ao carregar Workflows Hub:', err);
      })
      .finally(() => {
        if (active) setLoadingHub(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadAgents = () => {
      fetchAgents()
        .then((list) => {
          if (active && Array.isArray(list)) setInstalledAgents(list);
        })
        .catch(() => {});
    };
    loadAgents();
    window.addEventListener('jarvis:agents-updated', loadAgents);
    return () => {
      active = false;
      window.removeEventListener('jarvis:agents-updated', loadAgents);
    };
  }, []);

  // Subscribe to real-time execution progress
  useEffect(() => {
    return subscribeJarvisRealtime((event) => {
      const data = event.payload || {};
      if (event.type === 'workflow_run_progress' && data.node_id) {
        setNodes((prev) =>
          prev.map((n) =>
            n.id === data.node_id
              ? { ...n, status: (data.status as WorkflowNode['status']) || 'running' }
              : n
          )
        );
      }
    });
  }, []);

  const isCronValid = validateCronSchedule(scheduleCron);

  const handleGenerateFromPrompt = async (promptOverride?: string) => {
    const prompt = (promptOverride ?? architectPrompt).trim();
    if (!prompt) {
      notify('Descreva o fluxo desejado em português para o Flow Architect montar.', 'warning');
      return;
    }
    setGeneratingFlow(true);
    try {
      const created = await generateWorkflowFromPrompt(prompt);
      setWorkflows((prev) => [created, ...prev.filter((w) => w.id !== created.id)]);
      applyWorkflowToCanvas(created);
      setArchitectPrompt('');
      setShowTemplates(false);
      notify(`Flow Architect montou "${created.title}" com ${created.nodes.length} nós.`, 'success');
    } catch (err: any) {
      notify(err?.message || 'Erro ao gerar fluxo com Flow Architect.', 'error');
    } finally {
      setGeneratingFlow(false);
    }
  };

  const handleSaveWorkflow = async () => {
    if (!isCronValid) {
      notify('Expressão Cron inválida. Use 5 campos (ex.: 0 9 * * *).', 'warning');
      return;
    }
    setSavingFlow(true);
    try {
      const saved = await saveWorkflowRecord({
        id: activeWorkflowId || undefined,
        title: workflowTitle.trim() || 'Fluxo sem título',
        description: workflowDescription,
        schedule_cron: scheduleCron.trim(),
        schedule_label: scheduleLabel.trim() || scheduleCron.trim(),
        schedule_enabled: scheduleEnabled,
        nodes,
        connections,
      });
      setActiveWorkflowId(saved.id);
      setWorkflows((prev) => [saved, ...prev.filter((w) => w.id !== saved.id)]);
      notify(`Fluxo "${saved.title}" salvo com agendamento (${saved.schedule_cron}).`, 'success');
    } catch (err: any) {
      notify(err?.message || 'Erro ao salvar fluxo.', 'error');
    } finally {
      setSavingFlow(false);
    }
  };

  const handleDeleteWorkflow = async () => {
    if (!activeWorkflowId) return;
    try {
      await deleteWorkflowRecord(activeWorkflowId);
      const remaining = workflows.filter((w) => w.id !== activeWorkflowId);
      setWorkflows(remaining);
      if (remaining.length > 0) {
        applyWorkflowToCanvas(remaining[0]);
      } else {
        setActiveWorkflowId(null);
        setWorkflowTitle('Novo Fluxo');
        setNodes(FALLBACK_NODES);
        setConnections(FALLBACK_CONNECTIONS);
      }
      setTitleDropdownOpen(false);
      notify('Fluxo removido.', 'info');
    } catch (err: any) {
      notify(err?.message || 'Erro ao remover fluxo.', 'error');
    }
  };

  const handleRunWorkflow = async () => {
    setRunningFlow(true);
    setShowRunLog(true);
    if (nodes.length >= 4) {
      setZoom(74);
      setPanOffset({ x: -30, y: 10 });
    }
    try {
      // Ensure workflow is persisted first so backend runs exact current nodes
      let targetId = activeWorkflowId;
      const saved = await saveWorkflowRecord({
        id: targetId || undefined,
        title: workflowTitle.trim() || 'Fluxo de Trabalho',
        description: workflowDescription,
        schedule_cron: isCronValid ? scheduleCron.trim() : '0 9 * * *',
        schedule_label: scheduleLabel,
        schedule_enabled: scheduleEnabled,
        nodes,
        connections,
      });
      targetId = saved.id;
      setActiveWorkflowId(saved.id);
      setWorkflows((prev) => [saved, ...prev.filter((w) => w.id !== saved.id)]);

      // Mark nodes running immediately
      setNodes((prev) => prev.map((n, i) => ({ ...n, status: i === 0 ? 'running' : 'idle' })));

      const run = await executeWorkflowNow(targetId);
      setActiveRun(run);
      setRuns((prev) => [run, ...prev.filter((r) => r.id !== run.id)].slice(0, 20));
      setNodes((prev) =>
        prev.map((n) => {
          const step = run.steps.find((s) => s.node_id === n.id);
          return { ...n, status: step ? step.status : 'success' };
        })
      );
      setWorkflows((prev) =>
        prev.map((w) =>
          w.id === targetId
            ? { ...w, last_run_at: run.finished_at, last_run_status: run.status }
            : w
        )
      );
      notify(`Fluxo "${saved.title}" executado (${run.steps.length} etapas concluídas).`, 'success');
    } catch (err: any) {
      setNodes((prev) => prev.map((n) => ({ ...n, status: n.status === 'running' ? 'error' : n.status })));
      notify(err?.message || 'Erro durante a execução do fluxo.', 'error');
    } finally {
      setRunningFlow(false);
    }
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 15, 180));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 15, 50));
  const handleResetZoom = () => {
    setZoom(100);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {
    if (activeTool !== 'select') return;
    e.stopPropagation();
    setSelectedNodeId(id);
    setDraggingNodeId(id);
    const node = nodes.find((n) => n.id === id);
    if (node) {
      setDragOffset({
        x: e.clientX / (zoom / 100) - node.x,
        y: e.clientY / (zoom / 100) - node.y,
      });
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (activeTool === 'pan' || e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      setStartPan({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    } else {
      setSelectedNodeId(null);
      setAddNodeMenuOpen(false);
      setTitleDropdownOpen(false);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPanOffset({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
    } else if (draggingNodeId) {
      const scale = zoom / 100;
      const newX = Math.round(e.clientX / scale - dragOffset.x);
      const newY = Math.round(e.clientY / scale - dragOffset.y);
      setNodes((prev) => prev.map((n) => (n.id === draggingNodeId ? { ...n, x: newX, y: newY } : n)));
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingNodeId(null);
  };

  const handleAddNode = (
    type: WorkflowNode['type'],
    title: string,
    subtitle: string,
    iconName: WorkflowNode['iconName'],
    agentRole?: string
  ) => {
    const id = `node-${Date.now().toString(36)}`;
    const lastNode = nodes[nodes.length - 1];
    const newNode: WorkflowNode = {
      id,
      type,
      title,
      subtitle,
      iconName,
      x: lastNode ? lastNode.x + 310 : 120,
      y: lastNode ? lastNode.y : 180,
      status: 'idle',
      agentRole,
    };
    setNodes((prev) => [...prev, newNode]);
    const connectFrom = selectedNodeId || lastNode?.id;
    if (connectFrom) {
      setConnections((prev) => [...prev, { id: `conn-${Date.now().toString(36)}`, fromNodeId: connectFrom, toNodeId: id }]);
    }
    setSelectedNodeId(id);
    setAddNodeMenuOpen(false);
    notify(`Passo "${title}" adicionado ao fluxo.`, 'info');
  };

  const handleUpdateSelectedNode = (patch: Partial<WorkflowNode>) => {
    if (!selectedNodeId) return;
    setNodes((prev) =>
      prev.map((n) => (n.id === selectedNodeId ? { ...n, ...patch } : n))
    );
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;

  const handleDeleteSelected = () => {
    if (!selectedNodeId) return;
    setNodes((prev) => prev.filter((n) => n.id !== selectedNodeId));
    setConnections((prev) => prev.filter((c) => c.fromNodeId !== selectedNodeId && c.toNodeId !== selectedNodeId));
    setSelectedNodeId(null);
    notify('Passo removido do fluxo.', 'info');
  };

  const getNodeCenter = (id: string) => {
    const node = nodes.find((n) => n.id === id);
    if (!node) return { x: 0, y: 0 };
    return { x: node.x + 130, y: node.y + 46 };
  };

  const renderIcon = (name: WorkflowNode['iconName']) => {
    switch (name) {
      case 'zap':
        return <Zap size={15} color="#fbbf24" />;
      case 'bot':
        return <Bot size={15} color="var(--accent-light)" />;
      case 'clock':
        return <Clock size={15} color="var(--accent-light)" />;
      case 'webhook':
        return <Webhook size={15} color="#4ade80" />;
      case 'note':
        return <StickyNote size={15} color="#fbbf24" />;
      default:
        return <Sparkles size={15} color="var(--accent-light)" />;
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 'calc(100vh - 60px)',
        backgroundColor: 'var(--bg-primary)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top Header: Switcher, Cron Schedule & Primary Run CTA */}
      <header
        style={{
          padding: '10px 18px',
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
          zIndex: 30,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', minWidth: 0 }}>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setTitleDropdownOpen((p) => !p)}
              className="btn btn-secondary btn-sm"
            >
              <span style={{ fontWeight: 600, maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {workflowTitle}
              </span>
              <ChevronDown size={14} color="var(--text-muted)" />
            </button>

            {titleDropdownOpen && (
              <div
                className="jarvis-popover"
                style={{
                  position: 'absolute',
                  top: '38px',
                  left: 0,
                  width: '280px',
                  zIndex: 60,
                  maxHeight: '360px',
                  overflowY: 'auto',
                }}
              >
                <div className="jarvis-popover__label">Fluxos salvos ({workflows.length})</div>
                {workflows.map((wf) => (
                  <button
                    key={wf.id}
                    type="button"
                    onClick={() => {
                      applyWorkflowToCanvas(wf);
                      setTitleDropdownOpen(false);
                    }}
                    className={`btn btn-ghost btn-sm btn-block btn-start ${wf.id === activeWorkflowId ? 'is-active' : ''}`}
                    style={{ justifyContent: 'space-between' }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wf.title}</span>
                    <span className="jarvis-tabular" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {wf.nodes.length} nós
                    </span>
                  </button>
                ))}
                <div style={{ height: '1px', background: 'var(--border-color)', margin: '6px 0' }} />

                {isRenamingTitle ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const cleaned = renameDraft.trim();
                      if (cleaned) setWorkflowTitle(cleaned);
                      setIsRenamingTitle(false);
                      setTitleDropdownOpen(false);
                    }}
                    style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '4px' }}
                  >
                    <input
                      type="text"
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      autoFocus
                      aria-label="Novo nome do fluxo"
                      className="jarvis-input"
                      style={{ fontSize: '0.8rem', padding: '6px 9px' }}
                    />
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <button type="button" className="btn btn-ghost btn-xs" onClick={() => setIsRenamingTitle(false)}>
                        Cancelar
                      </button>
                      <button type="submit" className="btn btn-primary btn-xs">
                        Aplicar
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setRenameDraft(workflowTitle);
                      setIsRenamingTitle(true);
                    }}
                    className="btn btn-ghost btn-sm btn-block btn-start"
                  >
                    Renomear fluxo atual
                  </button>
                )}

                {activeWorkflowId && (
                  <button
                    type="button"
                    onClick={handleDeleteWorkflow}
                    className="btn btn-danger-ghost btn-sm btn-block btn-start"
                  >
                    <Trash2 size={13} />
                    <span>Excluir este fluxo</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Cron Schedule Editor inline */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 8px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-primary)',
              border: `1px solid ${isCronValid ? 'var(--border-color)' : 'var(--danger-color)'}`,
            }}
          >
            <Clock size={13} color={scheduleEnabled ? 'var(--accent-light)' : 'var(--text-muted)'} />
            <input
              type="text"
              aria-label="Expressão Cron do fluxo"
              value={scheduleCron}
              onChange={(e) => setScheduleCron(e.target.value)}
              style={{
                width: '104px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                outline: 'none',
              }}
              title="Expressão Cron (min hora dia mês semana)"
            />
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={scheduleEnabled}
                onChange={(e) => setScheduleEnabled(e.target.checked)}
                style={{ accentColor: '#f97316' }}
              />
              <span>{scheduleEnabled ? 'Agendado' : 'Manual'}</span>
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setShowTemplates((p) => !p)}
            className={`btn btn-sm ${showTemplates ? 'btn-secondary is-active' : 'btn-ghost'}`}
          >
            <LayoutTemplate size={14} />
            <span>Templates ({templates.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setShowRunLog((p) => !p)}
            className={`btn btn-sm ${showRunLog ? 'btn-secondary is-active' : 'btn-ghost'}`}
          >
            <History size={14} />
            <span>Execuções ({runs.length})</span>
          </button>

          {selectedNodeId && (
            <button
              type="button"
              onClick={handleDeleteSelected}
              className="btn btn-danger-ghost btn-sm"
              title="Excluir nó selecionado"
            >
              <Trash2 size={14} />
              <span>Excluir Nó</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSaveWorkflow}
            disabled={savingFlow}
            className="btn btn-secondary btn-sm"
          >
            {savingFlow ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            <span>Salvar</span>
          </button>

          <button
            type="button"
            data-testid="run-workflow-now-btn"
            onClick={handleRunWorkflow}
            disabled={runningFlow}
            className="btn btn-primary btn-sm"
          >
            {runningFlow ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} fill="currentColor" />}
            <span>{runningFlow ? 'Executando...' : 'Executar Agora'}</span>
          </button>
        </div>
      </header>

      {/* Flow Architect (Creation Flow) Natural-Language Prompt Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleGenerateFromPrompt();
        }}
        style={{
          padding: '10px 18px',
          backgroundColor: 'rgba(18, 22, 31, 0.92)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'wrap',
          zIndex: 25,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--accent-light)', fontSize: '0.78rem', fontWeight: 700, flexShrink: 0 }}>
          <Sparkles size={15} />
          <span>Flow Architect</span>
        </div>
        <input
          type="text"
          data-testid="flow-architect-prompt"
          aria-label="Descreva o fluxo em português"
          value={architectPrompt}
          onChange={(e) => setArchitectPrompt(e.target.value)}
          placeholder="Descreva a rotina em português: ex. Todo dia às 9h chama o Atlas para pesquisar tendências e o Dante para montar slides PowerPoint"
          className="jarvis-input"
          style={{ flex: '1 1 320px', fontSize: '0.82rem', padding: '8px 12px' }}
        />
        <button
          type="submit"
          data-testid="generate-workflow-btn"
          disabled={generatingFlow}
          className="btn btn-primary btn-sm"
        >
          {generatingFlow ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          <span>{generatingFlow ? 'Montando fluxo...' : 'Gerar Fluxo'}</span>
        </button>
      </form>

      {/* Galeria de Templates (1-Click) */}
      {showTemplates && (
        <div
          style={{
            padding: '12px 18px',
            backgroundColor: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border-color)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '10px',
            flexShrink: 0,
          }}
        >
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => void handleGenerateFromPrompt(tpl.prompt_seed)}
              disabled={generatingFlow}
              className="jarvis-choice-card"
              style={{ textAlign: 'left', padding: '10px 12px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '8px' }}>
                <strong style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>{tpl.name}</strong>
                <span style={{ fontSize: '0.68rem', color: 'var(--accent-light)', fontFamily: 'var(--font-mono)' }}>
                  {tpl.schedule_label}
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                {tpl.description}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Main Split: Infinite Canvas + Optional Execution Log Drawer */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        <div
          ref={canvasRef}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          data-testid="workflow-canvas"
          style={{
            flex: 1,
            position: 'relative',
            cursor: activeTool === 'pan' || isPanning ? 'grab' : 'default',
            backgroundImage: 'radial-gradient(circle, rgba(148, 163, 184, 0.16) 1.2px, transparent 1.2px)',
            backgroundSize: '24px 24px',
            backgroundColor: 'var(--bg-primary)',
            overflow: 'hidden',
          }}
        >
          {loadingHub && (
            <div style={{ position: 'absolute', top: '14px', left: '16px', zIndex: 20, fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              Carregando fluxos salvos…
            </div>
          )}

          <div
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom / 100})`,
              transformOrigin: '0 0',
              transition: isPanning || draggingNodeId ? 'none' : 'transform 0.15s ease-out',
            }}
          >
            <svg
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '4000px',
                height: '4000px',
                pointerEvents: 'none',
                zIndex: 1,
              }}
            >
              {connections.map((conn) => {
                const from = getNodeCenter(conn.fromNodeId);
                const to = getNodeCenter(conn.toNodeId);
                const dx = to.x - from.x;
                const controlOffset = Math.max(Math.abs(dx) * 0.45, 55);
                const pathData = `M ${from.x} ${from.y} C ${from.x + controlOffset} ${from.y}, ${to.x - controlOffset} ${to.y}, ${to.x} ${to.y}`;
                const fromNode = nodes.find((n) => n.id === conn.fromNodeId);
                const strokeColor =
                  fromNode?.status === 'success'
                    ? 'rgba(74, 222, 128, 0.65)'
                    : fromNode?.status === 'running'
                      ? 'rgba(249, 115, 22, 0.85)'
                      : 'rgba(255, 255, 255, 0.22)';

                return (
                  <path
                    key={conn.id}
                    d={pathData}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth="2.5"
                  />
                );
              })}
            </svg>

            {nodes.map((node) => {
              const isSelected = selectedNodeId === node.id;
              const isNodeRunning = node.status === 'running';
              const isSuccess = node.status === 'success';
              const isError = node.status === 'error';

              return (
                <div
                  key={node.id}
                  data-testid="workflow-node"
                  data-node-status={node.status}
                  onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                  style={{
                    position: 'absolute',
                    left: `${node.x}px`,
                    top: `${node.y}px`,
                    width: '260px',
                    backgroundColor: isSelected ? 'var(--bg-tertiary)' : 'var(--bg-surface)',
                    borderRadius: 'var(--radius-lg)',
                    border: isSelected
                      ? '2px solid var(--accent-color)'
                      : isNodeRunning
                        ? '2px solid #f97316'
                        : isSuccess
                          ? '1.5px solid #4ade80'
                          : isError
                            ? '1.5px solid #ef4444'
                            : '1px solid var(--border-color)',
                    padding: '14px 16px',
                    zIndex: isSelected ? 10 : 2,
                    cursor: activeTool === 'select' ? 'move' : 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: 'var(--radius-md)',
                          backgroundColor: 'var(--bg-tertiary)',
                          border: '1px solid var(--border-subtle)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {renderIcon(node.iconName)}
                      </div>
                      <span
                        style={{
                          fontSize: '0.67rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {node.type}
                      </span>
                    </div>

                    {isNodeRunning && <span style={{ fontSize: '0.7rem', color: '#fb923c', fontWeight: 700 }}>Executando…</span>}
                    {isSuccess && <span style={{ fontSize: '0.7rem', color: '#4ade80', fontWeight: 700 }}>Concluído</span>}
                    {isError && <span style={{ fontSize: '0.7rem', color: '#f87171', fontWeight: 700 }}>Erro</span>}
                  </div>

                  <div style={{ fontWeight: 600, fontSize: '0.86rem', color: 'var(--text-primary)', marginBottom: '4px' }}>
                    {node.title}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                    {node.subtitle}
                  </div>

                  <div
                    style={{
                      position: 'absolute',
                      right: '-6px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: '11px',
                      height: '11px',
                      borderRadius: '50%',
                      backgroundColor: isSuccess ? '#4ade80' : isSelected ? 'var(--accent-light)' : 'var(--text-muted)',
                      border: '2px solid var(--bg-primary)',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      left: '-6px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: '11px',
                      height: '11px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--text-muted)',
                      border: '2px solid var(--bg-primary)',
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* Bottom Floating Controls */}
          <div
            style={{
              position: 'absolute',
              bottom: '20px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 40,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-lg)',
              padding: '6px 12px',
              userSelect: 'none',
            }}
          >
            <button type="button" onClick={handleZoomOut} className="btn btn-ghost btn-icon-sm" aria-label="Reduzir zoom">
              <ZoomOut size={15} />
            </button>
            <button type="button" onClick={handleResetZoom} className="btn btn-ghost btn-xs jarvis-tabular" style={{ fontFamily: 'var(--font-mono)' }}>
              {zoom}%
            </button>
            <button type="button" onClick={handleZoomIn} className="btn btn-ghost btn-icon-sm" aria-label="Aumentar zoom">
              <ZoomIn size={15} />
            </button>

            <div style={{ width: '1px', height: '18px', backgroundColor: 'var(--border-color)' }} />

            <button
              type="button"
              onClick={() => setActiveTool('select')}
              className={`btn btn-icon-sm ${activeTool === 'select' ? 'btn-secondary is-active' : 'btn-ghost'}`}
              aria-label="Ferramenta Seleção"
            >
              <MousePointer2 size={15} />
            </button>
            <button
              type="button"
              onClick={() => setActiveTool('pan')}
              className={`btn btn-icon-sm ${activeTool === 'pan' ? 'btn-secondary is-active' : 'btn-ghost'}`}
              aria-label="Ferramenta Arrastar Canvas"
            >
              <Hand size={15} />
            </button>

            <div style={{ width: '1px', height: '18px', backgroundColor: 'var(--border-color)' }} />

            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setAddNodeMenuOpen((p) => !p)}
                className="btn btn-secondary btn-sm"
              >
                <Plus size={14} />
                <span>Adicionar nó</span>
              </button>

              {addNodeMenuOpen && (
                <div
                  className="jarvis-popover"
                  style={{ position: 'absolute', bottom: '44px', right: 0, width: '260px', maxHeight: '320px', overflowY: 'auto', zIndex: 60 }}
                >
                  <div className="jarvis-popover__label">Adicionar ao fluxo</div>
                  <button
                    type="button"
                    onClick={() => handleAddNode('trigger', 'Agendamento Automático', `Executa conforme agenda (${scheduleCron})`, 'clock')}
                    className="btn btn-ghost btn-sm btn-block btn-start"
                  >
                    <Clock size={14} color="var(--accent-light)" />
                    <span>Gatilho: Agendamento</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddNode('action', 'Salvar Resultado & Avisar', 'Gera entregável e salva no seu Cérebro', 'sparkles')}
                    className="btn btn-ghost btn-sm btn-block btn-start"
                  >
                    <Sparkles size={14} color="#fbbf24" />
                    <span>Ação: Entregável + Notificação</span>
                  </button>
                  <div className="jarvis-popover__label" style={{ marginTop: '6px' }}>
                    Agentes instalados ({installedAgents.length})
                  </div>
                  {(installedAgents.length > 0 ? installedAgents.slice(0, 10) : []).map((ag) => (
                    <button
                      key={ag.role}
                      type="button"
                      onClick={() =>
                        handleAddNode(
                          'agent',
                          ag.name || ag.role,
                          ag.mission || 'Executa a etapa com a especialidade deste agente',
                          'bot',
                          ag.role
                        )
                      }
                      className="btn btn-ghost btn-sm btn-block btn-start"
                    >
                      <Bot size={14} color="var(--accent-light)" />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ag.name || ag.role}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Node Editor Drawer (appears when a node is selected and Run Log is closed) */}
        {selectedNode && !showRunLog && (
          <aside
            data-testid="workflow-node-editor"
            aria-label="Editor do Passo Selecionado"
            style={{
              width: '340px',
              maxWidth: '90vw',
              backgroundColor: 'var(--bg-secondary)',
              borderLeft: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                padding: '12px 14px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <strong style={{ fontSize: '0.86rem', color: 'var(--text-primary)' }}>Editar Passo do Fluxo</strong>
              <button
                type="button"
                onClick={() => setSelectedNodeId(null)}
                className="btn btn-ghost btn-icon-sm"
                aria-label="Fechar editor de passo"
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label
                  htmlFor="wf-node-type"
                  style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}
                >
                  Tipo de etapa
                </label>
                <select
                  id="wf-node-type"
                  className="jarvis-select"
                  value={selectedNode.type}
                  onChange={(e) => {
                    const nextType = e.target.value as WorkflowNode['type'];
                    const iconByType: Record<WorkflowNode['type'], WorkflowNode['iconName']> = {
                      trigger: 'clock',
                      agent: 'bot',
                      condition: 'zap',
                      action: 'sparkles',
                      note: 'note',
                    };
                    handleUpdateSelectedNode({ type: nextType, iconName: iconByType[nextType] });
                  }}
                >
                  <option value="trigger">Gatilho (Quando iniciar)</option>
                  <option value="agent">Agente Instalado</option>
                  <option value="action">Ação / Entrega</option>
                  <option value="condition">Condição / Verificação</option>
                  <option value="note">Anotação</option>
                </select>
              </div>

              {selectedNode.type === 'agent' && (
                <div>
                  <label
                    htmlFor="wf-node-agent"
                    style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}
                  >
                    Agente responsável ({installedAgents.length} instalados)
                  </label>
                  <select
                    id="wf-node-agent"
                    className="jarvis-select"
                    value={selectedNode.agentRole || ''}
                    onChange={(e) => {
                      const role = e.target.value;
                      const chosen = installedAgents.find((a) => a.role === role);
                      handleUpdateSelectedNode({
                        agentRole: role || undefined,
                        title: chosen ? chosen.name || chosen.role : selectedNode.title,
                      });
                    }}
                  >
                    <option value="">Escolher agente instalado…</option>
                    {installedAgents.map((ag) => (
                      <option key={ag.role} value={ag.role}>
                        {ag.name || ag.role}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label
                  htmlFor="wf-node-title"
                  style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}
                >
                  Nome do passo
                </label>
                <input
                  id="wf-node-title"
                  type="text"
                  className="jarvis-input"
                  value={selectedNode.title}
                  onChange={(e) => handleUpdateSelectedNode({ title: e.target.value })}
                />
              </div>

              <div>
                <label
                  htmlFor="wf-node-subtitle"
                  style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}
                >
                  O que este passo deve fazer?
                </label>
                <textarea
                  id="wf-node-subtitle"
                  rows={4}
                  className="jarvis-textarea"
                  value={selectedNode.subtitle}
                  onChange={(e) => handleUpdateSelectedNode({ subtitle: e.target.value })}
                  placeholder="Descreva a ação ou instrução desejada..."
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', paddingTop: '6px', borderTop: '1px solid var(--border-subtle)' }}>
                <button
                  type="button"
                  onClick={handleSaveWorkflow}
                  disabled={savingFlow}
                  className="btn btn-primary btn-sm"
                  style={{ flex: 1 }}
                >
                  <Save size={13} />
                  <span>Salvar Fluxo</span>
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  className="btn btn-danger-ghost btn-sm"
                  aria-label="Excluir passo selecionado"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </aside>
        )}

        {/* Right Execution Log Drawer */}
        {showRunLog && (
          <aside
            data-testid="workflow-run-log"
            aria-label="Log de Execução do Fluxo"
            style={{
              width: '360px',
              maxWidth: '90vw',
              backgroundColor: 'var(--bg-secondary)',
              borderLeft: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                padding: '12px 14px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <strong style={{ fontSize: '0.86rem', color: 'var(--text-primary)' }}>Log de Execução Real</strong>
              <button
                type="button"
                onClick={() => setShowRunLog(false)}
                className="btn btn-ghost btn-icon-sm"
                aria-label="Fechar log de execução"
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {runningFlow && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--accent-light)' }}>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Executando etapas do fluxo em sequência…</span>
                </div>
              )}

              {activeRun ? (
                <>
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {activeRun.workflow_title}
                      </span>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          color: activeRun.status === 'success' ? '#4ade80' : '#f87171',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {activeRun.status === 'success' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                        {activeRun.status === 'success' ? 'Sucesso' : 'Falha'}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                      {activeRun.summary}
                    </p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {activeRun.steps.map((step, idx) => (
                      <div
                        key={`${step.node_id}-${idx}`}
                        style={{
                          padding: '9px 11px',
                          borderRadius: 'var(--radius-md)',
                          backgroundColor: 'var(--bg-primary)',
                          border: '1px solid var(--border-subtle)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {idx + 1}. {step.title}
                          </span>
                          <span className="jarvis-tabular" style={{ fontSize: '0.7rem', color: '#4ade80', fontFamily: 'var(--font-mono)' }}>
                            {step.duration_ms} ms
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                          {step.output}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Clique em <strong>Executar Agora</strong> para rodar cada etapa do fluxo e registrar o resultado no Segundo Cérebro.
                </div>
              )}

              {runs.length > 1 && (
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>Histórico recente</span>
                  {runs.slice(0, 5).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setActiveRun(r)}
                      className={`btn btn-ghost btn-xs btn-start ${activeRun?.id === r.id ? 'is-active' : ''}`}
                      style={{ justifyContent: 'space-between', border: '1px solid var(--border-subtle)', padding: '6px 8px' }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.workflow_title}</span>
                      <span className="jarvis-tabular" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        {r.steps.length} etapas
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
