import { GoogleGenAI, Type } from '@google/genai';
import {
  GitHubFileEntry,
  GitHubRawSnapshot,
  GitHubRepoInspection,
  buildStaticRepoInspection,
  parseGitHubRepoInput,
} from '../src/services/githubImporterEngine';

const GITHUB_API_BASE = 'https://api.github.com';
const FETCH_TIMEOUT_MS = 10_000;
const MAX_README_BYTES = 24_000;

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'jarvis-ai-hub-readonly-inspector',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = (process.env.GITHUB_TOKEN || '').trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function fetchGitHubJson<T>(apiPath: string): Promise<{ ok: boolean; status: number; data: T | null }> {
  // Segurança: aceita estritamente caminhos relativos dentro de https://api.github.com/repos/...
  if (!apiPath.startsWith('/repos/')) {
    throw new Error('Caminho de consulta GitHub não permitido.');
  }
  const url = `${GITHUB_API_BASE}${apiPath}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: githubHeaders(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    return { ok: false, status: res.status, data: null };
  }
  const data = (await res.json()) as T;
  return { ok: true, status: res.status, data };
}

function decodeBase64Utf8(rawBase64: string, maxBytes: number): string {
  const clean = String(rawBase64 || '').replace(/\s+/g, '');
  if (!clean) return '';
  const buf = Buffer.from(clean, 'base64');
  return buf.subarray(0, maxBytes).toString('utf8');
}

async function enrichWithGemini(
  base: GitHubRepoInspection,
  snapshot: GitHubRawSnapshot
): Promise<GitHubRepoInspection> {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY não configurada no servidor. Desmarque o enriquecimento por IA para usar a análise estática instantânea.'
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const prompt = [
    'Você é um arquiteto de software explicando um repositório GitHub em português do Brasil claro e acessível.',
    `Repositório: ${snapshot.owner}/${snapshot.repo}`,
    `Descrição: ${snapshot.description || 'N/A'}`,
    `Linguagens: ${base.topLanguages.join(', ') || base.primaryLanguage}`,
    `Tópicos: ${snapshot.topics.join(', ') || 'nenhum'}`,
    `Arquivos na raiz: ${snapshot.files.map((f) => f.name).join(', ')}`,
    `Scripts: ${base.detectedScripts.join(', ') || 'nenhum'}`,
    `Trecho do README:\n${base.readmeExcerpt.slice(0, 1400)}`,
    'Retorne um JSON resumindo em português simples o que este repositório faz, como pode turbinar o JARVIS AI Hub, um nome amigável de habilidade e uma missão objetiva para um agente dedicado.',
  ].join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summaryPtBr: { type: Type.STRING },
          howItBoostsJarvis: { type: Type.STRING },
          suggestedSkillName: { type: Type.STRING },
          suggestedAgentName: { type: Type.STRING },
          suggestedMission: { type: Type.STRING },
          capabilities: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
              },
              required: ['title', 'description'],
            },
          },
        },
        required: ['summaryPtBr', 'howItBoostsJarvis', 'suggestedSkillName', 'suggestedMission'],
      },
    },
  });

  const parsed = JSON.parse(response.text || '{}') as {
    summaryPtBr?: string;
    howItBoostsJarvis?: string;
    suggestedSkillName?: string;
    suggestedAgentName?: string;
    suggestedMission?: string;
    capabilities?: Array<{ title: string; description: string }>;
  };

  return {
    ...base,
    summaryPtBr: parsed.summaryPtBr?.trim() || base.summaryPtBr,
    howItBoostsJarvis: parsed.howItBoostsJarvis?.trim() || base.howItBoostsJarvis,
    suggestedSkillName: parsed.suggestedSkillName?.trim() || base.suggestedSkillName,
    suggestedAgentName: parsed.suggestedAgentName?.trim() || base.suggestedAgentName,
    suggestedMission: parsed.suggestedMission?.trim() || base.suggestedMission,
    detectedCapabilities:
      Array.isArray(parsed.capabilities) && parsed.capabilities.length > 0
        ? parsed.capabilities.slice(0, 6).map((c, i) => ({
            id: `ai_cap_${i}`,
            title: String(c.title || 'Capacidade'),
            description: String(c.description || ''),
            category: 'function' as const,
          }))
        : base.detectedCapabilities,
    analysisSource: 'gemini_ai',
  };
}

export async function inspectGitHubRepository(input: {
  url: string;
  useAi?: boolean;
}): Promise<GitHubRepoInspection> {
  const parsed = parseGitHubRepoInput(input.url);
  const repoPrefix = `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;

  const metaRes = await fetchGitHubJson<any>(repoPrefix);
  if (!metaRes.ok || !metaRes.data) {
    if (metaRes.status === 404) {
      throw new Error(
        `Repositório "${parsed.fullName}" não encontrado ou privado. Verifique o endereço e se o repositório é público.`
      );
    }
    if (metaRes.status === 403 || metaRes.status === 429) {
      throw new Error(
        'O limite temporário de consultas públicas da API do GitHub foi atingido. Aguarde alguns minutos ou configure GITHUB_TOKEN no servidor.'
      );
    }
    throw new Error(`Não foi possível consultar o GitHub agora (HTTP ${metaRes.status}).`);
  }

  const meta = metaRes.data;
  const [contentsRes, languagesRes, readmeRes] = await Promise.all([
    fetchGitHubJson<any[]>(`${repoPrefix}/contents`),
    fetchGitHubJson<Record<string, number>>(`${repoPrefix}/languages`),
    fetchGitHubJson<{ content?: string; encoding?: string }>(`${repoPrefix}/readme`),
  ]);

  const files: GitHubFileEntry[] = Array.isArray(contentsRes.data)
    ? contentsRes.data.slice(0, 60).map((item) => ({
        name: String(item.name || ''),
        path: String(item.path || item.name || ''),
        type: item.type === 'dir' ? 'dir' : 'file',
        size: typeof item.size === 'number' ? item.size : undefined,
      }))
    : [];

  const readmeText =
    readmeRes.ok && readmeRes.data?.content
      ? decodeBase64Utf8(readmeRes.data.content, MAX_README_BYTES)
      : '';

  let packageJson: GitHubRawSnapshot['packageJson'] = null;
  if (files.some((f) => f.name.toLowerCase() === 'package.json' && f.type === 'file')) {
    const pkgRes = await fetchGitHubJson<{ content?: string }>(`${repoPrefix}/contents/package.json`);
    if (pkgRes.ok && pkgRes.data?.content) {
      try {
        packageJson = JSON.parse(decodeBase64Utf8(pkgRes.data.content, 16_000));
      } catch {
        packageJson = null;
      }
    }
  }

  const snapshot: GitHubRawSnapshot = {
    owner: meta.owner?.login || parsed.owner,
    repo: meta.name || parsed.repo,
    canonicalUrl: `https://github.com/${meta.owner?.login || parsed.owner}/${meta.name || parsed.repo}`,
    description: String(meta.description || ''),
    defaultBranch: String(meta.default_branch || 'main'),
    stars: Number(meta.stargazers_count || 0),
    forks: Number(meta.forks_count || 0),
    language: String(meta.language || ''),
    languages: languagesRes.ok && languagesRes.data ? languagesRes.data : {},
    topics: Array.isArray(meta.topics) ? meta.topics.map(String) : [],
    license: meta.license?.spdx_id && meta.license.spdx_id !== 'NOASSERTION' ? String(meta.license.spdx_id) : String(meta.license?.name || 'Sem licença declarada'),
    homepage: typeof meta.homepage === 'string' ? meta.homepage : undefined,
    updatedAt: String(meta.pushed_at || meta.updated_at || new Date().toISOString()),
    files,
    readmeText,
    packageJson,
  };

  const baseInspection = buildStaticRepoInspection(snapshot);
  if (input.useAi) {
    return enrichWithGemini(baseInspection, snapshot);
  }
  return baseInspection;
}
