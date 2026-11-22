export type GitHubIncorporationMode = 'skill' | 'agent' | 'knowledge';

export interface ParsedGitHubRepo {
  owner: string;
  repo: string;
  fullName: string;
  canonicalUrl: string;
}

export interface GitHubFileEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size?: number;
}

export interface GitHubRawSnapshot {
  owner: string;
  repo: string;
  canonicalUrl: string;
  description: string;
  defaultBranch: string;
  stars: number;
  forks: number;
  language: string;
  languages: Record<string, number>;
  topics: string[];
  license: string;
  homepage?: string;
  updatedAt: string;
  files: GitHubFileEntry[];
  readmeText: string;
  packageJson?: {
    name?: string;
    description?: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  } | null;
}

export interface GitHubDetectedCapability {
  id: string;
  title: string;
  description: string;
  category: 'function' | 'integration' | 'automation' | 'knowledge';
}

export interface GitHubRepoInspection {
  id: string;
  owner: string;
  repo: string;
  fullName: string;
  canonicalUrl: string;
  defaultBranch: string;
  stars: number;
  forks: number;
  primaryLanguage: string;
  topLanguages: string[];
  license: string;
  topics: string[];
  updatedAt: string;
  summaryPtBr: string;
  howItBoostsJarvis: string;
  suggestedCategory: 'dev' | 'business' | 'creative' | 'security' | 'studies';
  suggestedSkillName: string;
  suggestedAgentName: string;
  suggestedAgentHandle: string;
  suggestedMission: string;
  detectedCapabilities: GitHubDetectedCapability[];
  detectedScripts: string[];
  topDependencies: string[];
  filesPreview: GitHubFileEntry[];
  readmeExcerpt: string;
  analysisSource: 'analise_estatica' | 'gemini_ai';
  inspectedAt: string;
  incorporatedModes: GitHubIncorporationMode[];
}

export interface CuratedGitHubExample {
  label: string;
  url: string;
  hint: string;
}

export const CURATED_GITHUB_EXAMPLES: CuratedGitHubExample[] = [
  {
    label: 'n8n-io/n8n',
    url: 'https://github.com/n8n-io/n8n',
    hint: 'Automação de fluxos e integrações',
  },
  {
    label: 'tiangolo/fastapi',
    url: 'https://github.com/tiangolo/fastapi',
    hint: 'Framework Python moderno para APIs',
  },
  {
    label: 'shadcn-ui/ui',
    url: 'https://github.com/shadcn-ui/ui',
    hint: 'Componentes acessíveis de interface',
  },
  {
    label: 'vercel/ai',
    url: 'https://github.com/vercel/ai',
    hint: 'SDK de aplicações e agentes de IA',
  },
];

const SAFE_SEGMENT_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9])?$/;

/**
 * Faz o parse seguro de links ou atalhos GitHub (`https://github.com/owner/repo` ou `owner/repo`).
 * Bloqueia qualquer host fora de github.com, IPs privados, credenciais na URL ou path traversal.
 */
export function parseGitHubRepoInput(rawInput: string): ParsedGitHubRepo {
  const trimmed = String(rawInput || '').trim();
  if (!trimmed) {
    throw new Error('Cole o link de um repositório público do GitHub (ex.: https://github.com/usuario/projeto).');
  }
  if (trimmed.length > 300) {
    throw new Error('Link muito longo. Informe apenas o endereço do repositório GitHub.');
  }

  let owner = '';
  let repo = '';

  if (/^https?:\/\//i.test(trimmed)) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new Error('URL inválida. Use o formato https://github.com/usuario/repositorio.');
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('Protocolo não permitido. Use um endereço https://github.com/usuario/repositorio.');
    }
    if (parsed.username || parsed.password) {
      throw new Error('Não inclua credenciais na URL do repositório.');
    }
    const host = parsed.hostname.toLowerCase();
    if (host !== 'github.com' && host !== 'www.github.com') {
      throw new Error('Somente repositórios hospedados em github.com são aceitos neste importador.');
    }

    const segments = parsed.pathname
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);

    if (segments.length < 2) {
      throw new Error('Informe o dono e o nome do repositório (ex.: https://github.com/usuario/projeto).');
    }
    owner = segments[0];
    repo = segments[1].replace(/\.git$/i, '');
  } else {
    // Atalho owner/repo (bloqueando hosts ou protocolos disfarçados)
    if (trimmed.includes('://') || trimmed.includes('@') || trimmed.includes('\\')) {
      throw new Error('Use o formato https://github.com/usuario/repositorio ou usuario/repositorio.');
    }
    const cleaned = trimmed.replace(/^github\.com\//i, '').replace(/^www\.github\.com\//i, '');
    const segments = cleaned.split('/').filter(Boolean);
    if (segments.length < 2) {
      throw new Error('Informe usuário e repositório no formato usuario/projeto.');
    }
    owner = segments[0];
    repo = segments[1].replace(/\.git$/i, '');
  }

  if (
    owner === '.' ||
    owner === '..' ||
    repo === '.' ||
    repo === '..' ||
    owner.includes('..') ||
    repo.includes('..') ||
    !SAFE_SEGMENT_RE.test(owner) ||
    !SAFE_SEGMENT_RE.test(repo)
  ) {
    throw new Error('Nome de organização ou repositório inválido.');
  }

  const fullName = `${owner}/${repo}`;
  return {
    owner,
    repo,
    fullName,
    canonicalUrl: `https://github.com/${owner}/${repo}`,
  };
}

function titleCaseRepoName(repo: string): string {
  return repo
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function stripMarkdownNoise(markdown: string, maxLen = 1800): string {
  const cleaned = String(markdown || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen).trim()}...` : cleaned;
}

export function inferCategoryFromSnapshot(
  snapshot: Pick<GitHubRawSnapshot, 'description' | 'topics' | 'language' | 'readmeText' | 'files'>
): 'dev' | 'business' | 'creative' | 'security' | 'studies' {
  const blob = [
    snapshot.description,
    snapshot.language,
    ...snapshot.topics,
    snapshot.readmeText.slice(0, 1200),
    ...snapshot.files.map((f) => f.name),
  ]
    .join(' ')
    .toLowerCase();

  if (/\b(security|pentest|owasp|audit|auth|encrypt|vuln|firewall|cyber|sentinel)\b/.test(blob)) {
    return 'security';
  }
  if (/\b(design|ui|css|canvas|image|video|audio|figma|3d|shader|animation|creative)\b/.test(blob)) {
    return 'creative';
  }
  if (/\b(finance|crm|erp|invoice|excel|spreadsheet|sales|analytics|bi|marketing|workflow|automation)\b/.test(blob)) {
    return 'business';
  }
  if (/\b(course|tutorial|book|study|learn|education|awesome|roadmap|notes)\b/.test(blob)) {
    return 'studies';
  }
  return 'dev';
}

export function buildStaticRepoInspection(snapshot: GitHubRawSnapshot): GitHubRepoInspection {
  const friendlyName = titleCaseRepoName(snapshot.repo);
  const topLanguages = Object.entries(snapshot.languages || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([lang]) => lang);

  if (topLanguages.length === 0 && snapshot.language) {
    topLanguages.push(snapshot.language);
  }

  const fileNamesLower = new Set(snapshot.files.map((f) => f.name.toLowerCase()));
  const scripts = Object.keys(snapshot.packageJson?.scripts || {}).slice(0, 10);
  const deps = Object.keys({
    ...(snapshot.packageJson?.dependencies || {}),
    ...(snapshot.packageJson?.devDependencies || {}),
  }).slice(0, 14);

  const capabilities: GitHubDetectedCapability[] = [];

  if (fileNamesLower.has('package.json')) {
    capabilities.push({
      id: 'cap_node_js',
      title: 'Ecossistema Node.js / TypeScript',
      description:
        scripts.length > 0
          ? `Contém scripts automatizados (${scripts.slice(0, 4).join(', ')}) e ${deps.length} dependências mapeadas.`
          : 'Projeto JavaScript/TypeScript com manifesto package.json pronto para consulta técnica.',
      category: 'function',
    });
  }
  if (fileNamesLower.has('pyproject.toml') || fileNamesLower.has('requirements.txt')) {
    capabilities.push({
      id: 'cap_python',
      title: 'Módulos e Automação Python',
      description: 'Estrutura Python detectada para scripts de dados, APIs ou automações integráveis.',
      category: 'automation',
    });
  }
  if (fileNamesLower.has('dockerfile') || fileNamesLower.has('docker-compose.yml') || fileNamesLower.has('docker-compose.yaml')) {
    capabilities.push({
      id: 'cap_docker',
      title: 'Empacotamento Docker Pronto',
      description: 'Inclui configuração de contêiner Docker para rodar como serviço isolado conectado ao Cérebro.',
      category: 'integration',
    });
  }
  if (fileNamesLower.has('openapi.yaml') || fileNamesLower.has('openapi.json') || snapshot.topics.some((t) => /api|rest|graphql|sdk/i.test(t))) {
    capabilities.push({
      id: 'cap_api_sdk',
      title: 'Integração via API / SDK',
      description: 'Expõe contratos de API ou SDK reutilizáveis para conectar agentes do JARVIS.',
      category: 'integration',
    });
  }
  if (snapshot.files.some((f) => /^(src|lib|packages|apps|plugins|skills|agents)$/i.test(f.name) && f.type === 'dir')) {
    const dirs = snapshot.files
      .filter((f) => f.type === 'dir')
      .slice(0, 5)
      .map((f) => `${f.name}/`)
      .join(', ');
    capabilities.push({
      id: 'cap_arch_modules',
      title: 'Arquitetura Modular Mapeada',
      description: `Estrutura organizada em módulos (${dirs}), facilitando consultas e geração de código compatível.`,
      category: 'knowledge',
    });
  }
  if (capabilities.length === 0) {
    capabilities.push({
      id: 'cap_docs_reference',
      title: 'Base Documental e Referência Técnica',
      description: 'Documentação e arquivos do repositório prontos para orientar respostas especializadas no JARVIS.',
      category: 'knowledge',
    });
  }

  const category = inferCategoryFromSnapshot(snapshot);
  const langSummary = topLanguages.length > 0 ? topLanguages.slice(0, 3).join(', ') : 'múltiplas tecnologias';
  const rawDesc = snapshot.description?.trim() || `Repositório open-source ${snapshot.owner}/${snapshot.repo}`;

  const summaryPtBr =
    `${friendlyName} (${snapshot.owner}/${snapshot.repo}) é um projeto em ${langSummary}. ` +
    `Descrição original: "${rawDesc}". ` +
    `Foram inspecionados ${snapshot.files.length} itens na raiz${scripts.length ? ` e ${scripts.length} comandos/scripts` : ''} em modo somente leitura.`;

  const howItBoostsJarvis =
    `Ao incorporar este repositório, seus agentes passam a dominar os padrões, comandos e documentação de ${friendlyName} — ` +
    `como uma Habilidade vinculável a qualquer agente, um novo Especialista dedicado no Dock ou referência pesquisável na Base de Conhecimento.`;

  const cleanHandleBase = snapshot.repo
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 16) || 'repo';

  return {
    id: `gh_${snapshot.owner}_${snapshot.repo}_${Date.now().toString(36)}`.replace(/[^a-zA-Z0-9_-]/g, '_'),
    owner: snapshot.owner,
    repo: snapshot.repo,
    fullName: `${snapshot.owner}/${snapshot.repo}`,
    canonicalUrl: snapshot.canonicalUrl,
    defaultBranch: snapshot.defaultBranch || 'main',
    stars: snapshot.stars || 0,
    forks: snapshot.forks || 0,
    primaryLanguage: snapshot.language || topLanguages[0] || 'Multi',
    topLanguages,
    license: snapshot.license || 'Sem licença declarada',
    topics: (snapshot.topics || []).slice(0, 10),
    updatedAt: snapshot.updatedAt || new Date().toISOString(),
    summaryPtBr,
    howItBoostsJarvis,
    suggestedCategory: category,
    suggestedSkillName: `GitHub · ${friendlyName}`,
    suggestedAgentName: `Especialista ${friendlyName}`,
    suggestedAgentHandle: `@${cleanHandleBase}`,
    suggestedMission: `Dominar, explicar e aplicar recursos e padrões do projeto ${snapshot.owner}/${snapshot.repo} no JARVIS.`,
    detectedCapabilities: capabilities,
    detectedScripts: scripts,
    topDependencies: deps,
    filesPreview: snapshot.files.slice(0, 24),
    readmeExcerpt: stripMarkdownNoise(snapshot.readmeText, 1600),
    analysisSource: 'analise_estatica',
    inspectedAt: new Date().toISOString(),
    incorporatedModes: [],
  };
}

export function buildGitHubKnowledgeMarkdown(inspection: GitHubRepoInspection): string {
  const lines: string[] = [
    `# Repositório GitHub: ${inspection.fullName}`,
    '',
    `- **URL oficial**: ${inspection.canonicalUrl}`,
    `- **Linguagens principais**: ${inspection.topLanguages.join(', ') || inspection.primaryLanguage}`,
    `- **Licença**: ${inspection.license}`,
    `- **Estrelas**: ${inspection.stars.toLocaleString('pt-BR')} · **Branch padrão**: ${inspection.defaultBranch}`,
    '',
    '## Resumo',
    inspection.summaryPtBr,
    '',
    '## Como fortalece o JARVIS',
    inspection.howItBoostsJarvis,
    '',
    '## Capacidades e Funções Detectadas',
    ...inspection.detectedCapabilities.map((c) => `- **${c.title}**: ${c.description}`),
  ];

  if (inspection.detectedScripts.length > 0) {
    lines.push('', '## Scripts / Comandos Encontrados', ...inspection.detectedScripts.map((s) => `- \`${s}\``));
  }
  if (inspection.topDependencies.length > 0) {
    lines.push('', '## Dependências Principais', inspection.topDependencies.join(', '));
  }
  if (inspection.readmeExcerpt) {
    lines.push('', '## Trecho do README', inspection.readmeExcerpt);
  }
  return lines.join('\n');
}
