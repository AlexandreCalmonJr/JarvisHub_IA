import React, { useState, useRef } from 'react';
import {
  Zap,
  Plus,
  Play,
  ZoomIn,
  ZoomOut,
  MousePointer2,
  Hand,
  PenTool,
  StickyNote,
  SquareCode,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Bot,
  Webhook,
  Clock,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { notify } from '../common/Toast';

export interface WorkflowNode {
  id: string;
  type: 'trigger' | 'agent' | 'condition' | 'action' | 'note';
  title: string;
  subtitle: string;
  iconName: 'zap' | 'bot' | 'clock' | 'webhook' | 'sparkles' | 'note';
  x: number;
  y: number;
  status: 'idle' | 'running' | 'success' | 'error';
  config?: Record<string, any>;
}

export interface WorkflowConnection {
  id: string;
  fromNodeId: string;
  toNodeId: string;
}

const INITIAL_NODES: WorkflowNode[] = [
  {
    id: 'node-trigger-1',
    type: 'trigger',
    title: 'Gatilho de Entrada',
    subtitle: 'Webhook ou Mensagem do Chat',
    iconName: 'zap',
    x: 180,
    y: 220,
    status: 'idle',
  },
  {
    id: 'node-agent-1',
    type: 'agent',
    title: 'Especialista Orchestrator',
    subtitle: 'Roteamento Inteligente & Decomposição',
    iconName: 'bot',
    x: 520,
    y: 220,
    status: 'idle',
  },
  {
    id: 'node-action-1',
    type: 'action',
    title: 'Despacho & Notificação',
    subtitle: 'Alerta via Telegram / Hub UI',
    iconName: 'sparkles',
    x: 860,
    y: 220,
    status: 'idle',
  },
];

const INITIAL_CONNECTIONS: WorkflowConnection[] = [
  { id: 'conn-1', fromNodeId: 'node-trigger-1', toNodeId: 'node-agent-1' },
  { id: 'conn-2', fromNodeId: 'node-agent-1', toNodeId: 'node-action-1' },
];

export const WorkflowCanvasView: React.FC = () => {
  const [nodes, setNodes] = useState<WorkflowNode[]>(INITIAL_NODES);
  const [connections, setConnections] = useState<WorkflowConnection[]>(INITIAL_CONNECTIONS);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<'select' | 'pan' | 'draw' | 'note' | 'node' | 'text' | 'search'>('select');
  const [zoom, setZoom] = useState(100);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [workflowTitle, setWorkflowTitle] = useState('Fluxos de trabalho sem título');
  const [titleDropdownOpen, setTitleDropdownOpen] = useState(false);
  const [addNodeMenuOpen, setAddNodeMenuOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Manipulação de Zoom
  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 15, 200));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 15, 40));
  const handleResetZoom = () => {
    setZoom(100);
    setPanOffset({ x: 0, y: 0 });
  };

  // Dragging de Nós
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

  // Canvas Mouse Down para Pan
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

  // Mouse Move Global do Canvas
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPanOffset({
        x: e.clientX - startPan.x,
        y: e.clientY - startPan.y,
      });
    } else if (draggingNodeId) {
      const scale = zoom / 100;
      const newX = Math.round(e.clientX / scale - dragOffset.x);
      const newY = Math.round(e.clientY / scale - dragOffset.y);
      setNodes((prev) =>
        prev.map((n) => (n.id === draggingNodeId ? { ...n, x: newX, y: newY } : n))
      );
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingNodeId(null);
  };

  // Adicionar Novo Nó
  const handleAddNode = (type: WorkflowNode['type'], title: string, subtitle: string, iconName: WorkflowNode['iconName']) => {
    const id = `node-${Date.now()}`;
    const newNode: WorkflowNode = {
      id,
      type,
      title,
      subtitle,
      iconName,
      x: 350 - panOffset.x / (zoom / 100),
      y: 250 - panOffset.y / (zoom / 100),
      status: 'idle',
    };
    setNodes((prev) => [...prev, newNode]);
    if (selectedNodeId) {
      setConnections((prev) => [...prev, { id: `conn-${Date.now()}`, fromNodeId: selectedNodeId, toNodeId: id }]);
    }
    setSelectedNodeId(id);
    setAddNodeMenuOpen(false);
    notify(`Nó "${title}" adicionado ao fluxo.`, 'info');
  };

  // Executar Fluxo de Trabalho (Simulação Animada)
  const handleRunWorkflow = async () => {
    if (isRunning) return;
    setIsRunning(true);
    notify('Iniciando execução do fluxo de nós em paralelo...', 'info');

    for (let i = 0; i < nodes.length; i++) {
      const currentNode = nodes[i];
      setNodes((prev) =>
        prev.map((n) => (n.id === currentNode.id ? { ...n, status: 'running' } : n))
      );
      await new Promise((r) => setTimeout(r, 800));
      setNodes((prev) =>
        prev.map((n) => (n.id === currentNode.id ? { ...n, status: 'success' } : n))
      );
    }

    setIsRunning(false);
    notify('Fluxo de trabalho executado com sucesso!', 'success');
  };

  // Deletar nó selecionado
  const handleDeleteSelected = () => {
    if (!selectedNodeId) return;
    setNodes((prev) => prev.filter((n) => n.id !== selectedNodeId));
    setConnections((prev) => prev.filter((c) => c.fromNodeId !== selectedNodeId && c.toNodeId !== selectedNodeId));
    setSelectedNodeId(null);
    notify('Nó removido do fluxo.', 'info');
  };

  // Obter posição dos nós para desenhar curvas SVG
  const getNodeCenter = (id: string) => {
    const node = nodes.find((n) => n.id === id);
    if (!node) return { x: 0, y: 0 };
    return {
      x: node.x + 130, // metade de 260px
      y: node.y + 45,  // metade de 90px
    };
  };

  const renderIcon = (name: WorkflowNode['iconName']) => {
    switch (name) {
      case 'zap': return <Zap size={16} color="#fbbf24" />;
      case 'bot': return <Bot size={16} color="#c084fc" />;
      case 'clock': return <Clock size={16} color="#60a5fa" />;
      case 'webhook': return <Webhook size={16} color="#34d399" />;
      case 'note': return <StickyNote size={16} color="#fcd34d" />;
      default: return <Sparkles size={16} color="#38bdf8" />;
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 'calc(100vh - 60px)',
        backgroundColor: '#0c0c0e',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top Header OpenBot Style */}
      <header
        style={{
          height: '52px',
          padding: '0 20px',
          backgroundColor: '#121215',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 30,
          flexShrink: 0,
        }}
      >
        {/* Lado Esquerdo: Navegação < > e Título do Workflow com Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <button
              type="button"
              onClick={() => window.history.back()}
              className="btn btn-ghost"
              style={{ padding: '5px', borderRadius: '6px', color: '#9ca3af' }}
              title="Voltar"
            >
              <ChevronLeft size={17} />
            </button>
            <button
              type="button"
              onClick={() => window.history.forward()}
              className="btn btn-ghost"
              style={{ padding: '5px', borderRadius: '6px', color: '#9ca3af' }}
              title="Avançar"
            >
              <ChevronRight size={17} />
            </button>
          </div>

          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setTitleDropdownOpen(!titleDropdownOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'transparent',
                border: 'none',
                color: '#f4f4f5',
                fontSize: '15px',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '8px',
              }}
            >
              <span>{workflowTitle}</span>
              <ChevronDown size={14} color="#71717a" />
            </button>

            {titleDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '38px',
                  left: 0,
                  width: '230px',
                  backgroundColor: '#18181b',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '12px',
                  padding: '6px',
                  zIndex: 50,
                  boxShadow: '0 12px 30px rgba(0,0,0,0.7)',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    const newTitle = prompt('Novo nome do fluxo:', workflowTitle);
                    if (newTitle) setWorkflowTitle(newTitle);
                    setTitleDropdownOpen(false);
                  }}
                  className="btn btn-ghost"
                  style={{ width: '100%', justifyContent: 'flex-start', fontSize: '13px', padding: '8px 10px' }}
                >
                  Renomear fluxo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    notify('Fluxo duplicado com sucesso!', 'info');
                    setTitleDropdownOpen(false);
                  }}
                  className="btn btn-ghost"
                  style={{ width: '100%', justifyContent: 'flex-start', fontSize: '13px', padding: '8px 10px' }}
                >
                  Duplicar fluxo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNodes(INITIAL_NODES);
                    setConnections(INITIAL_CONNECTIONS);
                    setTitleDropdownOpen(false);
                    notify('Canvas restaurado para o padrão.', 'info');
                  }}
                  className="btn btn-ghost"
                  style={{ width: '100%', justifyContent: 'flex-start', fontSize: '13px', padding: '8px 10px', color: '#f87171' }}
                >
                  Limpar / Restaurar nós
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Lado Direito: Ações de Execução e Salvar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {selectedNodeId && (
            <button
              type="button"
              onClick={handleDeleteSelected}
              className="btn btn-ghost"
              style={{ color: '#ef4444', padding: '6px 12px', fontSize: '13px' }}
              title="Excluir nó selecionado"
            >
              <Trash2 size={15} />
              <span>Excluir Nó</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleRunWorkflow}
            disabled={isRunning}
            className="btn btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#38bdf8',
              color: '#09090b',
              fontWeight: 600,
              fontSize: '13px',
              padding: '6px 14px',
              borderRadius: '999px',
            }}
          >
            <Play size={14} fill="#09090b" />
            <span>{isRunning ? 'Executando...' : 'Executar Fluxo'}</span>
          </button>
        </div>
      </header>

      {/* Infinite Canvas com Dot Grid */}
      <div
        ref={canvasRef}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{
          flex: 1,
          position: 'relative',
          cursor: activeTool === 'pan' || isPanning ? 'grab' : 'default',
          backgroundImage: 'radial-gradient(circle, rgba(255, 255, 255, 0.12) 1.2px, transparent 1.2px)',
          backgroundSize: '24px 24px',
          backgroundColor: '#0c0c0e',
          overflow: 'hidden',
        }}
      >
        {/* Container Transformável por Zoom e Pan */}
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
          {/* Conexões SVG Suaves entre os Nós */}
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
              const controlOffset = Math.max(Math.abs(dx) * 0.45, 60);

              const pathData = `M ${from.x} ${from.y} C ${from.x + controlOffset} ${from.y}, ${to.x - controlOffset} ${to.y}, ${to.x} ${to.y}`;

              return (
                <g key={conn.id}>
                  <path
                    d={pathData}
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.18)"
                    strokeWidth="2.5"
                  />
                  {isRunning && (
                    <path
                      d={pathData}
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="3"
                      strokeDasharray="8 8"
                      style={{ animation: 'dash 1.2s linear infinite' }}
                    />
                  )}
                </g>
              );
            })}
          </svg>

          {/* Nós do Workflow */}
          {nodes.map((node) => {
            const isSelected = selectedNodeId === node.id;
            const isNodeRunning = node.status === 'running';
            const isSuccess = node.status === 'success';

            return (
              <div
                key={node.id}
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                style={{
                  position: 'absolute',
                  left: `${node.x}px`,
                  top: `${node.y}px`,
                  width: '260px',
                  backgroundColor: isSelected ? '#1c1c22' : '#141418',
                  borderRadius: '16px',
                  border: isSelected
                    ? '2px solid #38bdf8'
                    : isNodeRunning
                    ? '2px solid #f59e0b'
                    : isSuccess
                    ? '1.5px solid #10b981'
                    : '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: isSelected
                    ? '0 10px 30px rgba(56, 189, 248, 0.25)'
                    : '0 8px 24px rgba(0, 0, 0, 0.5)',
                  padding: '14px 16px',
                  zIndex: isSelected ? 10 : 2,
                  cursor: activeTool === 'select' ? 'move' : 'pointer',
                  userSelect: 'none',
                  transition: draggingNodeId === node.id ? 'none' : 'box-shadow 0.2s, border-color 0.2s',
                }}
              >
                {/* Cabeçalho do Nó com Ícone e Tipo */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {renderIcon(node.iconName)}
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: '#9ca3af',
                      }}
                    >
                      {node.type}
                    </span>
                  </div>

                  {isNodeRunning && (
                    <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 600 }}>Ativo...</span>
                  )}
                  {isSuccess && (
                    <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 600 }}>✓ Concluído</span>
                  )}
                </div>

                {/* Título e Subtítulo */}
                <div style={{ fontWeight: 600, fontSize: '14px', color: '#f4f4f5', marginBottom: '4px' }}>
                  {node.title}
                </div>
                <div style={{ fontSize: '12px', color: '#71717a', lineHeight: 1.4 }}>
                  {node.subtitle}
                </div>

                {/* Ponto de Conexão à Direita */}
                <div
                  style={{
                    position: 'absolute',
                    right: '-6px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: isSelected ? '#38bdf8' : '#71717a',
                    border: '2px solid #0c0c0e',
                  }}
                  title="Conectar a outro nó"
                />
                {/* Ponto de Conexão à Esquerda */}
                <div
                  style={{
                    position: 'absolute',
                    left: '-6px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: '#71717a',
                    border: '2px solid #0c0c0e',
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Floating Bottom Toolbar Capsule (OpenBot Exact Style) */}
        <div
          style={{
            position: 'absolute',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 40,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#18181b',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '999px',
            padding: '6px 14px',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.65)',
            userSelect: 'none',
          }}
        >
          {/* Controles de Zoom */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              type="button"
              onClick={handleZoomOut}
              className="btn btn-ghost"
              style={{ padding: '6px', borderRadius: '50%', color: '#a1a1aa' }}
              title="Reduzir zoom"
            >
              <ZoomOut size={16} />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#e4e4e7',
                fontSize: '12px',
                fontWeight: 600,
                minWidth: '42px',
                cursor: 'pointer',
              }}
              title="Restaurar 100%"
            >
              {zoom}%
            </button>
            <button
              type="button"
              onClick={handleZoomIn}
              className="btn btn-ghost"
              style={{ padding: '6px', borderRadius: '50%', color: '#a1a1aa' }}
              title="Aumentar zoom"
            >
              <ZoomIn size={16} />
            </button>
          </div>

          <div style={{ width: '1px', height: '18px', backgroundColor: 'rgba(255, 255, 255, 0.12)', margin: '0 4px' }} />

          {/* Ferramentas de Interação */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <button
              type="button"
              onClick={() => setActiveTool('select')}
              className={`btn btn-ghost ${activeTool === 'select' ? 'is-active' : ''}`}
              style={{
                padding: '6px',
                borderRadius: '8px',
                backgroundColor: activeTool === 'select' ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                color: activeTool === 'select' ? '#38bdf8' : '#a1a1aa',
              }}
              title="Ponteiro / Seleção"
            >
              <MousePointer2 size={16} />
            </button>

            <button
              type="button"
              onClick={() => setActiveTool('pan')}
              className={`btn btn-ghost ${activeTool === 'pan' ? 'is-active' : ''}`}
              style={{
                padding: '6px',
                borderRadius: '8px',
                backgroundColor: activeTool === 'pan' ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                color: activeTool === 'pan' ? '#38bdf8' : '#a1a1aa',
              }}
              title="Mão / Arrastar Canvas"
            >
              <Hand size={16} />
            </button>

            <button
              type="button"
              onClick={() => setActiveTool('draw')}
              className={`btn btn-ghost ${activeTool === 'draw' ? 'is-active' : ''}`}
              style={{
                padding: '6px',
                borderRadius: '8px',
                backgroundColor: activeTool === 'draw' ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                color: activeTool === 'draw' ? '#38bdf8' : '#a1a1aa',
              }}
              title="Caneta / Rascunho"
            >
              <PenTool size={16} />
            </button>

            <button
              type="button"
              onClick={() => handleAddNode('note', 'Anotação / Post-it', 'Ideias de arquitetura', 'note')}
              className="btn btn-ghost"
              style={{ padding: '6px', borderRadius: '8px', color: '#a1a1aa' }}
              title="Adicionar Post-it"
            >
              <StickyNote size={16} />
            </button>

            <button
              type="button"
              onClick={() => handleAddNode('agent', 'Novo Agente', 'Execução autônoma', 'bot')}
              className="btn btn-ghost"
              style={{ padding: '6px', borderRadius: '8px', color: '#a1a1aa' }}
              title="Adicionar Agente Especialista"
            >
              <SquareCode size={16} />
            </button>
          </div>

          <div style={{ width: '1px', height: '18px', backgroundColor: 'rgba(255, 255, 255, 0.12)', margin: '0 4px' }} />

          {/* Botão Central Destacado + Adicionar Nó */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setAddNodeMenuOpen(!addNodeMenuOpen)}
              className="btn btn-primary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#38bdf8',
                color: '#09090b',
                fontWeight: 600,
                fontSize: '12px',
                padding: '5px 12px',
                borderRadius: '999px',
              }}
            >
              <Plus size={15} />
              <span>Adicionar nó</span>
            </button>

            {addNodeMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '44px',
                  right: 0,
                  width: '240px',
                  backgroundColor: '#18181b',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '14px',
                  padding: '6px',
                  boxShadow: '0 12px 36px rgba(0,0,0,0.8)',
                  zIndex: 60,
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#71717a', padding: '6px 10px', textTransform: 'uppercase' }}>
                  Catálogo de Nós
                </div>
                <button
                  type="button"
                  onClick={() => handleAddNode('trigger', 'Webhook HTTP', 'Disparado por requisição POST externa', 'webhook')}
                  className="btn btn-ghost"
                  style={{ width: '100%', justifyContent: 'flex-start', gap: '8px', fontSize: '13px', padding: '8px 10px' }}
                >
                  <Webhook size={15} color="#34d399" />
                  <span>Gatilho: Webhook</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddNode('trigger', 'Agendamento Cron', 'Execução periódica a cada intervalo', 'clock')}
                  className="btn btn-ghost"
                  style={{ width: '100%', justifyContent: 'flex-start', gap: '8px', fontSize: '13px', padding: '8px 10px' }}
                >
                  <Clock size={15} color="#60a5fa" />
                  <span>Gatilho: Agendamento</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddNode('agent', 'QA Tester Agent', 'Verificação de build e conformidade', 'bot')}
                  className="btn btn-ghost"
                  style={{ width: '100%', justifyContent: 'flex-start', gap: '8px', fontSize: '13px', padding: '8px 10px' }}
                >
                  <Bot size={15} color="#c084fc" />
                  <span>Agente: QA Tester</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddNode('action', 'Telegram Notifier', 'Envia alerta ao canal configurado', 'sparkles')}
                  className="btn btn-ghost"
                  style={{ width: '100%', justifyContent: 'flex-start', gap: '8px', fontSize: '13px', padding: '8px 10px' }}
                >
                  <Sparkles size={15} color="#fbbf24" />
                  <span>Ação: Alerta Telegram</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
