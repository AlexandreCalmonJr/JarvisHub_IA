export type VramFitTier = 'gpu_smooth' | 'cpu_ok' | 'recommend_online';
export type ExecutionPolicy = 'auto_hybrid' | 'local_only' | 'online_only';

export interface NotebookHardwareProfile {
  id: string;
  label: string;
  owner: string;
  cpu: string;
  ram_gb: number;
  gpu_name: string;
  vram_gb: number;
  ollama_url: string;
  is_active: boolean;
}

export interface ProviderConnectivity {
  ollama_connected: boolean;
  huggingface_connected: boolean;
  gemini_connected: boolean;
}

export interface VramFitEvaluation {
  tier: VramFitTier;
  label: string;
  reason: string;
}

export interface AgentRecommendationInput {
  role: string;
  name: string;
  proper_name?: string;
  category?: string;
}

export interface AgentHardwareRecommendation {
  agent_role: string;
  agent_name: string;
  proper_name: string;
  recommended_model: string;
  execution_mode: 'LOCAL' | 'ONLINE';
  provider: 'ollama' | 'gemini';
  fit_tier: VramFitTier;
  fit_label: string;
  reason: string;
  required_vram_gb: number;
}

export const DEFAULT_HARDWARE_PROFILES: NotebookHardwareProfile[] = [
  {
    id: 'nb-engenharia',
    label: 'Notebook Principal (Engenharia)',
    owner: 'Administrador',
    cpu: 'Intel Core i7 / Ryzen 7 (16 threads)',
    ram_gb: 32,
    gpu_name: 'NVIDIA RTX 4060 Laptop',
    vram_gb: 8,
    ollama_url: 'http://127.0.0.1:11434',
    is_active: true,
  },
  {
    id: 'nb-pessoal',
    label: 'Notebook Pessoal & Estudos (Casa)',
    owner: 'Perfil Pessoal',
    cpu: 'Intel Core i5 / Apple M2 (8 núcleos)',
    ram_gb: 16,
    gpu_name: 'GPU Integrada (Compartilhada)',
    vram_gb: 2,
    ollama_url: 'http://192.168.1.24:11434',
    is_active: false,
  },
];

export function estimateVramGbFromModelName(modelId: string): number {
  const lower = (modelId || '').toLowerCase();
  const match = lower.match(/(\d+(?:\.\d+)?)\s*b\b/);
  if (match) {
    const billions = Number(match[1]);
    if (billions <= 2) return 1.6;
    if (billions <= 4) return 2.8;
    if (billions <= 9) return 5.4;
    if (billions <= 16) return 9.6;
    if (billions <= 34) return 20.0;
    return 40.0;
  }
  if (lower.includes('mini') || lower.includes('tiny') || lower.includes('small')) return 2.4;
  if (lower.includes('large') || lower.includes('70b')) return 38.0;
  return 5.4;
}

export function evaluateVramFit(
  requiredVramGb: number,
  hardware: NotebookHardwareProfile
): VramFitEvaluation {
  const vram = Math.max(0, Number(hardware.vram_gb) || 0);
  const ram = Math.max(4, Number(hardware.ram_gb) || 8);

  if (vram >= requiredVramGb + 0.8) {
    return {
      tier: 'gpu_smooth',
      label: 'Roda Liso em GPU',
      reason: `Sua ${hardware.gpu_name} (${vram} GB VRAM) comporta os ${requiredVramGb.toFixed(1)} GB estimados com folga.`,
    };
  }

  if (ram >= requiredVramGb * 2.2) {
    return {
      tier: 'cpu_ok',
      label: 'Roda em CPU / RAM',
      reason: `Excede a VRAM dedicada (${vram} GB), mas roda em ${ram} GB de RAM com velocidade moderada.`,
    };
  }

  return {
    tier: 'recommend_online',
    label: 'Recomendar Online',
    reason: `Requer ~${requiredVramGb.toFixed(1)} GB VRAM; excede ${hardware.gpu_name} (${vram} GB) e RAM livre. Use Gemini Online.`,
  };
}

function classifyRoleDomain(role: string, category?: string): 'security' | 'design' | 'research' | 'coding' | 'study' | 'orchestration' {
  const text = `${role} ${category || ''}`.toLowerCase();
  if (text.includes('security') || text.includes('sentinel') || text.includes('cyber') || text.includes('audit') || text.includes('privacy')) {
    return 'security';
  }
  if (
    text.includes('design') ||
    text.includes('ux') ||
    text.includes('image') ||
    text.includes('slide') ||
    text.includes('pptx') ||
    text.includes('presentation') ||
    text.includes('creative')
  ) {
    return 'design';
  }
  if (text.includes('research') || text.includes('web') || text.includes('business') || text.includes('finance')) {
    return 'research';
  }
  if (text.includes('english') || text.includes('math') || text.includes('study') || text.includes('pdf') || text.includes('doc')) {
    return 'study';
  }
  if (text.includes('master') || text.includes('flow') || text.includes('manager')) {
    return 'orchestration';
  }
  return 'coding';
}

export function computeAgentRecommendations(
  hardware: NotebookHardwareProfile,
  providers: ProviderConnectivity,
  installedLocalModels: string[],
  agents: AgentRecommendationInput[]
): AgentHardwareRecommendation[] {
  const vram = Math.max(0, Number(hardware.vram_gb) || 0);
  const ram = Math.max(4, Number(hardware.ram_gb) || 8);
  const canUseLocal = providers.ollama_connected;
  const canUseOnline = providers.gemini_connected;
  const hfConnected = providers.huggingface_connected;

  const hasInstalled = (prefix: string) =>
    installedLocalModels.some((m) => m.toLowerCase().includes(prefix.toLowerCase()));

  const pickBestLocalModel = (domain: 'security' | 'coding' | 'general'): { model: string; vramReq: number } => {
    if (domain === 'coding') {
      if (vram >= 11 && (hfConnected || hasInstalled('qwen2.5-coder:14b'))) {
        return { model: 'qwen2.5-coder:14b', vramReq: 9.2 };
      }
      if (vram >= 6 || ram >= 16) {
        return { model: 'qwen2.5-coder:7b', vramReq: 4.9 };
      }
      return { model: 'qwen2.5-coder:3b', vramReq: 2.3 };
    }
    if (domain === 'security') {
      if (vram >= 6 || ram >= 16) {
        return { model: 'llama3.1:8b', vramReq: 4.8 };
      }
      return { model: 'llama3.2:3b', vramReq: 2.2 };
    }
    if (vram >= 10 && hfConnected) {
      return { model: 'deepseek-r1:14b', vramReq: 9.0 };
    }
    if (vram >= 6) {
      return { model: 'qwen2.5:7b', vramReq: 4.9 };
    }
    return { model: 'llama3.2:3b', vramReq: 2.2 };
  };

  return agents.map((agent) => {
    const domain = classifyRoleDomain(agent.role, agent.category);
    const properName = agent.proper_name || agent.name;

    // Security agents strongly prefer local execution for privacy whenever Ollama is connected and hardware supports it
    if (domain === 'security') {
      if (canUseLocal) {
        const localPick = pickBestLocalModel('security');
        const fit = evaluateVramFit(localPick.vramReq, hardware);
        const hfNote = hfConnected
          ? 'Catálogo Hugging Face ativo para modelos locais de auditoria.'
          : 'Hugging Face desconectado — usando modelo local já compatível com sua GPU/RAM para manter dados sigilosos 100% no computador.';
        return {
          agent_role: agent.role,
          agent_name: agent.name,
          proper_name: properName,
          recommended_model: localPick.model,
          execution_mode: 'LOCAL',
          provider: 'ollama',
          fit_tier: fit.tier,
          fit_label: fit.label,
          reason: `${hfNote} ${fit.reason}`,
          required_vram_gb: localPick.vramReq,
        };
      }
      return {
        agent_role: agent.role,
        agent_name: agent.name,
        proper_name: properName,
        recommended_model: 'gemini-4-hydrogen',
        execution_mode: 'ONLINE',
        provider: 'gemini',
        fit_tier: 'recommend_online',
        fit_label: 'Online (Ollama desconectado)',
        reason: 'Ollama local desconectado. Gemini Online assume com revisão de segurança até o nó local voltar.',
        required_vram_gb: 0,
      };
    }

    // Design & Web Research excel on Gemini Online (multimodal + live Google Search grounding)
    if ((domain === 'design' || domain === 'research') && canUseOnline) {
      const reason =
        domain === 'design'
          ? hfConnected
            ? 'Gemini Online oferece maior criatividade visual, layout e geração multimodal sem sobrecarregar sua GPU.'
            : 'Hugging Face desconectado: Gemini Online é o melhor motor para design visual, slides e criação multimodal sem consumir VRAM local.'
          : 'Gemini Online integra Pesquisa Web em tempo real com fontes verificáveis e baixa latência.';
      return {
        agent_role: agent.role,
        agent_name: agent.name,
        proper_name: properName,
        recommended_model: 'gemini-4-hydrogen',
        execution_mode: 'ONLINE',
        provider: 'gemini',
        fit_tier: 'recommend_online',
        fit_label: 'Ideal Online (Nuvem)',
        reason,
        required_vram_gb: 0,
      };
    }

    // Coding & Engineering: prefer local GPU when smooth, otherwise hybrid Gemini Online
    if (domain === 'coding') {
      if (canUseLocal) {
        const localPick = pickBestLocalModel('coding');
        const fit = evaluateVramFit(localPick.vramReq, hardware);
        if (fit.tier === 'gpu_smooth' || !canUseOnline) {
          return {
            agent_role: agent.role,
            agent_name: agent.name,
            proper_name: properName,
            recommended_model: localPick.model,
            execution_mode: 'LOCAL',
            provider: 'ollama',
            fit_tier: fit.tier,
            fit_label: fit.label,
            reason: `Código privado processado localmente em ${hardware.gpu_name} (${vram} GB VRAM). ${fit.reason}`,
            required_vram_gb: localPick.vramReq,
          };
        }
      }
      if (canUseOnline) {
        return {
          agent_role: agent.role,
          agent_name: agent.name,
          proper_name: properName,
          recommended_model: 'gemini-4-hydrogen',
          execution_mode: 'ONLINE',
          provider: 'gemini',
          fit_tier: 'recommend_online',
          fit_label: 'Recomendar Online',
          reason: `Sua GPU atual (${vram} GB VRAM) limitaria modelos 14B de código; Gemini Online entrega respostas rápidas e contexto amplo.`,
          required_vram_gb: 0,
        };
      }
    }

    // Study, Languages, Math, Orchestration: Gemini Online if available (great PT-BR + reasoning), else best local fit
    if (canUseOnline && (!canUseLocal || vram < 8 || domain === 'study' || domain === 'orchestration')) {
      return {
        agent_role: agent.role,
        agent_name: agent.name,
        proper_name: properName,
        recommended_model: 'gemini-4-hydrogen',
        execution_mode: 'ONLINE',
        provider: 'gemini',
        fit_tier: 'recommend_online',
        fit_label: 'Ideal Online (Nuvem)',
        reason:
          domain === 'study'
            ? 'Excelente didática em português, explicações passo a passo e pesquisa de referências atualizadas.'
            : 'Orquestração rápida com raciocínio estruturado e zero consumo de bateria/VRAM do notebook.',
        required_vram_gb: 0,
      };
    }

    const fallbackLocal = pickBestLocalModel('general');
    const fit = evaluateVramFit(fallbackLocal.vramReq, hardware);
    return {
      agent_role: agent.role,
      agent_name: agent.name,
      proper_name: properName,
      recommended_model: fallbackLocal.model,
      execution_mode: 'LOCAL',
      provider: 'ollama',
      fit_tier: fit.tier,
      fit_label: fit.label,
      reason: fit.reason,
      required_vram_gb: fallbackLocal.vramReq,
    };
  });
}
