import React, { useRef, useEffect, useState, useCallback } from 'react';
import { OfficeAgent } from './AgentOfficeView';

interface AgentOfficeCanvasProps {
  agents: OfficeAgent[];
  onSelectAgent: (agent: OfficeAgent) => void;
  activeMeeting?: boolean;
}

interface CanvasAvatar {
  id: string;
  name: string;
  role: string;
  department: string;
  color: string;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  targetX: number;
  targetY: number;
  speed: number;
  state: 'idle' | 'walking' | 'coding' | 'meeting';
  facing: 'left' | 'right';
  walkCycle: number;
  speechBubble: string | null;
  bubbleTimer: number;
  pauseTimer: number;
}

// Layout dos Departamentos e Mesas em Coordenadas 2.5D (Canvas 960x520)
const DESK_SLOTS: Record<string, { x: number; y: number }[]> = {
  // 1. Comando Central (Topo Esquerdo)
  command: [
    { x: 180, y: 110 },
    { x: 250, y: 110 },
    { x: 320, y: 110 },
  ],
  // 2. Engenharia de Software (Topo Direito)
  dev: [
    { x: 640, y: 100 },
    { x: 710, y: 100 },
    { x: 780, y: 100 },
    { x: 670, y: 160 },
    { x: 750, y: 160 },
  ],
  // 3. Design & Produto (Centro Esquerdo)
  design: [
    { x: 140, y: 240 },
    { x: 210, y: 240 },
  ],
  // 4. DevOps & Infra (Centro Direito)
  infra: [
    { x: 750, y: 250 },
    { x: 820, y: 250 },
    { x: 780, y: 310 },
  ],
  // 5. Dados & Inteligência (Inferior Esquerdo)
  data: [
    { x: 150, y: 380 },
    { x: 220, y: 380 },
    { x: 180, y: 440 },
    { x: 250, y: 440 },
  ],
  // 6. Cybersecurity Shield (Inferior Direito)
  security: [
    { x: 650, y: 380 },
    { x: 720, y: 380 },
    { x: 790, y: 380 },
    { x: 670, y: 440 },
    { x: 740, y: 440 },
    { x: 810, y: 440 },
  ],
};

// Posições dos Assentos na Mesa Redonda Central de Consenso
const ROUND_TABLE_SEATS = [
  { x: 480, y: 210 }, // Topo (JARVIS Maestro)
  { x: 530, y: 230 }, // Nordeste
  { x: 550, y: 270 }, // Leste
  { x: 530, y: 310 }, // Sudeste
  { x: 480, y: 330 }, // Sul
  { x: 430, y: 310 }, // Sudoeste
  { x: 410, y: 270 }, // Oeste
  { x: 430, y: 230 }, // Noroeste
];

const COFFEE_POINT = { x: 480, y: 90 };

export const AgentOfficeCanvas: React.FC<AgentOfficeCanvasProps> = ({
  agents,
  onSelectAgent,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const avatarsRef = useRef<CanvasAvatar[]>([]);
  const [hoveredAvatar, setHoveredAvatar] = useState<CanvasAvatar | null>(null);
  const [isWandering, setIsWandering] = useState(true);
  const [meetingActive, setMeetingActive] = useState(false);
  const frameIdRef = useRef<number>(0);

  // Inicializa posições dos avatares com base nas mesas de cada departamento
  useEffect(() => {
    const deptCounters: Record<string, number> = {
      command: 0,
      dev: 0,
      design: 0,
      infra: 0,
      data: 0,
      security: 0,
    };

    const list: CanvasAvatar[] = agents.map((agent) => {
      const slots = DESK_SLOTS[agent.department] || DESK_SLOTS.command;
      const slotIdx = deptCounters[agent.department] % slots.length;
      deptCounters[agent.department] += 1;
      const slot = slots[slotIdx];

      return {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        department: agent.department,
        color: agent.color,
        x: slot.x,
        y: slot.y,
        homeX: slot.x,
        homeY: slot.y,
        targetX: slot.x,
        targetY: slot.y,
        speed: 1.2 + Math.random() * 0.4,
        state: 'idle',
        facing: 'right',
        walkCycle: Math.random() * Math.PI * 2,
        speechBubble: null,
        bubbleTimer: 0,
        pauseTimer: 60 + Math.random() * 120,
      };
    });

    avatarsRef.current = list;
  }, [agents]);

  // Função para convocar reunião na Mesa Redonda
  const handleToggleMeeting = useCallback(() => {
    setMeetingActive((prev) => {
      const nextState = !prev;
      const avatars = avatarsRef.current;

      if (nextState) {
        // Convoca especialistas-chave (Maestro, Dev Frontend, Cibersegurança, Arquiteto, QA, Dados)
        const meetingRoles = [
          'jarvis_master',
          'software_architect',
          'frontend_mobile_developer',
          'cybersecurity_engineer',
          'qa_engineer',
          'backend_developer',
          'data_scientist',
          'project_designer_planner',
        ];

        let seatIdx = 0;
        avatars.forEach((av) => {
          if (meetingRoles.includes(av.id) && seatIdx < ROUND_TABLE_SEATS.length) {
            const seat = ROUND_TABLE_SEATS[seatIdx];
            av.targetX = seat.x;
            av.targetY = seat.y;
            av.state = 'walking';
            av.speechBubble =
              av.id === 'jarvis_master'
                ? 'Convocando Mesa Redonda...'
                : av.id === 'cybersecurity_engineer'
                ? 'Auditando OWASP...'
                : av.id === 'frontend_mobile_developer'
                ? 'Desenvolvendo UI...'
                : 'Em Consenso...';
            av.bubbleTimer = 300;
            seatIdx += 1;
          }
        });
      } else {
        // Retornam todos às suas mesas
        avatars.forEach((av) => {
          av.targetX = av.homeX;
          av.targetY = av.homeY;
          av.state = 'walking';
          av.speechBubble = 'De volta à mesa!';
          av.bubbleTimer = 180;
        });
      }

      return nextState;
    });
  }, []);

  // Loop de Animação e Renderização em 60 FPS
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let hologramRot = 0;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      hologramRot += 0.02;

      // 1. Limpa o fundo do escritório
      ctx.fillStyle = '#080d1a';
      ctx.fillRect(0, 0, width, height);

      // Grid sutil no piso
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
      ctx.lineWidth = 1;
      const gridSize = 32;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // 2. Desenha os Departamentos (Carpetes e Zonas)
      const DEPT_ZONES = [
        { name: '👑 Comando Central', x: 90, y: 50, w: 270, h: 140, color: 'rgba(234, 179, 8, 0.05)', border: 'rgba(234, 179, 8, 0.2)' },
        { name: '💻 Engenharia de Software', x: 600, y: 50, w: 270, h: 140, color: 'rgba(99, 102, 241, 0.05)', border: 'rgba(99, 102, 241, 0.2)' },
        { name: '🎨 Design & UX', x: 90, y: 200, w: 170, h: 110, color: 'rgba(236, 72, 153, 0.05)', border: 'rgba(236, 72, 153, 0.2)' },
        { name: '🚀 DevOps & Infra', x: 700, y: 200, w: 170, h: 130, color: 'rgba(249, 115, 22, 0.05)', border: 'rgba(249, 115, 22, 0.2)' },
        { name: '📊 Dados & BI', x: 90, y: 340, w: 230, h: 140, color: 'rgba(6, 182, 212, 0.05)', border: 'rgba(6, 182, 212, 0.2)' },
        { name: '🛡️ Cybersecurity Shield', x: 600, y: 340, w: 270, h: 140, color: 'rgba(239, 68, 68, 0.05)', border: 'rgba(239, 68, 68, 0.2)' },
      ];

      DEPT_ZONES.forEach((z) => {
        ctx.fillStyle = z.color;
        ctx.strokeStyle = z.border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(z.x, z.y, z.w, z.h, 10);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.font = '10px Inter, sans-serif';
        ctx.fillText(z.name, z.x + 12, z.y + 18);
      });

      // 3. Cantinho do Café & Água
      ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
      ctx.beginPath();
      ctx.roundRect(COFFEE_POINT.x - 30, COFFEE_POINT.y - 20, 60, 40, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fbbf24';
      ctx.font = '12px Inter, sans-serif';
      ctx.fillText('☕ Coffee Bar', COFFEE_POINT.x - 32, COFFEE_POINT.y + 30);

      // 4. Mesa Redonda Central de Consenso
      const centerX = 480;
      const centerY = 270;
      const tableRadius = 60;

      // Carpete circular da sala de reunião
      const carpetGrad = ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, 105);
      carpetGrad.addColorStop(0, 'rgba(234, 179, 8, 0.15)');
      carpetGrad.addColorStop(1, 'rgba(15, 23, 42, 0.6)');
      ctx.fillStyle = carpetGrad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, 105, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(234, 179, 8, 0.3)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Tampo da Mesa Redonda de Madeira Nobre / Vidro Escuro
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(centerX, centerY, tableRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Holograma Central / Reator JARVIS Giratório
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(hologramRot);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#fef08a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('MESA REDONDA', centerX, centerY + 32);

      // 5. Desenha as Mesas de Escritório nos Departamentos
      Object.entries(DESK_SLOTS).forEach(([, slots]) => {
        slots.forEach((s) => {
          // Tampo da mesa individual
          ctx.fillStyle = 'rgba(30, 41, 59, 0.85)';
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(s.x - 18, s.y - 12, 36, 24, 4);
          ctx.fill();
          ctx.stroke();

          // Monitor miniatura sobre a mesa
          ctx.fillStyle = '#0f172a';
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.rect(s.x - 8, s.y - 10, 16, 5);
          ctx.fill();
          ctx.stroke();
        });
      });

      // 6. Atualiza e Renderiza os Avatares (com ordenação de profundidade Y-Sort)
      const avatars = avatarsRef.current;

      // Movimentação autônoma de passeio (quando ativada)
      avatars.forEach((av) => {
        if (isWandering && !meetingActive) {
          av.pauseTimer -= 1;
          if (av.pauseTimer <= 0) {
            av.pauseTimer = 180 + Math.random() * 300;
            const r = Math.random();
            if (r < 0.25) {
              // Vai tomar um café
              av.targetX = COFFEE_POINT.x + (Math.random() * 40 - 20);
              av.targetY = COFFEE_POINT.y + (Math.random() * 20 - 10);
              av.speechBubble = 'Pausa para o café ☕';
              av.bubbleTimer = 140;
            } else if (r < 0.5) {
              // Passeia pelo corredor central
              av.targetX = 480 + (Math.random() * 120 - 60);
              av.targetY = 270 + (Math.random() * 120 - 60);
              av.speechBubble = 'Verificando status...';
              av.bubbleTimer = 120;
            } else {
              // Retorna à mesa de trabalho
              av.targetX = av.homeX;
              av.targetY = av.homeY;
              av.speechBubble = null;
            }
          }
        }

        // Interpolação de movimento suave (X, Y)
        const dx = av.targetX - av.x;
        const dy = av.targetY - av.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 2) {
          av.state = 'walking';
          av.x += (dx / dist) * av.speed;
          av.y += (dy / dist) * av.speed;
          av.facing = dx < 0 ? 'left' : 'right';
          av.walkCycle += 0.25;
        } else {
          av.state = 'idle';
          av.x = av.targetX;
          av.y = av.targetY;
        }

        if (av.bubbleTimer > 0) {
          av.bubbleTimer -= 1;
          if (av.bubbleTimer <= 0) {
            av.speechBubble = null;
          }
        }
      });

      // Ordena por profundidade Y para sobreposição correta
      const sortedAvatars = [...avatars].sort((a, b) => a.y - b.y);

      sortedAvatars.forEach((av) => {
        const isHovered = hoveredAvatar?.id === av.id;

        ctx.save();
        ctx.translate(av.x, av.y);

        // Sombra oval sob os pés
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath();
        ctx.ellipse(0, 8, 9, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Anel de foco se o mouse estiver sobre o avatar
        if (isHovered) {
          ctx.strokeStyle = '#eab308';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(0, 8, 14, 7, 0, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Animação das perninhas andando
        const legBob = av.state === 'walking' ? Math.sin(av.walkCycle) * 3 : 0;
        const bodyBob = av.state === 'walking' ? Math.abs(Math.sin(av.walkCycle)) * 2 : 0;

        // Pernas
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(-5, 0 - bodyBob + legBob, 3, 7);
        ctx.fillRect(2, 0 - bodyBob - legBob, 3, 7);

        // Tronco / Uniforme do Departamento
        ctx.fillStyle = av.color;
        ctx.beginPath();
        ctx.roundRect(-7, -10 - bodyBob, 14, 11, 3);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Cabeça
        ctx.fillStyle = '#fed7aa'; // Tom de pele amigável
        ctx.beginPath();
        ctx.arc(0, -15 - bodyBob, 6, 0, Math.PI * 2);
        ctx.fill();

        // Cabelo / Boné
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(0, -17 - bodyBob, 6, Math.PI, Math.PI * 2);
        ctx.fill();

        // Olhinhos direcionados
        const eyeOffset = av.facing === 'left' ? -2 : 2;
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(eyeOffset, -15 - bodyBob, 1, 0, Math.PI * 2);
        ctx.fill();

        // Balão de Diálogo / Pensamento (Speech Bubble)
        if (av.speechBubble || isHovered) {
          const txt = av.speechBubble || av.name;
          ctx.font = 'bold 9px Inter, sans-serif';
          const txtWidth = ctx.measureText(txt).width;
          const bubbleW = txtWidth + 12;
          const bubbleH = 18;
          const bubbleY = -34 - bodyBob;

          // Caixa do balão
          ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
          ctx.strokeStyle = av.color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(-bubbleW / 2, bubbleY - bubbleH, bubbleW, bubbleH, 6);
          ctx.fill();
          ctx.stroke();

          // Rabinho do balão apontando para o avatar
          ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
          ctx.beginPath();
          ctx.moveTo(-3, bubbleY);
          ctx.lineTo(0, bubbleY + 4);
          ctx.lineTo(3, bubbleY);
          ctx.fill();

          // Texto dentro do balão
          ctx.fillStyle = '#f8fafc';
          ctx.textAlign = 'center';
          ctx.fillText(txt, 0, bubbleY - 5);
        }

        ctx.restore();
      });

      frameIdRef.current = requestAnimationFrame(render);
    };

    frameIdRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frameIdRef.current);
    };
  }, [isWandering, meetingActive, hoveredAvatar]);

  // Detector de Movimento do Mouse sobre o Canvas (Hit Testing)
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const mouseY = ((e.clientY - rect.top) / rect.height) * canvas.height;

    let found: CanvasAvatar | null = null;
    avatarsRef.current.forEach((av) => {
      const dist = Math.hypot(av.x - mouseX, av.y - mouseY);
      if (dist < 18) {
        found = av;
      }
    });

    setHoveredAvatar(found);
    canvas.style.cursor = found ? 'pointer' : 'default';
  };

  // Clique no Avatar abre o Drawer de Configurações
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const mouseY = ((e.clientY - rect.top) / rect.height) * canvas.height;

    avatarsRef.current.forEach((av) => {
      const dist = Math.hypot(av.x - mouseX, av.y - mouseY);
      if (dist < 20) {
        const fullAgent = agents.find((a) => a.id === av.id);
        if (fullAgent) {
          onSelectAgent(fullAgent);
        }
      }
    });
  };

  return (
    <div
      style={{
        borderRadius: '16px',
        backgroundColor: '#050914',
        border: '1px solid var(--border-color)',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Barra de Controles do Andar Interativo */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
          borderBottom: '1px solid var(--border-color)',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#f8fafc' }}>
            Planta Baixa Viva dos 26 Especialistas
          </span>
          <span
            style={{
              fontSize: '0.66rem',
              padding: '2px 8px',
              borderRadius: '10px',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              color: '#34d399',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          >
            60 FPS Interativo
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={handleToggleMeeting}
            className="btn btn-secondary"
            style={{
              fontSize: '0.74rem',
              padding: '5px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: meetingActive ? 'rgba(234, 179, 8, 0.2)' : 'rgba(255, 255, 255, 0.04)',
              color: meetingActive ? '#facc15' : 'var(--text-secondary)',
              borderColor: meetingActive ? 'rgba(234, 179, 8, 0.5)' : 'var(--border-color)',
            }}
            title="Chama os especialistas para deliberar na Mesa Redonda"
          >
            <span>{meetingActive ? 'Liberar Mesa Redonda' : 'Convocar Mesa Redonda'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsWandering((prev) => !prev)}
            className="btn btn-ghost"
            style={{
              fontSize: '0.74rem',
              padding: '5px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: isWandering ? 'var(--text-primary)' : 'var(--text-muted)',
              border: '1px solid var(--border-color)',
            }}
            title="Ativa ou pausa os avatares andando pelo escritório"
          >
            <span>{isWandering ? 'Pausar Passeio' : 'Passeio Livre'}</span>
          </button>
        </div>
      </div>

      {/* Canvas 2.5D Responsivo com Scroll Horizontal se necessário */}
      <div style={{ position: 'relative', width: '100%', overflowX: 'auto', display: 'flex', justifyContent: 'center' }}>
        <canvas
          ref={canvasRef}
          width={960}
          height={520}
          onMouseMove={handleMouseMove}
          onClick={handleClick}
          style={{
            width: '100%',
            maxWidth: '100%',
            height: 'auto',
            aspectRatio: '960 / 520',
            display: 'block',
          }}
        />

        {/* Tooltip flutuante quando o mouse está sobre um avatar */}
        {hoveredAvatar && (
          <div
            style={{
              position: 'absolute',
              bottom: '12px',
              left: '16px',
              backgroundColor: 'rgba(15, 23, 42, 0.92)',
              border: `1px solid ${hoveredAvatar.color}`,
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.76rem',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
              pointerEvents: 'none',
              backdropFilter: 'blur(8px)',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: hoveredAvatar.color,
              }}
            />
            <strong>{hoveredAvatar.name}</strong>
            <span style={{ color: 'var(--text-muted)' }}>•</span>
            <span style={{ color: 'var(--text-secondary)' }}>{hoveredAvatar.role}</span>
            <span style={{ color: 'var(--text-muted)' }}>•</span>
            <span style={{ color: '#eab308' }}>Clique para configurar chave</span>
          </div>
        )}
      </div>
    </div>
  );
};