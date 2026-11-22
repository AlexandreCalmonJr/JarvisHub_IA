import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { OfficeAgent } from './AgentOfficeView';
import type { LiveOfficeAgentStatus } from '../../services/api/orchestration';

interface AgentOfficeCanvasProps {
  agents: OfficeAgent[];
  onSelectAgent: (agent: OfficeAgent) => void;
  liveStatuses?: LiveOfficeAgentStatus[];
  roundtableActiveRoles?: string[];
  roundtableTopic?: string | null;
  assistantName?: string;
}

interface CanvasAvatar {
  id: string;
  name: string;
  properName: string;
  role: string;
  department: OfficeAgent['department'];
  color: string;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  targetX: number;
  targetY: number;
  speed: number;
  state: 'idle' | 'walking' | 'working' | 'meeting';
  mood: LiveOfficeAgentStatus['mood'];
  facing: 'left' | 'right';
  walkCycle: number;
  speechBubble: string | null;
  bubbleTimer: number;
  pauseTimer: number;
  isLiveControlled: boolean;
}

// Isometric projection helpers (Canvas 980 x 540)
const ISO_ORIGIN_X = 490;
const ISO_ORIGIN_Y = 50;
const TILE_W = 56;
const TILE_H = 28;

function isoToScreen(gx: number, gy: number): { x: number; y: number } {
  return {
    x: ISO_ORIGIN_X + (gx - gy) * (TILE_W / 2),
    y: ISO_ORIGIN_Y + (gx + gy) * (TILE_H / 2),
  };
}

// 6 themed isometric zones in grid coordinates (grid is 16 x 16)
const ISO_ZONES: Array<{
  id: OfficeAgent['department'];
  label: string;
  gx: number;
  gy: number;
  gw: number;
  gh: number;
  accent: string;
  fill: string;
}> = [
  { id: 'command', label: 'COMANDO CENTRAL', gx: 1, gy: 1, gw: 5, gh: 4, accent: '#f97316', fill: 'rgba(249, 115, 22, 0.10)' },
  { id: 'dev', label: 'ENGENHARIA & CÓDIGO', gx: 10, gy: 1, gw: 5, gh: 4, accent: '#38bdf8', fill: 'rgba(56, 189, 248, 0.09)' },
  { id: 'design', label: 'DESIGN & ARTEFATOS', gx: 1, gy: 6, gw: 4, gh: 4, accent: '#ec4899', fill: 'rgba(236, 72, 153, 0.09)' },
  { id: 'infra', label: 'FLUXOS & DEVOPS', gx: 11, gy: 6, gw: 4, gh: 4, accent: '#fb923c', fill: 'rgba(251, 146, 60, 0.09)' },
  { id: 'data', label: 'DADOS & DEEP RESEARCH', gx: 1, gy: 11, gw: 5, gh: 4, accent: '#22d3ee', fill: 'rgba(34, 211, 238, 0.09)' },
  { id: 'security', label: 'SEGURANÇA SHIELD', gx: 10, gy: 11, gw: 5, gh: 4, accent: '#ef4444', fill: 'rgba(239, 68, 68, 0.09)' },
];

const DEPT_DESK_GRID: Record<OfficeAgent['department'], Array<{ gx: number; gy: number }>> = {
  command: [
    { gx: 2.2, gy: 2.2 },
    { gx: 4.0, gy: 2.2 },
    { gx: 3.1, gy: 3.6 },
  ],
  dev: [
    { gx: 11.2, gy: 2.0 },
    { gx: 13.0, gy: 2.0 },
    { gx: 11.2, gy: 3.5 },
    { gx: 13.0, gy: 3.5 },
    { gx: 14.3, gy: 2.8 },
  ],
  design: [
    { gx: 2.0, gy: 7.2 },
    { gx: 3.6, gy: 7.2 },
    { gx: 2.8, gy: 8.8 },
  ],
  infra: [
    { gx: 12.0, gy: 7.2 },
    { gx: 13.6, gy: 7.2 },
    { gx: 12.8, gy: 8.8 },
  ],
  data: [
    { gx: 2.0, gy: 12.2 },
    { gx: 3.8, gy: 12.2 },
    { gx: 2.0, gy: 13.8 },
    { gx: 3.8, gy: 13.8 },
  ],
  security: [
    { gx: 11.2, gy: 12.2 },
    { gx: 13.0, gy: 12.2 },
    { gx: 11.2, gy: 13.8 },
    { gx: 13.0, gy: 13.8 },
    { gx: 14.3, gy: 13.0 },
  ],
};

// Central Mesa Redonda grid center = (8, 8)
const ROUNDTABLE_CENTER_GRID = { gx: 8, gy: 8 };
const COFFEE_GRID = { gx: 8, gy: 2.2 };
const RESEARCH_GRID = { gx: 5.4, gy: 11.8 };

const ROUNDTABLE_SEATS = [
  isoToScreen(8, 5.7),
  isoToScreen(9.8, 6.4),
  isoToScreen(10.3, 8.0),
  isoToScreen(9.6, 9.7),
  isoToScreen(8.0, 10.3),
  isoToScreen(6.3, 9.6),
  isoToScreen(5.7, 8.0),
  isoToScreen(6.4, 6.3),
];

function drawIsoDiamond(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  gw: number,
  gh: number,
  fill: string,
  stroke?: string,
  lineWidth = 1
) {
  const p1 = isoToScreen(gx, gy);
  const p2 = isoToScreen(gx + gw, gy);
  const p3 = isoToScreen(gx + gw, gy + gh);
  const p4 = isoToScreen(gx, gy + gh);
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(p3.x, p3.y);
  ctx.lineTo(p4.x, p4.y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function drawIsoDesk(ctx: CanvasRenderingContext2D, gx: number, gy: number, accent: string) {
  const c = isoToScreen(gx, gy);
  // Desk pedestal shadow
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y + 8, 18, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // Top isometric diamond slab
  ctx.beginPath();
  ctx.moveTo(c.x, c.y - 11);
  ctx.lineTo(c.x + 20, c.y - 1);
  ctx.lineTo(c.x, c.y + 9);
  ctx.lineTo(c.x - 20, c.y - 1);
  ctx.closePath();
  ctx.fillStyle = '#1c2230';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Left & right extruded thickness (2.5D depth)
  ctx.beginPath();
  ctx.moveTo(c.x - 20, c.y - 1);
  ctx.lineTo(c.x, c.y + 9);
  ctx.lineTo(c.x, c.y + 14);
  ctx.lineTo(c.x - 20, c.y + 4);
  ctx.closePath();
  ctx.fillStyle = '#12161f';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(c.x + 20, c.y - 1);
  ctx.lineTo(c.x, c.y + 9);
  ctx.lineTo(c.x, c.y + 14);
  ctx.lineTo(c.x + 20, c.y + 4);
  ctx.closePath();
  ctx.fillStyle = '#0f131b';
  ctx.fill();

  // Miniature glowing monitor on desk
  ctx.fillStyle = '#0b0d12';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(c.x - 8, c.y - 14, 16, 8, 2);
  ctx.fill();
  ctx.stroke();
}

export const AgentOfficeCanvas: React.FC<AgentOfficeCanvasProps> = ({
  agents,
  onSelectAgent,
  liveStatuses = [],
  roundtableActiveRoles = [],
  roundtableTopic = null,
  assistantName = 'JARVIS',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const avatarsRef = useRef<CanvasAvatar[]>([]);
  const hoveredIdRef = useRef<string | null>(null);
  const isWanderingRef = useRef(true);
  const manualMeetingRef = useRef(false);
  const roundtableTopicRef = useRef<string | null>(roundtableTopic);
  const assistantNameRef = useRef(assistantName);
  const agentsRef = useRef(agents);
  const onSelectAgentRef = useRef(onSelectAgent);

  const [hoveredAvatar, setHoveredAvatar] = useState<CanvasAvatar | null>(null);
  const [isWandering, setIsWandering] = useState(true);
  const [manualMeeting, setManualMeeting] = useState(false);

  agentsRef.current = agents;
  onSelectAgentRef.current = onSelectAgent;
  roundtableTopicRef.current = roundtableTopic;
  assistantNameRef.current = assistantName;
  isWanderingRef.current = isWandering;
  manualMeetingRef.current = manualMeeting;

  // Initialize avatars onto isometric desk positions without destroying existing positions unnecessarily
  useEffect(() => {
    const deptCounters: Record<OfficeAgent['department'], number> = {
      command: 0,
      dev: 0,
      design: 0,
      infra: 0,
      data: 0,
      security: 0,
    };
    const prevById = new Map(avatarsRef.current.map((a) => [a.id, a]));

    avatarsRef.current = agents.map((agent) => {
      const slots = DEPT_DESK_GRID[agent.department] || DEPT_DESK_GRID.command;
      const slotIdx = deptCounters[agent.department] % slots.length;
      deptCounters[agent.department] += 1;
      const gridSlot = slots[slotIdx];
      const screenPos = isoToScreen(gridSlot.gx, gridSlot.gy);
      const existing = prevById.get(agent.id);

      return {
        id: agent.id,
        name: agent.name,
        properName: agent.properName || agent.name.split(' ')[0],
        role: agent.role,
        department: agent.department,
        color: agent.color,
        x: existing ? existing.x : screenPos.x,
        y: existing ? existing.y : screenPos.y - 8,
        homeX: screenPos.x,
        homeY: screenPos.y - 8,
        targetX: existing ? existing.targetX : screenPos.x,
        targetY: existing ? existing.targetY : screenPos.y - 8,
        speed: existing ? existing.speed : 1.55 + Math.random() * 0.35,
        state: existing ? existing.state : 'idle',
        mood: existing ? existing.mood : 'idle',
        facing: existing ? existing.facing : 'right',
        walkCycle: existing ? existing.walkCycle : Math.random() * Math.PI * 2,
        speechBubble: existing ? existing.speechBubble : null,
        bubbleTimer: existing ? existing.bubbleTimer : 0,
        pauseTimer: existing ? existing.pauseTimer : 110 + Math.random() * 200,
        isLiveControlled: existing ? existing.isLiveControlled : false,
      };
    });
  }, [agents]);

  // Apply real-time server WebSocket statuses + active Mesa Redonda roles
  useEffect(() => {
    const avatars = avatarsRef.current;
    if (!avatars.length) return;

    const statusByRole = new Map(liveStatuses.map((s) => [s.agent_role, s]));
    const rtSet = new Set(roundtableActiveRoles);
    const coffeePos = isoToScreen(COFFEE_GRID.gx, COFFEE_GRID.gy);
    const researchPos = isoToScreen(RESEARCH_GRID.gx, RESEARCH_GRID.gy);

    let seatIdx = 0;
    avatars.forEach((av) => {
      const live = statusByRole.get(av.id);
      const inRoundtable = rtSet.has(av.id) || live?.zone === 'roundtable';

      if (inRoundtable) {
        const seat = ROUNDTABLE_SEATS[seatIdx % ROUNDTABLE_SEATS.length];
        seatIdx += 1;
        av.targetX = seat.x;
        av.targetY = seat.y;
        av.mood = live?.mood || 'debating';
        av.speechBubble =
          live?.activity ||
          (av.id === 'jarvis_master' ? 'Moderando Mesa Redonda' : 'Deliberando na Mesa Redonda');
        av.bubbleTimer = 420;
        av.isLiveControlled = true;
      } else if (live && live.mood !== 'idle') {
        av.mood = live.mood;
        av.speechBubble = live.activity;
        av.bubbleTimer = 360;
        av.isLiveControlled = true;
        if (live.zone === 'coffee') {
          av.targetX = coffeePos.x + (Math.random() * 28 - 14);
          av.targetY = coffeePos.y + (Math.random() * 14 - 7);
        } else if (live.zone === 'research') {
          av.targetX = researchPos.x + (Math.random() * 24 - 12);
          av.targetY = researchPos.y + (Math.random() * 12 - 6);
        } else {
          av.targetX = av.homeX;
          av.targetY = av.homeY;
        }
      } else if (av.isLiveControlled && !manualMeetingRef.current) {
        av.isLiveControlled = false;
        av.mood = 'idle';
        av.targetX = av.homeX;
        av.targetY = av.homeY;
      }
    });
  }, [liveStatuses, roundtableActiveRoles]);

  const handleToggleManualMeeting = useCallback(() => {
    setManualMeeting((prev) => {
      const next = !prev;
      const avatars = avatarsRef.current;
      if (next) {
        const priority = [
          'jarvis_master',
          'software_architect',
          'sentinel_security',
          'cybersecurity_engineer',
          'presentation_creator',
          'document_specialist',
          'research_analyst',
          'ux_ui_designer',
        ];
        const chosen = avatars.filter((a) => priority.includes(a.id)).slice(0, ROUNDTABLE_SEATS.length);
        const list = chosen.length >= 3 ? chosen : avatars.slice(0, Math.min(6, ROUNDTABLE_SEATS.length));
        list.forEach((av, idx) => {
          const seat = ROUNDTABLE_SEATS[idx % ROUNDTABLE_SEATS.length];
          av.targetX = seat.x;
          av.targetY = seat.y;
          av.mood = 'debating';
          av.speechBubble = av.id === 'jarvis_master' ? 'Reunindo especialistas...' : 'Indo à Mesa Redonda';
          av.bubbleTimer = 300;
        });
      } else {
        avatars.forEach((av) => {
          av.targetX = av.homeX;
          av.targetY = av.homeY;
          av.mood = 'idle';
          av.speechBubble = 'Voltando à estação';
          av.bubbleTimer = 140;
        });
      }
      return next;
    });
  }, []);

  // Single mount 60 FPS Canvas loop — never torn down by React state updates
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frameId = 0;
    let tick = 0;

    const render = () => {
      tick += 0.025;
      const width = canvas.width;
      const height = canvas.height;

      // 1. Deep Obsidian backdrop with subtle warm radial ambient
      const bgGrad = ctx.createRadialGradient(width / 2, height * 0.48, 30, width / 2, height * 0.5, width * 0.6);
      bgGrad.addColorStop(0, '#141925');
      bgGrad.addColorStop(0.65, '#0d1017');
      bgGrad.addColorStop(1, '#090b10');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Isometric room floor slab (16x16 diamond grid + 3D floor thickness)
      const topCorner = isoToScreen(0, 0);
      const rightCorner = isoToScreen(16, 0);
      const bottomCorner = isoToScreen(16, 16);
      const leftCorner = isoToScreen(0, 16);

      // Floor thickness rim (Habbo-style cutaway)
      ctx.beginPath();
      ctx.moveTo(leftCorner.x, leftCorner.y);
      ctx.lineTo(bottomCorner.x, bottomCorner.y);
      ctx.lineTo(bottomCorner.x, bottomCorner.y + 18);
      ctx.lineTo(leftCorner.x, leftCorner.y + 18);
      ctx.closePath();
      ctx.fillStyle = '#0e121b';
      ctx.fill();
      ctx.strokeStyle = 'rgba(249, 115, 22, 0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(rightCorner.x, rightCorner.y);
      ctx.lineTo(bottomCorner.x, bottomCorner.y);
      ctx.lineTo(bottomCorner.x, bottomCorner.y + 18);
      ctx.lineTo(rightCorner.x, rightCorner.y + 18);
      ctx.closePath();
      ctx.fillStyle = '#0a0d14';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.stroke();

      // Back isometric cutaway walls (left-top and right-top)
      const wallH = 38;
      ctx.beginPath();
      ctx.moveTo(topCorner.x, topCorner.y);
      ctx.lineTo(leftCorner.x, leftCorner.y);
      ctx.lineTo(leftCorner.x, leftCorner.y - wallH);
      ctx.lineTo(topCorner.x, topCorner.y - wallH);
      ctx.closePath();
      ctx.fillStyle = '#111622';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(topCorner.x, topCorner.y);
      ctx.lineTo(rightCorner.x, rightCorner.y);
      ctx.lineTo(rightCorner.x, rightCorner.y - wallH);
      ctx.lineTo(topCorner.x, topCorner.y - wallH);
      ctx.closePath();
      ctx.fillStyle = '#141926';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.stroke();

      // Floor base diamond
      drawIsoDiamond(ctx, 0, 0, 16, 16, '#12161f', 'rgba(249, 115, 22, 0.22)', 1.2);

      // Checkerboard isometric diamond tiles
      for (let gx = 0; gx < 16; gx += 1) {
        for (let gy = 0; gy < 16; gy += 1) {
          const isAlt = (gx + gy) % 2 === 0;
          drawIsoDiamond(
            ctx,
            gx,
            gy,
            1,
            1,
            isAlt ? 'rgba(255, 255, 255, 0.018)' : 'rgba(0, 0, 0, 0.14)',
            'rgba(255, 255, 255, 0.03)',
            0.75
          );
        }
      }

      // 3. Themed department carpets
      ISO_ZONES.forEach((zone) => {
        drawIsoDiamond(ctx, zone.gx, zone.gy, zone.gw, zone.gh, zone.fill, `${zone.accent}55`, 1.2);
        const labelPt = isoToScreen(zone.gx + zone.gw * 0.5, zone.gy + 0.35);
        ctx.fillStyle = zone.accent;
        ctx.font = '700 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(zone.label, labelPt.x, labelPt.y - 2);
      });

      // 4. Coffee Bar Station (top center)
      drawIsoDiamond(ctx, 7.1, 1.4, 1.8, 1.6, 'rgba(245, 158, 11, 0.14)', 'rgba(245, 158, 11, 0.45)', 1);
      const coffeeCenter = isoToScreen(COFFEE_GRID.gx, COFFEE_GRID.gy);
      ctx.fillStyle = '#fbbf24';
      ctx.font = '700 8.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('COFFEE BAR', coffeeCenter.x, coffeeCenter.y - 12);

      // 5. Central Glowing Mesa Redonda (Isometric Ellipse Table)
      const rt = isoToScreen(ROUNDTABLE_CENTER_GRID.gx, ROUNDTABLE_CENTER_GRID.gy);
      const isDebating = Boolean(roundtableTopicRef.current) || manualMeetingRef.current;

      // Ambient orange glow ring on floor
      const haloGrad = ctx.createRadialGradient(rt.x, rt.y, 12, rt.x, rt.y, 108);
      haloGrad.addColorStop(0, isDebating ? 'rgba(249, 115, 22, 0.34)' : 'rgba(249, 115, 22, 0.14)');
      haloGrad.addColorStop(1, 'rgba(11, 13, 18, 0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.ellipse(rt.x, rt.y, 108, 56, 0, 0, Math.PI * 2);
      ctx.fill();

      // Table pedestal
      ctx.fillStyle = '#0e1118';
      ctx.beginPath();
      ctx.ellipse(rt.x, rt.y + 10, 62, 31, 0, 0, Math.PI * 2);
      ctx.fill();

      // Table top obsidian + JARVIS Orange rim
      ctx.fillStyle = '#181e2c';
      ctx.beginPath();
      ctx.ellipse(rt.x, rt.y, 64, 32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = isDebating ? '#f97316' : 'rgba(249, 115, 22, 0.55)';
      ctx.lineWidth = isDebating ? 2.4 : 1.6;
      ctx.stroke();

      // Animated holographic reactor core in center of Mesa Redonda
      const pulse = 1 + Math.sin(tick * 2.5) * 0.14;
      ctx.strokeStyle = isDebating ? '#fb923c' : 'rgba(56, 189, 248, 0.6)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(rt.x, rt.y - 2, 18 * pulse, 9 * pulse, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = isDebating ? '#f97316' : '#38bdf8';
      ctx.beginPath();
      ctx.arc(rt.x, rt.y - 2, 4.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = isDebating ? '#fed7aa' : 'rgba(243, 244, 246, 0.72)';
      ctx.font = '700 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        isDebating ? 'MESA REDONDA · EM DEBATE' : `MESA REDONDA · ${assistantNameRef.current.toUpperCase()}`,
        rt.x,
        rt.y + 21
      );

      // 6. Isometric desks per department
      ISO_ZONES.forEach((zone) => {
        const slots = DEPT_DESK_GRID[zone.id] || [];
        slots.forEach((slot) => drawIsoDesk(ctx, slot.gx, slot.gy, zone.accent));
      });

      // 7. Update & Y-Sort Slime/Mascot Avatars
      const avatars = avatarsRef.current;
      const coffeePt = isoToScreen(COFFEE_GRID.gx, COFFEE_GRID.gy);

      avatars.forEach((av) => {
        if (isWanderingRef.current && !manualMeetingRef.current && !av.isLiveControlled) {
          av.pauseTimer -= 1;
          if (av.pauseTimer <= 0) {
            av.pauseTimer = 220 + Math.random() * 280;
            const r = Math.random();
            if (r < 0.22) {
              av.targetX = coffeePt.x + (Math.random() * 34 - 17);
              av.targetY = coffeePt.y + (Math.random() * 14 - 7);
              av.speechBubble = 'Pausa no café';
              av.bubbleTimer = 140;
            } else if (r < 0.42) {
              const seat = ROUNDTABLE_SEATS[Math.floor(Math.random() * ROUNDTABLE_SEATS.length)];
              av.targetX = seat.x;
              av.targetY = seat.y;
              av.speechBubble = 'Checando pauta';
              av.bubbleTimer = 120;
            } else {
              av.targetX = av.homeX;
              av.targetY = av.homeY;
              av.speechBubble = null;
            }
          }
        }

        const dx = av.targetX - av.x;
        const dy = av.targetY - av.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 2) {
          av.state = 'walking';
          av.x += (dx / dist) * av.speed;
          av.y += (dy / dist) * av.speed;
          av.facing = dx < 0 ? 'left' : 'right';
          av.walkCycle += 0.26;
        } else {
          av.state = av.isLiveControlled ? 'working' : 'idle';
          av.x = av.targetX;
          av.y = av.targetY;
        }

        if (av.bubbleTimer > 0) {
          av.bubbleTimer -= 1;
          if (av.bubbleTimer <= 0 && !av.isLiveControlled) {
            av.speechBubble = null;
          }
        }
      });

      const sorted = [...avatars].sort((a, b) => a.y - b.y);

      sorted.forEach((av) => {
        const isHovered = hoveredIdRef.current === av.id;
        const isActive = av.isLiveControlled || av.mood !== 'idle';
        const bounce =
          av.state === 'walking'
            ? Math.abs(Math.sin(av.walkCycle)) * 4.5
            : Math.sin(tick * 2 + av.homeX) * 1.1;

        ctx.save();
        ctx.translate(av.x, av.y);

        // Floor shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.beginPath();
        ctx.ellipse(0, 6, 11, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Active / Hover ring
        if (isHovered || isActive) {
          ctx.strokeStyle = isHovered ? '#fb923c' : av.color;
          ctx.lineWidth = isHovered ? 2 : 1.4;
          ctx.beginPath();
          ctx.ellipse(0, 6, 15, 7.5, 0, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Cute Slime/Mascot Dome Body
        ctx.fillStyle = av.color;
        ctx.beginPath();
        ctx.moveTo(-10, 4 - bounce);
        ctx.bezierCurveTo(-11, -10 - bounce, -7, -17 - bounce, 0, -17 - bounce);
        ctx.bezierCurveTo(7, -17 - bounce, 11, -10 - bounce, 10, 4 - bounce);
        ctx.quadraticCurveTo(0, 7 - bounce, -10, 4 - bounce);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(255,255,255,0.38)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Glossy slime highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.beginPath();
        ctx.ellipse(-4, -10 - bounce, 3, 1.8, -0.5, 0, Math.PI * 2);
        ctx.fill();

        // Eyes looking toward walking direction
        const eyeShift = av.facing === 'left' ? -1.8 : 1.8;
        ctx.fillStyle = '#0b0d12';
        ctx.beginPath();
        ctx.arc(-2.6 + eyeShift, -5 - bounce, 1.6, 0, Math.PI * 2);
        ctx.arc(2.6 + eyeShift, -5 - bounce, 1.6, 0, Math.PI * 2);
        ctx.fill();

        // Eye sparkle
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-2.1 + eyeShift, -5.6 - bounce, 0.6, 0, Math.PI * 2);
        ctx.arc(3.1 + eyeShift, -5.6 - bounce, 0.6, 0, Math.PI * 2);
        ctx.fill();

        // Maestro orange crown dot for jarvis_master
        if (av.id === 'jarvis_master') {
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.moveTo(-5, -17 - bounce);
          ctx.lineTo(-3, -22 - bounce);
          ctx.lineTo(0, -18 - bounce);
          ctx.lineTo(3, -22 - bounce);
          ctx.lineTo(5, -17 - bounce);
          ctx.closePath();
          ctx.fill();
        }

        // Compact name tag under avatar
        ctx.font = '600 8.5px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = isHovered ? '#ffffff' : 'rgba(243, 244, 246, 0.78)';
        ctx.fillText(av.properName, 0, 17);

        // Speech bubble when speaking, active, or hovered
        if (av.speechBubble || isHovered) {
          const rawText = av.speechBubble || `${av.properName} · ${av.role}`;
          const text = rawText.length > 34 ? `${rawText.slice(0, 32)}…` : rawText;
          ctx.font = '600 9px "Plus Jakarta Sans", sans-serif';
          const tw = ctx.measureText(text).width;
          const bw = tw + 14;
          const bh = 19;
          const by = -25 - bounce;

          ctx.fillStyle = 'rgba(11, 13, 18, 0.94)';
          ctx.strokeStyle = isActive ? '#f97316' : av.color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(-bw / 2, by - bh, bw, bh, 5);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#f3f4f6';
          ctx.textAlign = 'center';
          ctx.fillText(text, 0, by - 6);
        }

        ctx.restore();
      });

      frameId = requestAnimationFrame(render);
    };

    frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const mouseY = ((e.clientY - rect.top) / rect.height) * canvas.height;

    let found: CanvasAvatar | null = null;
    avatarsRef.current.forEach((av) => {
      if (Math.hypot(av.x - mouseX, av.y - 4 - mouseY) < 20) {
        found = av;
      }
    });
    hoveredIdRef.current = found ? (found as CanvasAvatar).id : null;
    setHoveredAvatar(found);
    canvas.style.cursor = found ? 'pointer' : 'default';
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const mouseY = ((e.clientY - rect.top) / rect.height) * canvas.height;

    const clicked = avatarsRef.current.find((av) => Math.hypot(av.x - mouseX, av.y - 4 - mouseY) < 22);
    if (clicked) {
      const fullAgent = agentsRef.current.find((a) => a.id === clicked.id);
      if (fullAgent) onSelectAgentRef.current(fullAgent);
    }
  };

  return (
    <div
      style={{
        borderRadius: 'var(--radius-lg)',
        backgroundColor: '#0b0d12',
        border: '1px solid var(--border-color)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Clean top bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-color)',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)', flexShrink: 0 }}>
            Andar Isométrico 2.5D
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>·</span>
          <span className="jarvis-tabular" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
            {agents.length} mascotes
          </span>
          {roundtableTopic && (
            <>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>·</span>
              <span
                title={roundtableTopic}
                style={{
                  fontSize: '0.74rem',
                  color: 'var(--accent-light)',
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                }}
              >
                Mesa Redonda: {roundtableTopic}
              </span>
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={handleToggleManualMeeting}
            className={`btn btn-sm ${manualMeeting ? 'btn-primary' : 'btn-secondary'}`}
          >
            {manualMeeting ? 'Dispersar Mesa Redonda' : 'Chamar para Mesa Redonda'}
          </button>

          <button
            type="button"
            onClick={() => setIsWandering((prev) => !prev)}
            className={`btn btn-sm ${isWandering ? 'btn-secondary is-active' : 'btn-ghost'}`}
          >
            {isWandering ? 'Pausar Passeio' : 'Passeio Livre'}
          </button>
        </div>
      </div>

      <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
        <canvas
          ref={canvasRef}
          data-testid="isometric-office-canvas"
          data-agent-count={agents.length}
          data-roundtable-active={roundtableTopic || manualMeeting ? 'true' : 'false'}
          width={980}
          height={540}
          onMouseMove={handleMouseMove}
          onClick={handleClick}
          style={{
            width: '100%',
            maxWidth: '100%',
            height: 'auto',
            aspectRatio: '980 / 540',
            display: 'block',
          }}
        />

        {hoveredAvatar && (
          <div
            style={{
              position: 'absolute',
              bottom: '12px',
              left: '14px',
              backgroundColor: 'rgba(18, 22, 31, 0.94)',
              border: `1px solid ${hoveredAvatar.color}`,
              padding: '6px 12px',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.76rem',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              pointerEvents: 'none',
            }}
          >
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: hoveredAvatar.color }} />
            <strong>{hoveredAvatar.properName}</strong>
            <span style={{ color: 'var(--text-muted)' }}>·</span>
            <span style={{ color: 'var(--text-secondary)' }}>{hoveredAvatar.role}</span>
            <span style={{ color: 'var(--text-muted)' }}>·</span>
            <span style={{ color: 'var(--accent-light)' }}>Clique para abrir</span>
          </div>
        )}
      </div>
    </div>
  );
};