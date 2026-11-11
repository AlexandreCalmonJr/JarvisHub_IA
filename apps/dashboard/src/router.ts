/**
 * Roteamento SPA baseado na History API.
 *
 * Mantém URLs profundas (`/coding`, `/agents`...), botões voltar/avançar e a
 * compatibilidade com o formato legado `?tab=...`. Sem dependências externas.
 */

export const TAB_PATHS: Record<string, string> = {
  chat: '/chat',
  office: '/office',
  coding: '/coding',
  overview: '/overview',
  workspace: '/workspace',
  tasks: '/tasks',
  agents: '/agents',
  skills: '/skills',
  knowledge: '/knowledge',
  models: '/models',
  approvals: '/approvals',
  security: '/security',
  advisor: '/advisor',
  server_logs: '/logs',
  backend_studio: '/backend-studio',
  quality: '/quality',
  design: '/design',
  executive_report: '/executive-report',
  learning: '/learning',
};

const PATH_TABS: Record<string, string> = {
  '': 'overview',
  chat: 'chat',
  office: 'office',
  habbo: 'office',
  studio: 'chat',
  coding: 'coding',
  code: 'coding',
  overview: 'overview',
  workspace: 'workspace',
  tasks: 'tasks',
  agents: 'agents',
  skills: 'skills',
  knowledge: 'knowledge',
  vault: 'knowledge',
  models: 'models',
  approvals: 'approvals',
  security: 'security',
  advisor: 'advisor',
  hardware: 'advisor',
  logs: 'server_logs',
  'server-logs': 'server_logs',
  'backend-studio': 'backend_studio',
  backend_studio: 'backend_studio',
  mock: 'backend_studio',
  quality: 'quality',
  qa: 'quality',
  design: 'design',
  'executive-report': 'executive_report',
  executive_report: 'executive_report',
  learning: 'learning',
  help: 'learning',
  intelligence: 'executive_report',
};

export const KNOWN_TABS = new Set(Object.keys(TAB_PATHS));

export function isKnownTab(tab: string): boolean {
  return KNOWN_TABS.has(tab);
}

export function tabFromLocation(pathname: string, search = ''): string {
  const params = new URLSearchParams(search);
  const tabParam = params.get('tab');
  if (tabParam) {
    return KNOWN_TABS.has(tabParam) ? tabParam : 'not_found';
  }

  const path = pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  if (path === 'apps/dashboard') {
    return 'overview';
  }
  return PATH_TABS[path] || 'not_found';
}

export function pathForTab(tab: string): string {
  return TAB_PATHS[tab] || '/404';
}

export function updateDocumentTitle(tab: string, title: string): void {
  document.title = `${title} • JARVIS AI HUB`;
  void tab;
}
