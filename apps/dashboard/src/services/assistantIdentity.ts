export type WorkspaceExperienceMode = 'simple' | 'engineering';

export interface AssistantNamePreset {
  name: string;
  tagline: string;
  recommendedMode: WorkspaceExperienceMode;
}

export const DEFAULT_ASSISTANT_NAME = 'JARVIS';

export const ASSISTANT_NAME_PRESETS: AssistantNamePreset[] = [
  { name: 'JARVIS', tagline: 'Clássico & Estratégico', recommendedMode: 'engineering' },
  { name: 'João', tagline: 'Direto & Parceiro de Projetos', recommendedMode: 'engineering' },
  { name: 'Maria', tagline: 'Acolhedora & Foco em Estudos', recommendedMode: 'simple' },
  { name: 'Luna', tagline: 'Criativa & Organizada', recommendedMode: 'simple' },
];

export const SIMPLE_MODE_TAB_IDS = [
  'overview',
  'chat',
  'agents',
  'workflows',
  'tasks',
  'knowledge',
  'learning',
  'settings',
] as const;

export function normalizeAssistantName(raw?: string | null): string {
  const cleaned = (raw || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return DEFAULT_ASSISTANT_NAME;
  return cleaned.slice(0, 40);
}

export function getAssistantInitial(name?: string | null): string {
  const normalized = normalizeAssistantName(name);
  const firstChar = Array.from(normalized)[0] || 'J';
  return firstChar.toUpperCase();
}

export function getTimeBasedGreeting(
  assistantName: string,
  userDisplayName?: string | null,
  hour: number = new Date().getHours()
): { headline: string; subtitle: string } {
  const safeAssistant = normalizeAssistantName(assistantName);
  const firstUserWord = (userDisplayName || '').trim().split(/\s+/)[0];
  const greetingPrefix =
    hour >= 5 && hour < 12
      ? 'Bom dia'
      : hour >= 12 && hour < 18
        ? 'Boa tarde'
        : 'Boa noite';

  const headline = firstUserWord
    ? `${greetingPrefix}, ${firstUserWord}`
    : `${greetingPrefix}`;

  const subtitle =
    hour >= 5 && hour < 12
      ? `${safeAssistant} está por aqui para organizar o seu dia e suas prioridades.`
      : hour >= 12 && hour < 18
        ? `${safeAssistant} está acompanhando seus projetos, estudos e tarefas em tempo real.`
        : `${safeAssistant} está online para revisar pendências ou continuar de onde você parou.`;

  return { headline, subtitle };
}

export function formatAssistantPlaceholder(
  assistantName: string,
  mode: WorkspaceExperienceMode
): string {
  const safeName = normalizeAssistantName(assistantName);
  if (mode === 'simple') {
    return `Converse com ${safeName}, peça um resumo, organize tarefas ou chame @especialista...`;
  }
  return `Pergunte ao ${safeName}, digite @ para chamar um especialista ou / para ações rápidas...`;
}

export function isTabVisibleInMode(tabId: string, mode: WorkspaceExperienceMode): boolean {
  if (mode === 'engineering') return true;
  return (SIMPLE_MODE_TAB_IDS as readonly string[]).includes(tabId);
}

export function normalizeExperienceMode(raw?: string | null): WorkspaceExperienceMode {
  if (raw === 'simple' || raw === 'essential') return 'simple';
  return 'engineering';
}
