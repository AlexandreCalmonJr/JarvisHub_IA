export type ThreatSeverity = 'critical' | 'high' | 'medium' | 'info';
export type PermissionMode = 'read_only' | 'ask_approval' | 'autonomous' | 'blocked';
export type PermissionAction =
  | 'read'
  | 'create'
  | 'modify_diff'
  | 'run_terminal'
  | 'network'
  | 'integrations';

export interface PiiFinding {
  kind: 'cpf' | 'cnpj' | 'api_key' | 'password' | 'credit_card' | 'email';
  label: string;
  masked: string;
}

export interface PiiScanResult {
  has_pii: boolean;
  redacted_text: string;
  findings: PiiFinding[];
}

export interface ThreatScanResult {
  safe: boolean;
  risk_score: number;
  severity: ThreatSeverity;
  category: 'clean' | 'phishing_link' | 'prompt_injection' | 'secret_exfiltration' | 'pii_leak' | 'suspicious_file';
  headline: string;
  explanation_pt: string;
  indicators: string[];
  recommended_playbook: 'none' | 'lock_vault' | 'quarantine_agent' | 'redact_and_clean';
  pii: PiiScanResult;
}

export interface AgentPermissionRule {
  agent_role: string;
  agent_name: string;
  proper_name: string;
  mode: PermissionMode;
  folder_scope: string;
  capabilities: Record<PermissionAction, boolean>;
  updated_at: string;
}

export interface PermissionDecision {
  allowed: boolean;
  requires_approval: boolean;
  reason: string;
}

const PROTECTED_SECRET_PATTERNS = [
  /(^|[\\/])\.env(\.|$)/i,
  /\.pem$|\.key$|id_rsa|secrets?\.json|credentials\.json|keystore/i,
  /senhas?\.txt|passwords?\./i,
];

export function isProtectedSecretPath(filePath: string): boolean {
  const clean = (filePath || '').trim();
  return PROTECTED_SECRET_PATTERNS.some((re) => re.test(clean));
}

export function scanAndRedactPii(input: string): PiiScanResult {
  let redacted = input || '';
  const findings: PiiFinding[] = [];

  // CPF (000.000.000-00)
  redacted = redacted.replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, (match) => {
    findings.push({ kind: 'cpf', label: 'CPF detectado', masked: `${match.slice(0, 3)}.***.***-${match.slice(-2)}` });
    return '[CPF REDIGIDO]';
  });

  // CNPJ (00.000.000/0001-00)
  redacted = redacted.replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, (match) => {
    findings.push({ kind: 'cnpj', label: 'CNPJ detectado', masked: `${match.slice(0, 2)}.***.***/****-${match.slice(-2)}` });
    return '[CNPJ REDIGIDO]';
  });

  // API keys / tokens (OpenAI, GitHub, Gemini, Figma, HF)
  redacted = redacted.replace(/\b(sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{12,}|AIza[0-9A-Za-z_-]{16,}|figd_[A-Za-z0-9_-]{12,}|hf_[A-Za-z0-9]{12,})\b/g, (match) => {
    findings.push({ kind: 'api_key', label: 'Chave de API / Token', masked: `${match.slice(0, 5)}••••${match.slice(-3)}` });
    return '[CHAVE_API REDIGIDA]';
  });

  // Inline password assignments (senha=..., password: ...)
  redacted = redacted.replace(/\b(senha|password|passwd|secret_key|token_acesso)\s*[:=]\s*["']?([^\s"',;]{4,})["']?/gi, (_m, key) => {
    findings.push({ kind: 'password', label: 'Senha em texto puro', masked: `${key}=••••••` });
    return `${key}=[SENHA REDIGIDA]`;
  });

  // Credit card (16 digits with spaces/dashes)
  redacted = redacted.replace(/\b(?:\d{4}[-\s]?){3}\d{4}\b/g, (match) => {
    const digits = match.replace(/\D/g, '');
    if (digits.length === 16) {
      findings.push({ kind: 'credit_card', label: 'Número de cartão', masked: `•••• •••• •••• ${digits.slice(-4)}` });
      return '[CARTÃO REDIGIDO]';
    }
    return match;
  });

  return {
    has_pii: findings.length > 0,
    redacted_text: redacted,
    findings,
  };
}

export function inspectThreatArtifact(rawInput: string, sourceName?: string): ThreatScanResult {
  const text = (rawInput || '').trim();
  const lower = text.toLowerCase();
  const pii = scanAndRedactPii(text);
  const indicators: string[] = [];
  let riskScore = 0;
  let category: ThreatScanResult['category'] = 'clean';

  // 1. Secret / .env exfiltration
  if (
    /(\.env|id_rsa|private\s*key|exfiltrar|enviar\s+senhas|roubar\s+chaves|read\s+\.env|cat\s+\.env)/i.test(text) ||
    (sourceName && isProtectedSecretPath(sourceName))
  ) {
    riskScore += 55;
    category = 'secret_exfiltration';
    indicators.push('Tentativa de acesso ou exfiltração de segredos (.env / chaves privadas)');
  }

  // 2. Prompt injection patterns
  if (
    /(ignore\s+(all\s+)?previous\s+instructions|desconsidere\s+(todas\s+as\s+)?instru[cç][oõ]es|system\s+prompt|aja\s+como\s+root|bypass\s+security|jailbreak|override\s+policy)/i.test(
      text
    )
  ) {
    riskScore += 50;
    if (category === 'clean') category = 'prompt_injection';
    indicators.push('Padrão clássico de Prompt Injection tentando burlar regras do assistente');
  }

  // 3. Suspicious phishing links & executables
  const urlMatches = text.match(/https?:\/\/[^\s"'<>]+/gi) || [];
  for (const url of urlMatches) {
    const uLower = url.toLowerCase();
    if (/https?:\/\/\d{1,3}(?:\.\d{1,3}){3}/.test(uLower)) {
      riskScore += 45;
      category = 'phishing_link';
      indicators.push(`Link direto para endereço IP suspeito: ${url.slice(0, 48)}`);
    }
    if (/(pix|banco|receita|correios|gov-br|atualizar-cadastro|premio|resgatar|login-urgente|verify-account|bit\.ly|tinyurl)/i.test(uLower)) {
      riskScore += 40;
      if (category === 'clean') category = 'phishing_link';
      indicators.push(`URL com sinais de phishing ou golpe financeiro: ${url.slice(0, 54)}`);
    }
    if (/\.(exe|scr|bat|cmd|ps1|vbs|apk)(\?|$)/i.test(uLower)) {
      riskScore += 50;
      category = 'suspicious_file';
      indicators.push(`Link para executável de alto risco: ${url.slice(0, 54)}`);
    }
  }

  // 4. Urgent scam social engineering language
  if (/(conta\s+ser[aá]\s+bloqueada|clique\s+imediatamente|transfira\s+via\s+pix|c[oó]digo\s+do\s+whatsapp|boleto\s+atualizado\s+urgente)/i.test(lower)) {
    riskScore += 30;
    if (category === 'clean') category = 'phishing_link';
    indicators.push('Linguagem de urgência típica de engenharia social / golpe');
  }

  // 5. PII exposure
  if (pii.has_pii) {
    riskScore += Math.min(35, pii.findings.length * 18);
    if (category === 'clean') category = 'pii_leak';
    indicators.push(
      `Escudo PII interceptou ${pii.findings.length} dado(s) sensível(is): ${pii.findings.map((f) => f.label).join(', ')}`
    );
  }

  const cappedScore = Math.min(100, riskScore);
  const severity: ThreatSeverity =
    cappedScore >= 75 ? 'critical' : cappedScore >= 45 ? 'high' : cappedScore >= 20 ? 'medium' : 'info';

  if (cappedScore < 20) {
    return {
      safe: true,
      risk_score: cappedScore,
      severity: 'info',
      category: 'clean',
      headline: 'Nenhum risco relevante detectado',
      explanation_pt:
        'A Kira (Agente Sentinela) inspecionou o conteúdo e não encontrou sinais de golpe, prompt injection, acesso a segredos ou vazamento de dados pessoais.',
      indicators: ['Verificação concluída sem anomalias'],
      recommended_playbook: 'none',
      pii,
    };
  }

  const recommendedPlaybook: ThreatScanResult['recommended_playbook'] =
    category === 'secret_exfiltration' || severity === 'critical'
      ? 'lock_vault'
      : category === 'prompt_injection'
        ? 'quarantine_agent'
        : 'redact_and_clean';

  const explanationMap: Record<ThreatScanResult['category'], string> = {
    secret_exfiltration:
      'Detectamos tentativa de leitura ou vazamento de arquivos secretos (.env, tokens ou senhas). Recomenda-se manter o Vault Lock ativado e bloquear a execução.',
    prompt_injection:
      'Este documento ou mensagem contém comandos ocultos tentando enganar os agentes de IA para ignorar suas regras de segurança. Não execute ações automáticas a partir dele.',
    phishing_link:
      'Este link ou mensagem apresenta fortes sinais de golpe/phishing (urgência artificial, domínio suspeito ou isca financeira). Evite clicar ou informar dados.',
    suspicious_file:
      'O conteúdo aponta para um arquivo executável potencialmente malicioso. Mantenha em quarentena e não abra no computador.',
    pii_leak:
      'Foram identificados dados pessoais sensíveis (CPF, senhas ou chaves). O Escudo PII redigiu automaticamente as informações antes de qualquer envio para nuvem.',
    clean: 'Conteúdo limpo.',
  };

  return {
    safe: false,
    risk_score: cappedScore,
    severity,
    category,
    headline:
      severity === 'critical'
        ? 'Ameaça Crítica Interceptada pela Sentinela'
        : severity === 'high'
          ? 'Risco Alto Detectado — Ação Bloqueada'
          : 'Atenção: Dados Sensíveis ou Sinal de Risco',
    explanation_pt: explanationMap[category],
    indicators,
    recommended_playbook: recommendedPlaybook,
    pii,
  };
}

export function evaluateAgentFolderPermission(input: {
  rule: AgentPermissionRule;
  action: PermissionAction;
  filePath: string;
  vaultLocked: boolean;
  killSwitchActive?: boolean;
}): PermissionDecision {
  const { rule, action, filePath, vaultLocked, killSwitchActive } = input;

  if (killSwitchActive) {
    return {
      allowed: false,
      requires_approval: false,
      reason: 'Kill Switch Global ativo: todas as operações de escrita e execução estão em quarentena.',
    };
  }

  if (isProtectedSecretPath(filePath)) {
    if (vaultLocked || rule.mode !== 'autonomous') {
      return {
        allowed: false,
        requires_approval: true,
        reason: `Acesso bloqueado pelo Vault Lock: "${filePath}" é um recurso protegido de credenciais/segredos.`,
      };
    }
  }

  if (rule.mode === 'blocked') {
    return {
      allowed: false,
      requires_approval: false,
      reason: `O agente ${rule.proper_name} está explicitamente bloqueado na Matriz de Permissões.`,
    };
  }

  if (!rule.capabilities[action]) {
    return {
      allowed: false,
      requires_approval: false,
      reason: `Permissão "${action}" desabilitada para ${rule.proper_name} no escopo ${rule.folder_scope}.`,
    };
  }

  if (rule.mode === 'read_only' && action !== 'read') {
    return {
      allowed: false,
      requires_approval: true,
      reason: `${rule.proper_name} opera em modo Somente Leitura (Plano); alteração exige elevação ou aprovação.`,
    };
  }

  if (rule.mode === 'ask_approval' && action !== 'read') {
    return {
      allowed: true,
      requires_approval: true,
      reason: `Permitido mediante aprovação visual (Diff + Checkpoint) antes da aplicação.`,
    };
  }

  return {
    allowed: true,
    requires_approval: false,
    reason: `Operação "${action}" autorizada para ${rule.proper_name} no escopo ${rule.folder_scope}.`,
  };
}

export function buildSimpleUnifiedDiff(filePath: string, beforeText: string, afterText: string): string {
  const beforeLines = (beforeText || '').split('\n');
  const afterLines = (afterText || '').split('\n');
  const maxLen = Math.max(beforeLines.length, afterLines.length);
  const out: string[] = [
    `diff --git a/${filePath} b/${filePath}`,
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -1,${beforeLines.length} +1,${afterLines.length} @@`,
  ];

  for (let i = 0; i < maxLen; i += 1) {
    const b = beforeLines[i];
    const a = afterLines[i];
    if (b === a && b !== undefined) {
      out.push(` ${b}`);
    } else {
      if (b !== undefined) out.push(`-${b}`);
      if (a !== undefined) out.push(`+${a}`);
    }
  }
  return out.join('\n');
}
