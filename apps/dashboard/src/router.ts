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
};

const PATH_TABS: Record<string, string> = {
  '': 'chat',
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
  intelligence: 'executive_report',
};

const KNOWN_TABS = new Set(Object.keys(TAB_PATHS));

export function tabFromLocation(pathname: string, search = ''): string {
  const params = new URLSearchParams(search);
  const tabParam = params.get('tab');
  if (tabParam && KNOWN_TABS.has(tabParam)) {
    return tabParam;
  }

  const path = pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  if (path.startsWith('apps/dashboard')) {
    return 'chat';
  }
  return PATH_TABS[path] || 'chat';
}

export function pathForTab(tab: string): string {
  return TAB_PATHS[tab] || TAB_PATHS.chat;
}

export function updateDocumentTitle(tab: string, title: string): void {
  document.title = `${title} • JARVIS AI HUB`;
  void tab;
}
