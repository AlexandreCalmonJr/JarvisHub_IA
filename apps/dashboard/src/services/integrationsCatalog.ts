export type IntegrationProviderId = 'github' | 'figma' | 'huggingface' | 'context_sets';

export interface IntegrationConnectorRecord {
  id: IntegrationProviderId;
  name: string;
  tagline: string;
  connected: boolean;
  masked_token: string;
  target_ref: string;
  allowed_agents: string[];
  last_synced_at?: string | null;
  last_sync_summary?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ContextSetRecord {
  id: string;
  name: string;
  description: string;
  source_type: 'markdown' | 'pdf' | 'github' | 'figma' | 'docs';
  source_ref: string;
  content: string;
  token_estimate: number;
  allowed_agents: string[];
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface FigmaDesignTokenPack {
  file_name: string;
  file_key: string;
  colors: Array<{ name: string; hex: string }>;
  typography: Array<{ name: string; fontFamily: string; sizePx: number }>;
  components_count: number;
  synced_live: boolean;
}

export function maskSecret(raw?: string | null): string {
  const clean = (raw || '').trim();
  if (!clean) return '';
  if (clean.length <= 8) return '••••••••';
  return `${clean.slice(0, 4)}••••••${clean.slice(-4)}`;
}

export function parseGitHubRepoRef(raw?: string | null): { owner: string; repo: string } | null {
  const clean = (raw || '').trim();
  if (!clean) return null;
  const urlMatch = clean.match(/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/i);
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2].replace(/\.git$/i, '') };
  }
  const shortMatch = clean.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2].replace(/\.git$/i, '') };
  }
  return null;
}

export function parseFigmaFileKey(raw?: string | null): string | null {
  const clean = (raw || '').trim();
  if (!clean) return null;
  const urlMatch = clean.match(/figma\.com\/(?:file|design|proto)\/([a-zA-Z0-9]+)/i);
  if (urlMatch) return urlMatch[1];
  if (/^[a-zA-Z0-9]{10,40}$/.test(clean)) return clean;
  return null;
}

export function parseSkillMarkdown(
  rawMd: string,
  fallbackName = 'Skill Importada'
): {
  name: string;
  description: string;
  domain: string;
  instructions: string;
} {
  const text = (rawMd || '').trim();
  let name = fallbackName;
  let description = 'Pacote de instruções importado de SKILL.md.';
  let domain = 'general';
  let body = text;

  const fmMatch = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (fmMatch) {
    const frontmatter = fmMatch[1];
    body = fmMatch[2].trim();
    const nameLine = frontmatter.match(/^name:\s*(.+)$/im);
    const descLine = frontmatter.match(/^description:\s*(.+)$/im);
    const domainLine = frontmatter.match(/^domain:\s*(.+)$/im);
    if (nameLine) name = nameLine[1].trim().replace(/^['"]|['"]$/g, '');
    if (descLine) description = descLine[1].trim().replace(/^['"]|['"]$/g, '');
    if (domainLine) domain = domainLine[1].trim().replace(/^['"]|['"]$/g, '');
  } else {
    const h1 = text.match(/^#\s+(.+)$/m);
    if (h1) name = h1[1].trim();
    const firstParagraph = text
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#') && !l.startsWith('-'));
    if (firstParagraph) description = firstParagraph.slice(0, 180);
  }

  return {
    name,
    description,
    domain,
    instructions: body || text,
  };
}

export function canAgentAccessResource(allowedAgents: string[], agentRole: string): boolean {
  if (!Array.isArray(allowedAgents) || allowedAgents.length === 0) return false;
  if (allowedAgents.includes('*')) return true;
  return allowedAgents.includes(agentRole);
}
