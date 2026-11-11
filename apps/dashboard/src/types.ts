export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'offline';
  components: {
    security_core: string;
    approval_engine: string;
    model_runtime: string;
    inference_queue: {
      active: number;
      waiting: number;
    };
    kill_switch: {
      global_killed: boolean;
    };
  };
}

export interface ApprovalRequestItem {
  id: string;
  task_id: string;
  agent_role: string;
  operation: string;
  impact_summary: string;
  affected_resources: string[];
  proposed_diff?: string;
  reversible: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'revoked';
  requested_at: string;
}

export interface TaskStateResponse {
  task_id: string;
  session_id: string;
  user_prompt: string;
  project_id?: string;
  classified_intent?: string;
  plan_steps: string[];
  selected_agents: string[];
  policy_verified: boolean;
  policy_violations: string[];
  approval_required: boolean;
  approval_id?: string;
  agent_outputs?: any[];
  final_summary?: string;
  is_completed: boolean;
  error?: string | null;
}

export interface AgentInfo {
  role: string;
  name: string;
  mission: string;
  preferred_model: string;
  is_read_only: boolean;
  allowed_tools: string[];
  system_prompt?: string;
  assigned_key_id?: string;
}

export interface AgentMemoryItem {
  id: string;
  agent_role: string;
  category: string;
  key: string;
  content: string;
  context?: string;
  importance: number;
  created_at: string;
  updated_at: string;
}

export interface SkillInfo {
  id: string;
  name: string;
  version: string;
  origin: string;
  license: string;
  description: string;
  domain: string;
  allowed_tools: string[];
  required_permissions: string[];
  assigned_agents: string[];
  content_hash: string;
  is_approved: boolean;
  is_revoked: boolean;
  instructions: string;
  templates?: Record<string, string>;
  created_at?: string;
  updated_at?: string;
}

export const AGENT_ROLE_LABELS: Record<string, string> = {
  jarvis_master: 'JARVIS Maestro',
  software_architect: 'Arquiteto de Software',
  project_manager: 'Gerente de Projetos',
  research_analyst: 'Analista de Pesquisa Técnica',
  project_designer_planner: 'Designer & Planejador de Projetos',
  ux_ui_designer: 'Designer de UX/UI',
  frontend_mobile_developer: 'Desenvolvedor Frontend & Mobile',
  backend_developer: 'Desenvolvedor Backend (APIs)',
  qa_engineer: 'Engenheiro de QA & Testes',
  code_reviewer: 'Revisor de Código Sênior',
  data_scientist: 'Cientista de Dados',
  business_intelligence: 'Business Intelligence (BI)',
  data_engineering_intelligence: 'Engenheiro de Inteligência de Dados',
  data_engineer_pipelines: 'Engenheiro de Pipelines & ETL',
  devops_engineer: 'Engenheiro DevOps & CI/CD',
  network_infrastructure_engineer: 'Engenheiro de Redes & Infra',
  cybersecurity_engineer: 'Engenheiro de Cibersegurança',
  automation_engineer: 'Engenheiro de Automação',
  threat_modeling_security_architect: 'Arquiteto de Modelagem de Ameaças',
  secure_code_auditor: 'Auditor de Código Seguro',
  api_security_specialist: 'Especialista em Segurança de APIs',
  identity_access_management: 'Gestão de Identidade e Acesso (IAM)',
  software_supply_chain_security: 'Segurança da Cadeia de Suprimentos',
  soc_incident_response: 'Resposta a Incidentes SOC',
  ai_security_red_team: 'Red Team de Segurança de IA',
  privacy_data_protection: 'Privacidade & Proteção de Dados',
};

export interface ChatSessionItem {
  session_id: string;
  title: string;
  first_prompt?: string;
  task_count: number;
  last_activity: string;
  first_intent?: string;
}

export interface ChatMessage {
  sender: 'user' | 'jarvis';
  text: string;
  taskData?: TaskStateResponse;
  timestamp: string;
  statusMessage?: string;
}

export const getAgentLabel = (role: string): string => {
  if (!role) return 'Especialista';
  const clean = role.toLowerCase().trim();
  if (AGENT_ROLE_LABELS[clean]) return AGENT_ROLE_LABELS[clean];
  return clean
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());
};

export interface ToolDescriptor {
  id: string;
  label: string;
  description: string;
  category: 'filesystem' | 'execution' | 'analysis' | 'security' | 'multiagent' | 'git';
}

export const TOOL_DESCRIPTORS: Record<string, ToolDescriptor> = {
  read_file: {
    id: 'read_file',
    label: 'Leitura de Arquivo',
    description: 'Leitura segura de arquivos locais dentro do workspace autorizado',
    category: 'filesystem',
  },
  list_directory: {
    id: 'list_directory',
    label: 'Exploração de Pastas',
    description: 'Listagem e navegação de arquivos e diretórios da aplicação',
    category: 'filesystem',
  },
  run_tests: {
    id: 'run_tests',
    label: 'Execução de Testes',
    description: 'Execução isolada de suites de testes automatizados (pytest, flutter test, etc.)',
    category: 'execution',
  },
  run_linter: {
    id: 'run_linter',
    label: 'Análise de Código (Linter)',
    description: 'Validação de estilo, tipagem e padrões de código estáticos',
    category: 'analysis',
  },
  propose_patch: {
    id: 'propose_patch',
    label: 'Proposta de Código / Patch',
    description: 'Criação e edição segura de código com controle de diff e aprovação',
    category: 'filesystem',
  },
  scan_secrets: {
    id: 'scan_secrets',
    label: 'Varredura de Segredos',
    description: 'Detecção preventiva de chaves, tokens e senhas no código fonte',
    category: 'security',
  },
  inspect_diff: {
    id: 'inspect_diff',
    label: 'Inspeção de Diffs',
    description: 'Análise detalhada de alterações de código linha por linha',
    category: 'analysis',
  },
  inspect_manifest: {
    id: 'inspect_manifest',
    label: 'Inspeção de Manifestos',
    description: 'Análise de dependências e manifestos de pacotes (package.json, pubspec, pyproject)',
    category: 'analysis',
  },
  inspect_dataset: {
    id: 'inspect_dataset',
    label: 'Inspeção de Dados / Schema',
    description: 'Análise exploratória de datasets, esquemas de tabelas e metadados',
    category: 'analysis',
  },
  validate_data: {
    id: 'validate_data',
    label: 'Validação de Dados',
    description: 'Verificação de integridade, anomalias e conformidade de dados',
    category: 'analysis',
  },
  delegate_agent: {
    id: 'delegate_agent',
    label: 'Delegação Multi-Agente',
    description: 'Handoff de tarefas especializadas para agentes secundários',
    category: 'multiagent',
  },
  request_approval: {
    id: 'request_approval',
    label: 'Solicitação de Aprovação',
    description: 'Encaminhamento de ações de alto impacto ao Approval Center com Kill Switch',
    category: 'security',
  },
  query_audit: {
    id: 'query_audit',
    label: 'Consulta de Auditoria',
    description: 'Acesso ao registro imutável de eventos e ações de segurança',
    category: 'security',
  },
  search_code: {
    id: 'search_code',
    label: 'Busca em Código',
    description: 'Pesquisa semântica e por regex em arquivos do projeto',
    category: 'filesystem',
  },
  git_status: {
    id: 'git_status',
    label: 'Status do Git',
    description: 'Inspeção do estado atual do repositório Git local',
    category: 'git',
  },
  git_diff: {
    id: 'git_diff',
    label: 'Diffs do Git',
    description: 'Visualização de alterações pendentes ou commits no repositório',
    category: 'git',
  },
};

export const getToolLabel = (tool: string): string => {
  if (!tool) return 'Ferramenta';
  const clean = tool.toLowerCase().trim();
  if (TOOL_DESCRIPTORS[clean]) {
    return TOOL_DESCRIPTORS[clean].label;
  }
  return clean
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());
};

export const getToolDescription = (tool: string): string => {
  const clean = (tool || '').toLowerCase().trim();
  return TOOL_DESCRIPTORS[clean]?.description || 'Ferramenta do ecossistema sandbox';
};

export const formatFriendlyText = (text: string): string => {
  if (!text) return '';
  const clean = text.trim().replace(/^['"`]+|['"`]+$/g, '');
  if (clean.startsWith('sess_')) {
    return 'Conversa Ativa';
  }
  const lower = clean.toLowerCase();
  if (TOOL_DESCRIPTORS[lower]) {
    return TOOL_DESCRIPTORS[lower].label;
  }
  if (AGENT_ROLE_LABELS[lower]) {
    return AGENT_ROLE_LABELS[lower];
  }
  if (/^[a-z0-9]+(_[a-z0-9]+)+$/i.test(clean)) {
    return clean
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());
  }
  return text;
};

export const sanitizeUserFacingText = (text: string): string => {
  if (!text) return '';
  let res = text;
  // Substitui ferramentas citadas com aspas ou crases ('read_file', `read_file`, etc.)
  Object.keys(TOOL_DESCRIPTORS).forEach((toolKey) => {
    const label = TOOL_DESCRIPTORS[toolKey].label;
    const regex = new RegExp(`['"\`]${toolKey}['"\`]`, 'gi');
    res = res.replace(regex, `"${label}"`);
  });
  // Substitui sessões técnicas
  res = res.replace(/\bsess_[a-zA-Z0-9_-]+\b/g, 'Sessão Ativa');
  return res;
};




