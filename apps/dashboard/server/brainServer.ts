/**
 * Fase 8 — Helpers de Servidor para o Cérebro Dual-Mode & Multi-Cérebros.
 * Empacota os 8 arquivos reais do servidor (Docker Compose + SQLite Local) em .zip
 * e executa verificação segura de latência/saúde de Cérebros cadastrados.
 */
import JSZip from 'jszip';
import {
  buildDualModeServerArtifacts,
  DEFAULT_DEPLOYMENT_OPTIONS,
  validateBrainProfileUrl,
  type BrainDeploymentOptions,
  type GeneratedServerArtifact,
} from '../src/services/brainArchitectureEngine.ts';

export function resolveDeploymentOptions(body: Record<string, unknown>): BrainDeploymentOptions {
  const rawMode = String(body?.mode || DEFAULT_DEPLOYMENT_OPTIONS.mode);
  const mode: 'local_sqlite' | 'docker_postgres' =
    rawMode === 'local_sqlite' ? 'local_sqlite' : 'docker_postgres';

  return {
    brainName:
      String(body?.brainName || DEFAULT_DEPLOYMENT_OPTIONS.brainName).trim().slice(0, 64) ||
      DEFAULT_DEPLOYMENT_OPTIONS.brainName,
    mode,
    port: Math.min(65535, Math.max(1024, Number(body?.port || DEFAULT_DEPLOYMENT_OPTIONS.port) || 3000)),
    enableOllama: body?.enableOllama !== undefined ? Boolean(body.enableOllama) : true,
    enableRemoteGateway: body?.enableRemoteGateway !== undefined ? Boolean(body.enableRemoteGateway) : true,
    enablePythonWorker: body?.enablePythonWorker !== undefined ? Boolean(body.enablePythonWorker) : true,
    enableGoGateway: body?.enableGoGateway !== undefined ? Boolean(body.enableGoGateway) : true,
    dataDir:
      String(body?.dataDir || DEFAULT_DEPLOYMENT_OPTIONS.dataDir).trim().slice(0, 120) ||
      DEFAULT_DEPLOYMENT_OPTIONS.dataDir,
    postgresDb:
      String(body?.postgresDb || DEFAULT_DEPLOYMENT_OPTIONS.postgresDb).trim().slice(0, 40) ||
      DEFAULT_DEPLOYMENT_OPTIONS.postgresDb,
    assistantName:
      String(body?.assistantName || DEFAULT_DEPLOYMENT_OPTIONS.assistantName).trim().slice(0, 32) || 'JARVIS',
  };
}

export async function buildDualModeBundleZip(options: BrainDeploymentOptions): Promise<{
  files: GeneratedServerArtifact[];
  zipBuffer: Buffer;
  filename: string;
}> {
  const files = buildDualModeServerArtifacts(options);
  const zip = new JSZip();
  const rootName = 'jarvis-brain-server';
  const root = zip.folder(rootName);

  if (!root) {
    throw new Error('Falha ao inicializar pacote ZIP do servidor.');
  }

  for (const file of files) {
    root.file(file.path, file.content);
  }

  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const slug = options.mode === 'local_sqlite' ? 'local-sqlite' : 'docker-compose';
  return {
    files,
    zipBuffer,
    filename: `jarvis-brain-server-${slug}.zip`,
  };
}

export async function probeBrainHealth(
  rawBaseUrl: string,
  isLocalCurrent?: boolean
): Promise<{
  status: 'online' | 'offline';
  latencyMs: number | null;
  checkedAt: string;
  detail: string;
}> {
  const checkedAt = new Date().toISOString();
  if (isLocalCurrent) {
    return {
      status: 'online',
      latencyMs: 3,
      checkedAt,
      detail: 'Cérebro ativo respondendo localmente nesta instância.',
    };
  }

  const check = validateBrainProfileUrl(rawBaseUrl);
  if (!check.valid) {
    return {
      status: 'offline',
      latencyMs: null,
      checkedAt,
      detail: check.error || 'Endereço de servidor inválido.',
    };
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`${check.normalizedUrl}/api/v1/brain/health`, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    const latencyMs = Math.max(1, Date.now() - startedAt);
    if (!res.ok) {
      return {
        status: 'offline',
        latencyMs,
        checkedAt,
        detail: `Servidor respondeu com HTTP ${res.status}.`,
      };
    }
    return {
      status: 'online',
      latencyMs,
      checkedAt,
      detail: `Cérebro online (${latencyMs} ms).`,
    };
  } catch {
    return {
      status: 'offline',
      latencyMs: null,
      checkedAt,
      detail: 'Servidor inacessível no momento (verifique se o Docker ou PC está ligado na rede).',
    };
  } finally {
    clearTimeout(timer);
  }
}
