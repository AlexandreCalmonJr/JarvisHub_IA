export interface WakeWordDetectionResult {
  detected: boolean;
  triggerPhrase: string | null;
  command: string;
}

export interface OfflineCommandItem {
  id: string;
  text: string;
  target: 'voice' | 'companion';
  createdAt: string;
}

export interface DailyBriefingInput {
  assistantName: string;
  userName: string;
  hour: number;
  pendingApprovals: number;
  openIncidents: number;
  activeWorkflows: number;
}

function stripDiacritics(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Detecta palavra de ativação dinâmica ("Ei JARVIS", "Hey Maria", "Oi João", etc.)
 * e extrai o comando falado logo após a saudação.
 * Suporta pontuação natural (ex: "Ei, JARVIS!"), variações fonéticas do Web Speech API em PT-BR
 * e comandos emitidos com ou sem pausa.
 */
export function detectWakeWord(transcript: string, assistantName: string): WakeWordDetectionResult {
  const raw = (transcript || '').trim();
  if (!raw) {
    return { detected: false, triggerPhrase: null, command: '' };
  }

  const displayAssistant = (assistantName || 'JARVIS').trim() || 'JARVIS';
  const cleanAssistant = stripDiacritics(displayAssistant);
  const isJarvis = cleanAssistant.replace(/[^a-z0-9]/g, '') === 'jarvis';

  // Variações e transcrições fonéticas comuns do Web Speech API em PT-BR para JARVIS
  // (ex: "Jarbas", "Jarves", "Iarvis", "Iarves", "Jervis", "Jarvys", "Gervis", "Gerbis", "Jarbis", "Jarviz", "Djarvis", "Jarve", "J.A.R.V.I.S.")
  const namePattern = isJarvis
    ? '(?:jarvis|jarves|jarbas|iarvis|iarves|jervis|jarvys|gervis|gerbis|jarbis|jarviz|djarvis|jarve|j\\.?a\\.?r\\.?v\\.?i\\.?s\\.?)'
    : cleanAssistant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const norm = stripDiacritics(raw);

  // Aceita prefixos naturais em português e inglês:
  // ei, hey, oi, oie, olá, ok, fala, fala aí, fala tu, diga, diga aí, diga lá, chama,
  // e aí, eae, eai, bom dia, boa tarde, boa noite, beleza, blz, opa, alô, salve,
  // ô, o, aí, ai, ae, ow, acorda, ajuda
  // Permite pontuações e espaços naturais entre o prefixo e o nome (ex: "Ei, JARVIS!", "E aí, Jarvis?", "Bom dia JARVIS")
  const prefixPattern =
    '(?:ei|hey|oi|oie|ola|ok|fala(?:\\s+(?:ai|tu))?|diga(?:\\s+(?:ai|la))?|chama(?:\\s+[oa])?|e\\s*ai|eae|bom\\s+dia|boa\\s+tarde|boa\\s+noite|beleza|blz|opa|alo|salve|o|ai|ae|ow|acorda|ajuda)';
  const wakeRegex = new RegExp(`(?:^|[\\s,!?:;.-]+)${prefixPattern}[\\s,!?:;.-]+${namePattern}\\b[\\s,!?:;.-]*`, 'i');
  const match = norm.match(wakeRegex);

  if (match && typeof match.index === 'number') {
    const endIndex = match.index + match[0].length;
    const command = raw.slice(endIndex).replace(/^[\s,!?:;.-]+/, '').trim();
    return {
      detected: true,
      triggerPhrase: `Ei ${displayAssistant}`,
      command,
    };
  }

  // Também detecta menção direta do nome no início ou após fronteira de frase ("JARVIS, me ajude", "JARVIS qual o resumo")
  const directRegex = new RegExp(`(?:^|[!?:;.-]+|,[\\s]*)${namePattern}\\b[\\s,!?:;.-]*`, 'i');
  const directMatch = norm.match(directRegex);
  if (directMatch && typeof directMatch.index === 'number') {
    const endIndex = directMatch.index + directMatch[0].length;
    const command = raw.slice(endIndex).replace(/^[\s,!?:;.-]+/, '').trim();
    return {
      detected: true,
      triggerPhrase: displayAssistant,
      command,
    };
  }

  return {
    detected: false,
    triggerPhrase: null,
    command: raw,
  };
}

/**
 * Monta saudação humanizada contextual + resumo operacional rápido (Briefing Diário).
 */
export function buildContextualGreeting(input: DailyBriefingInput): {
  greeting: string;
  briefingLine: string;
} {
  const name = (input.userName || 'você').trim().split(' ')[0];
  const assistant = (input.assistantName || 'JARVIS').trim();
  const h = Number.isFinite(input.hour) ? input.hour : 9;

  const salutation =
    h >= 5 && h < 12 ? 'Bom dia' : h >= 12 && h < 18 ? 'Boa tarde' : 'Boa noite';

  const greeting = `${salutation}, ${name}! Aqui é ${assistant}. Como está sendo o seu dia?`;

  const parts: string[] = [];
  if (input.pendingApprovals > 0) {
    parts.push(`${input.pendingApprovals} aprovação(ões) pendente(s)`);
  }
  if (input.openIncidents > 0) {
    parts.push(`${input.openIncidents} alerta(s) aberto(s) na Kira Sentinela`);
  }
  if (input.activeWorkflows > 0) {
    parts.push(`${input.activeWorkflows} rotina(s) automatizada(s) ativa(s)`);
  }

  const briefingLine =
    parts.length > 0
      ? `Resumo rápido: você tem ${parts.join(', ')}. Posso ler os detalhes ou iniciar uma nova tarefa por voz.`
      : 'Tudo tranquilo no seu ecossistema agora — nenhum alerta crítico e nenhuma pendência bloqueando seu dia.';

  return { greeting, briefingLine };
}

export function enqueueOfflineCommand(
  queue: OfflineCommandItem[],
  text: string,
  target: 'voice' | 'companion' = 'voice'
): OfflineCommandItem[] {
  const clean = (text || '').trim();
  if (!clean) return queue;
  const item: OfflineCommandItem = {
    id: `off_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    text: clean,
    target,
    createdAt: new Date().toISOString(),
  };
  return [item, ...queue].slice(0, 30);
}

export function validatePairingCode(code: string): boolean {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test((code || '').trim().toUpperCase());
}

/**
 * Gera script Node.js leve e pronto para rodar em segundo plano no PC/Notebook
 * como ponte do Desktop Companion (telemetria real + Ollama local + fila remota).
 */
export function generateCompanionBridgeScript(params: {
  serverUrl: string;
  pairingCode: string;
  deviceName: string;
}): string {
  const safeUrl = (params.serverUrl || 'http://localhost:3000').replace(/\/+$/, '');
  const safeCode = (params.pairingCode || 'JRVS-2026').trim();
  const safeName = (params.deviceName || 'Notebook Principal').replace(/"/g, "'");

  return `#!/usr/bin/env node
/**
 * JARVIS Desktop Companion — Agente de Segundo Plano (PC <-> Celular PWA)
 * Uso: node jarvis-companion.mjs
 * Requisitos: Node.js 18+ (zero dependências externas)
 */
import os from 'node:os';

const HUB_URL = process.env.JARVIS_HUB_URL || '${safeUrl}';
const PAIRING_CODE = process.env.JARVIS_PAIRING_CODE || '${safeCode}';
const DEVICE_NAME = process.env.JARVIS_DEVICE_NAME || '${safeName}';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const INTERVAL_MS = 15000;

async function checkOllama() {
  try {
    const res = await fetch(\`\${OLLAMA_URL}/api/tags\`, { signal: AbortSignal.timeout(1800) });
    if (!res.ok) return { online: false, models: [] };
    const data = await res.json();
    return { online: true, models: (data.models || []).map((m) => m.name) };
  } catch {
    return { online: false, models: [] };
  }
}

async function sendHeartbeat() {
  const totalMemGb = +(os.totalmem() / 1024 ** 3).toFixed(1);
  const freeMemGb = +(os.freemem() / 1024 ** 3).toFixed(1);
  const ramPercent = Math.round(((totalMemGb - freeMemGb) / Math.max(1, totalMemGb)) * 100);
  const load1m = os.loadavg()[0] || 0;
  const cpuPercent = Math.min(100, Math.round((load1m / Math.max(1, os.cpus().length)) * 100));
  const ollama = await checkOllama();

  const payload = {
    pairing_code: PAIRING_CODE,
    device_name: DEVICE_NAME,
    platform: \`\${os.platform()} (\${os.arch()})\`,
    cpu_percent: cpuPercent,
    ram_percent: ramPercent,
    ram_total_gb: totalMemGb,
    ollama_online: ollama.online,
    ollama_models: ollama.models.slice(0, 8),
  };

  try {
    const res = await fetch(\`\${HUB_URL}/api/v1/companion/heartbeat\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const out = await res.json();
    console.log(\`[JARVIS Companion] Heartbeat enviado (\${res.status}) · CPU \${cpuPercent}% · RAM \${ramPercent}% · Ollama: \${ollama.online ? 'ON' : 'OFF'}\`, out.pending_commands ? \`· \${out.pending_commands} comando(s) na fila\` : '');
  } catch (err) {
    console.error('[JARVIS Companion] Falha de conexão com o Hub:', err.message);
  }
}

console.log(\`JARVIS Desktop Companion iniciado para "\${DEVICE_NAME}" -> \${HUB_URL}\`);
sendHeartbeat();
setInterval(sendHeartbeat, INTERVAL_MS);
`;
}
