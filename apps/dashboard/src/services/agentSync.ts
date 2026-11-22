import type { AgentInfo } from '../types';
import { canUninstallAgent } from './agentTemplates';

export interface UnifiedDockAgent {
  id: string;
  role: string;
  name: string;
  properName: string;
  handle: string;
  subtitle: string;
  color: string;
  isCustom: boolean;
  canUninstall: boolean;
}

const CORE_DOCK_PRIORITY = [
  'jarvis_master',
  'sentinel_security',
  'english_tutor',
  'research_analyst',
  'ux_ui_designer',
  'software_architect',
];

const FALLBACK_COLORS = [
  '#f97316',
  '#10b981',
  '#38bdf8',
  '#f59e0b',
  '#fb7185',
  '#a78bfa',
  '#2dd4bf',
];

export function getAgentDisplayColor(agent: AgentInfo, idx = 0): string {
  return agent.mascot?.color || FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

export function getAgentProperName(agent: AgentInfo): string {
  const clean = (agent.proper_name || '').trim();
  if (clean) return clean;
  return agent.name || agent.role;
}

export function sortAgentsCustomFirst(agents: AgentInfo[]): AgentInfo[] {
  return [...agents].sort((a, b) => {
    const aCustom = a.is_custom ? 1 : 0;
    const bCustom = b.is_custom ? 1 : 0;
    if (aCustom !== bCustom) return bCustom - aCustom;
    return 0;
  });
}

/**
 * Resolve o painel lateral direito (AgentDock) exclusivamente a partir dos
 * agentes instalados/criados do usuário (GET /api/v1/agents), sem nenhuma
 * referência a catálogo técnico estático.
 */
export function resolveDockAgents(
  realAgents: AgentInfo[],
  searchTerm = ''
): UnifiedDockAgent[] {
  if (!realAgents || realAgents.length === 0) return [];

  const customAgents = realAgents.filter((a) => a.is_custom);
  const customRoles = new Set(customAgents.map((a) => a.role));

  const byRole = new Map<string, AgentInfo>();
  realAgents.forEach((ag) => byRole.set(ag.role, ag));

  const priorityAgents = CORE_DOCK_PRIORITY
    .map((role) => byRole.get(role))
    .filter((ag): ag is AgentInfo => Boolean(ag && !customRoles.has(ag.role)));
  const priorityRoles = new Set(priorityAgents.map((a) => a.role));

  const remainingAgents = realAgents.filter(
    (ag) => !customRoles.has(ag.role) && !priorityRoles.has(ag.role)
  );

  const ordered = [...customAgents, ...priorityAgents, ...remainingAgents];

  const mapped: UnifiedDockAgent[] = ordered.map((ag, idx) => ({
    id: ag.role,
    role: ag.role,
    name: getAgentProperName(ag),
    properName: getAgentProperName(ag),
    handle: ag.handle || `@${ag.role.split('_')[0]}`,
    subtitle: ag.name || ag.mission,
    color: getAgentDisplayColor(ag, idx),
    isCustom: Boolean(ag.is_custom),
    canUninstall: canUninstallAgent(ag),
  }));

  const q = searchTerm.trim().toLowerCase();
  if (!q) return mapped;
  return mapped.filter(
    (ag) =>
      ag.properName.toLowerCase().includes(q) ||
      ag.handle.toLowerCase().includes(q) ||
      ag.subtitle.toLowerCase().includes(q) ||
      ag.role.toLowerCase().includes(q)
  );
}

/**
 * Resolve a lista de agentes na barra lateral do Chat ("Meus Agentes")
 * estritamente a partir dos agentes instalados do usuário.
 */
export function resolveQuickChatAgents(
  realAgents: AgentInfo[],
  searchTerm = ''
): UnifiedDockAgent[] {
  return resolveDockAgents(realAgents, searchTerm).map((ag) => ({
    ...ag,
    id: `agent_${ag.role}`,
  }));
}
