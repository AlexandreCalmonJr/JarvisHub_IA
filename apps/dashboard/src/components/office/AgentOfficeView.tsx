import React, { useState, useEffect } from 'react';
import {
  Bot,
  Code2,
  X,
  RefreshCw,
  Key,
} from 'lucide-react';
import { fetchAgents, updateAgentConfig, fetchKeyVault, KeyVaultItem } from '../../api';
import { notify } from '../common/Toast';
import { AgentOfficeCanvas } from './AgentOfficeCanvas';

export interface OfficeAgent {
  id: string;
  name: string;
  role: string;
  department: 'command' | 'dev' | 'design' | 'infra' | 'data' | 'security';
  departmentName: string;
  mission: string;
  tools: string[];
  isReadOnly: boolean;
  status: 'idle' | 'thinking' | 'coding' | 'meeting';
  preferredModel: string;
  assignedKeyId?: string;
  color: string;
}

const DEPARTMENTS = [
  { id: 'command', name: 'Comando Central & Orquestrador', color: '#eab308', bg: 'rgba(234, 179, 8, 0.08)', border: 'rgba(234, 179, 8, 0.25)' },
  { id: 'dev', name: 'Engenharia de Software', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.08)', border: 'rgba(99, 102, 241, 0.25)' },
  { id: 'design', name: 'Design, UX & Produto', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.08)', border: 'rgba(236, 72, 153, 0.25)' },
  { id: 'infra', name: 'DevOps & Automação', color: '#f97316', bg: 'rgba(249, 115, 22, 0.08)', border: 'rgba(249, 115, 22, 0.25)' },
  { id: 'data', name: 'Dados & Inteligência', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.08)', border: 'rgba(6, 182, 212, 0.25)' },
  { id: 'security', name: 'Cybersecurity Shield', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.25)' },
];

const INITIAL_OFFICE_AGENTS: OfficeAgent[] = [
  // 1. Comando Central
  {
    id: 'jarvis_master',
    name: 'JARVIS Maestro',
    role: 'Orquestrador Geral dos 26 Agentes',
    department: 'command',
    departmentName: 'Comando Central',
    mission: 'Decompor requisitos complexos, convocar especialistas e sintetizar respostas.',
    tools: ['delegate_task', 'run_command', 'write_file', 'read_file'],
    isReadOnly: false,
    status: 'idle',
    preferredModel: 'auto_hybrid',
    color: '#eab308',
  },
  {
    id: 'project_manager',
    name: 'Gerente de Projetos',
    role: 'Gestão de Backlog & Sprints',
    department: 'command',
    departmentName: 'Comando Central',
    mission: 'Organizar entregas, quebrar épicos em sprints e acompanhar prazos.',
    tools: ['read_file'],
    isReadOnly: true,
    status: 'idle',
    preferredModel: 'auto_hybrid',
    color: '#eab308',
  },
  {
    id: 'research_analyst',
    name: 'Analista de Pesquisa Técnica',
    role: 'Investigação Técnica & Documentação',
    department: 'command',
    departmentName: 'Comando Central',
    mission: 'Realizar pesquisas em documentações oficiais e auditar dependências.',
    tools: ['web_search', 'read_file'],
    isReadOnly: true,
    status: 'idle',
    preferredModel: 'auto_hybrid',
    color: '#eab308',
  },

  // 2. Engenharia de Software
  {
    id: 'software_architect',
    name: 'Arquiteto de Software',
    role: 'Arquitetura Clean & ADRs',
    department: 'dev',
    departmentName: 'Engenharia de Software',
    mission: 'Desenhar topologias modulares, diagramas de arquitetura e decisões técnicas.',
    tools: ['write_file', 'read_file'],
    isReadOnly: false,
    status: 'idle',
    preferredModel: 'auto_hybrid',
    color: '#6366f1',
  },
  {
    id: 'frontend_mobile_developer',
    name: 'Dev Frontend & Mobile',
    role: 'React, Vite, Tailwind & Mobile',
    department: 'dev',
    departmentName: 'Engenharia de Software',
    mission: 'Construir interfaces reativas e aplicações completas para web e dispositivos móveis.',
    tools: ['write_file', 'read_file', 'run_command'],
    isReadOnly: false,
    status: 'idle',
    preferredModel: 'auto_hybrid',
    color: '#6366f1',
  },
  {
    id: 'backend_developer',
    name: 'Dev Backend (APIs)',
    role: 'FastAPI, Node & Banco de Dados',
    department: 'dev',
    departmentName: 'Engenharia de Software',
    mission: 'Desenvolver endpoints REST, WebSocket, integrações com bancos e regras de negócio.',
    tools: ['write_file', 'read_file', 'run_command'],
    isReadOnly: false,
    status: 'idle',
    preferredModel: 'auto_hybrid',
    color: '#6366f1',
  },
  {
    id: 'code_reviewer',
    name: 'Revisor de Código Sênior',
    role: 'Auditoria de Qualidade & Clean Code',
    department: 'dev',
    departmentName: 'Engenharia de Software',
    mission: 'Identificar code smells, otimizar complexidade algorítmica e aprovar pull requests.',
    tools: ['read_file'],
    isReadOnly: true,
    status: 'idle',
    preferredModel: 'auto_hybrid',
    color: '#6366f1',
  },
  {
    id: 'qa_engineer',
    name: 'Engenheiro de QA & Testes',
    role: 'Testes Unitários & E2E',
    department: 'dev',
    departmentName: 'Engenharia de Software',
    mission: 'Desenvolver testes automatizados, garantir cobertura e prevenir regressões.',
    tools: ['write_file', 'read_file', 'run_command'],
    isReadOnly: false,
    status: 'idle',
    preferredModel: 'auto_hybrid',
    color: '#6366f1',
  },

  // 3. Design & Produto
  {
    id: 'project_designer_planner',
    name: 'Designer & Planejador',
    role: 'Design Estrutural & Escopo',
    department: 'design',
    departmentName: 'Design & Produto',
    mission: 'Elaborar wireframes mentais, jornadas do usuário e requisitos de interface.',
    tools: ['read_file'],
    isReadOnly: true,
    status: 'idle',
    preferredModel: 'auto_hybrid',
    color: '#ec4899',
  },
  {
    id: 'ux_ui_designer',
    name: 'Designer de UX/UI',
    role: 'Design Systems & Estética',
    department: 'design',
    departmentName: 'Design & Produto',
    mission: 'Criar layouts responsivos, paletas de cores harmônicas e micro-interações.',
    tools: ['write_file', 'read_file'],
    isReadOnly: false,
    status: 'idle',
    preferredModel: 'auto_hybrid',
    color: '#ec4899',
  },

  // 4. DevOps & Infraestrutura
  {
    id: 'devops_engineer',
    name: 'Engenheiro DevOps & CI/CD',
    role: 'Docker, Pipelines & Release',
    department: 'infra',
    departmentName: 'DevOps & Automação',
    mission: 'Automatizar builds, contêineres Docker, GitHub Actions e infra como código.',
    tools: ['write_file', 'read_file', 'run_command'],
    isReadOnly: false,
    status: 'idle',
    preferredModel: 'auto_hybrid',
    color: '#f97316',
  },
  {
    id: 'network_infrastructure_engineer',
    name: 'Engenheiro de Redes & Infra',
    role: 'Conectividade, DNS & Portas',
    department: 'infra',
    departmentName: 'DevOps & Automação',
    mission: 'Garantir comunicação segura em 127.0.0.1, portas locais e protocolos de rede.',
    tools: ['read_file'],
    isReadOnly: true,
    status: 'idle',
    preferredModel: 'auto_hybrid',
    color: '#f97316',
  },
  {
    id: 'automation_engineer',
    name: 'Engenheiro de Automação',
    role: 'Scripts & Automação de Tarefas',
    department: 'infra',
    departmentName: 'DevOps & Automação',
    mission: 'Criar scripts utilitários em Python/PowerShell para tarefas repetitivas.',
    tools: ['write_file', 'read_file', 'run_command'],
    isReadOnly: false,
    status: 'idle',
    preferredModel: 'auto_hybrid',
    color: '#f97316',
  },

  // 5. Dados & Inteligência
  {
    id: 'data_scientist',
    name: 'Cientista de Dados',
    role: 'Modelagem Estatística & ML',
    department: 'data',
    departmentName: 'Dados & Inteligência',
    mission: 'Analisar tendências de dados, criar previsões e otimizar vetores de busca.',
    tools: ['read_file'],
    isReadOnly: true,
    status: 'idle',
    preferredModel: 'auto_hybrid',
    color: '#06b6d4',
  },
  {
    id: 'business_intelligence',
    name: 'Business Intelligence (BI)',
    role: 'KPIs, Dashboards & Negócio',
    department: 'data',
    departmentName: 'Dados & Inteligência',
    mission: 'Construir métricas analíticas e painéis de indicadores de performance.',
    tools: ['read_file'],
    isReadOnly: true,
    status: 'idle',
    preferredModel: 'auto_hybrid',
    color: '#06b6d4',
  },
  {
    id: 'data_engineering_intelligence',
    name: 'Engenheiro de Dados',
    role: 'Estruturação & Modelagem SQL',
    department: 'data',
    departmentName: 'Dados & Inteligência',
    mission: 'Modelar tabelas SQLite, consultas otimizadas e índices para alta performance.',
    tools: ['write_file', 'read_file', 'run_command'],
    isReadOnly: false,
    status: 'idle',
    preferredModel: 'auto_hybrid',
    color: '#06b6d4',
  },
  {
    id: 'data_engineer_pipelines',
    name: 'Engenheiro de Pipelines',
    role: 'ETL, Ingestão & RAG',
    department: 'data',
    departmentName: 'Dados & Inteligência',
    mission: 'Construir fluxos de ingestão de arquivos para a Base de Conhecimento RAG.',
    tools: ['write_file', 'read_file', 'run_command'],
    isReadOnly: false,
    status: 'idle',
    preferredModel: 'auto_hybrid',
    color: '#06b6d4',
  },

  // 6. Cybersecurity Shield
  {
    id: 'cybersecurity_engineer',
    name: 'Engenheiro de Cibersegurança',
    role: 'Hardening & Cyber Shield',
    department: 'security',
    departmentName: 'Cybersecurity Shield',
    mission: 'Supervisionar a postura de segurança do hub e mitigar vulnerabilidades.',
    tools: ['write_file', 'read_file', 'run_command'],
    isReadOnly: false,
    status: 'idle',
    preferredModel: 'auto_hybrid',
    color: '#ef4444',
  },
  {
    id: 'threat_modeling_security_architect',
    name: 'Arquiteto de Ameaças',
    role: 'Modelagem STRIDE & Riscos',
    department: 'security',
    departmentName: 'Cybersecurity Shield',
    mission: 'Identificar vetores de ataque potenciais e elaborar defesas preventivas.',
    tools: ['read_file'],
    isReadOnly: true,
    status: 'idle',
    preferredModel: 'auto_hybrid',
    color: '#ef4444',
  },
  {
    id: 'secure_code_auditor',
    name: 'Auditor de Código Seguro',
    role: 'Auditoria SAST & OWASP',
    department: 'security',
    departmentName: 'Cybersecurity Shield',
    mission: 'Inspecionar código em busca de injeções de SQL, XSS e vazamentos de credenciais.',
    tools: ['read_file'],
    isReadOnly: true,
    status: 'idle',
    preferredModel: 'auto_hybrid',
    color: '#ef4444',
  },
  {
    id: 'api_security_specialist',
    name: 'Especialista em APIs OWASP',
    role: 'Segurança de Endpoints & Headers',
    department: 'security',
    departmentName: 'Cybersecurity Shield',
    mission: 'Auditar cabeçalhos de segurança, rate limiting e autenticação nas APIs REST.',
    tools: ['read_file'],
    isReadOnly: true,
    status: 'idle',
    preferredModel: 'auto_hybrid',
    color: '#ef4444',
  },
  {
    id: 'identity_access_management',
    name: 'Gestão de Identidade (IAM)',
    role: 'RBAC, Tokens & Permissões',
    department: 'security',
    departmentName: 'Cybersecurity Shield',
    mission: 'Gerenciar permissões de usuários e agentes no confinamento de 127.0.0.1.',
    tools: ['read_file'],
    isReadOnly: true,
    status: 'idle',
    preferredModel: 'auto_hybrid',
    color: '#ef4444',
  },
  {
    id: 'software_supply_chain_security',
    name: 'Segurança de Pacotes (SBOM)',
    role: 'Auditoria de Dependências & CVEs',
    department: 'security',
    departmentName: 'Cybersecurity Shield',
    mission: 'Garantir que bibliotecas Python e pacotes npm estejam livres de malwares conhecidos.',
    tools: ['read_file'],
    isReadOnly: true,
    status: 'idle',
    preferredModel: 'auto_hybrid',
    color: '#ef4444',
  },
  {
    id: 'soc_incident_response',
    name: 'Resposta a Incidentes SOC',
    role: 'Monitoramento & Kill Switch',
    department: 'security',
    departmentName: 'Cybersecurity Shield',
    mission: 'Analisar anomalias em tempo real e acionar o Kill Switch se necessário.',
    tools: ['read_file'],
    isReadOnly: true,
    status: 'idle',
    preferredModel: 'auto_hybrid',
    color: '#ef4444',
  },
  {
    id: 'ai_security_red_team',
    name: 'Red Team de Segurança de IA',
    role: 'Prompt Injection & Jailbreak Defense',
    department: 'security',
    departmentName: 'Cybersecurity Shield',
    mission: 'Testar e blindar os prompts dos agentes contra injeções adversárias.',
    tools: ['write_file', 'read_file', 'run_command'],
    isReadOnly: false,
    status: 'idle',
    preferredModel: 'auto_hybrid',
    color: '#ef4444',
  },
  {
    id: 'privacy_data_protection',
    name: 'Privacidade de Dados (LGPD)',
    role: 'Anonimização & Conformidade',
    department: 'security',
    departmentName: 'Cybersecurity Shield',
    mission: 'Verificar conformidade com a LGPD e impedir vazamento de dados sensíveis.',
    tools: ['read_file'],
    isReadOnly: true,
    status: 'idle',
    preferredModel: 'auto_hybrid',
    color: '#ef4444',
  },
];

interface AgentOfficeViewProps {
  onSelectForChat?: (agentId: string) => void;
}

export const AgentOfficeView: React.FC<AgentOfficeViewProps> = ({ onSelectForChat }) => {
  const [agents, setAgents] = useState<OfficeAgent[]>(INITIAL_OFFICE_AGENTS);
  const [selectedAgent, setSelectedAgent] = useState<OfficeAgent | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [vaultKeys, setVaultKeys] = useState<KeyVaultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [activeKeySelection, setActiveKeySelection] = useState<string>('');
  const [officeMode, setOfficeMode] = useState<'both' | 'canvas' | 'desks'>('both');

  const loadData = async () => {
    try {
      setLoading(true);
      const [configs, keys] = await Promise.all([
        fetchAgents().catch(() => []),
        fetchKeyVault().catch(() => []),
      ]);
      setVaultKeys(Array.isArray(keys) ? keys : []);

      if (Array.isArray(configs) && configs.length > 0) {
        setAgents((prev) =>
          prev.map((a) => {
            const remote = configs.find((c: any) => c.role === a.id || c.agent_id === a.id);
            if (remote) {
              return {
                ...a,
                preferredModel: remote.preferred_model || a.preferredModel,
                assignedKeyId: remote.assigned_key_id || a.assignedKeyId,
                isReadOnly: remote.is_read_only !== undefined ? remote.is_read_only : a.isReadOnly,
              };
            }
            return a;
          })
        );
      }
    } catch (err) {
      console.warn('Erro ao carregar configurações do escritório:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenDrawer = (agent: OfficeAgent) => {
    setSelectedAgent(agent);
    setActiveKeySelection(agent.assignedKeyId || '');
  };

  const handleSaveAgentKey = async () => {
    if (!selectedAgent) return;
    try {
      setSavingKey(true);
      await updateAgentConfig(selectedAgent.id, {
        preferred_model: selectedAgent.preferredModel,
        assigned_key_id: activeKeySelection || undefined,
        is_read_only: selectedAgent.isReadOnly,
      });

      setAgents((prev) =>
        prev.map((a) => (a.id === selectedAgent.id ? { ...a, assignedKeyId: activeKeySelection || undefined } : a))
      );
      setSelectedAgent((prev) => (prev ? { ...prev, assignedKeyId: activeKeySelection || undefined } : null));

      notify(`Chave atribuída com sucesso ao especialista ${selectedAgent.name}!`, 'success');
    } catch (err: any) {
      notify(`Erro ao vincular chave: ${err.message}`, 'error');
    } finally {
      setSavingKey(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '20px' }}>
      {/* Topo: Cabeçalho Clean & Filtros Rápidos */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            Escritório Virtual dos 26 Agentes
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Visão viva dos especialistas trabalhando nos 6 departamentos técnicos. Clique em uma mesa para configurar chave e modelo.
          </p>
        </div>

        {/* Filtros por Departamento */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setSelectedDepartment('all')}
            className="btn btn-ghost"
            style={{
              fontSize: '0.75rem',
              padding: '5px 10px',
              borderRadius: '6px',
              backgroundColor: selectedDepartment === 'all' ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
              color: selectedDepartment === 'all' ? 'var(--text-primary)' : 'var(--text-muted)',
              border: '1px solid var(--border-color)',
            }}
          >
            Todos (26)
          </button>
          {DEPARTMENTS.map((dept) => {
            const isSel = selectedDepartment === dept.id;
            return (
              <button
                key={dept.id}
                type="button"
                onClick={() => setSelectedDepartment(dept.id)}
                className="btn btn-ghost"
                style={{
                  fontSize: '0.75rem',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  backgroundColor: isSel ? dept.bg : 'transparent',
                  color: isSel ? dept.color : 'var(--text-secondary)',
                  border: isSel ? `1px solid ${dept.border}` : '1px solid transparent',
                  transition: 'all 0.15s ease',
                }}
              >
                {dept.name.split(' ')[0]} {dept.name.split(' ')[1] || ''}
              </button>
            );
          })}

          {/* Alternador de Modo de Visualização */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              borderRadius: '8px',
              padding: '2px',
              border: '1px solid var(--border-color)',
            }}
          >
            <button
              type="button"
              onClick={() => setOfficeMode('canvas')}
              className="btn btn-ghost"
              style={{
                fontSize: '0.72rem',
                padding: '4px 8px',
                borderRadius: '6px',
                backgroundColor: officeMode === 'canvas' ? 'rgba(234, 179, 8, 0.2)' : 'transparent',
                color: officeMode === 'canvas' ? '#eab308' : 'var(--text-muted)',
              }}
              title="Exibir apenas a Planta Baixa 2.5D com Avatares"
            >
              2.5D Avatares
            </button>
            <button
              type="button"
              onClick={() => setOfficeMode('both')}
              className="btn btn-ghost"
              style={{
                fontSize: '0.72rem',
                padding: '4px 8px',
                borderRadius: '6px',
                backgroundColor: officeMode === 'both' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                color: officeMode === 'both' ? '#818cf8' : 'var(--text-muted)',
              }}
              title="Exibir Andar 2.5D com Avatares e Grade de Mesas"
            >
              Completo
            </button>
            <button
              type="button"
              onClick={() => setOfficeMode('desks')}
              className="btn btn-ghost"
              style={{
                fontSize: '0.72rem',
                padding: '4px 8px',
                borderRadius: '6px',
                backgroundColor: officeMode === 'desks' ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                color: officeMode === 'desks' ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
              title="Exibir apenas a Grade de Mesas dos Departamentos"
            >
              Mesas
            </button>
          </div>

          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="btn btn-ghost"
            style={{ padding: '6px', color: 'var(--text-muted)' }}
            title="Atualizar status das mesas"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* 1. Andar 2.5D Animado com Avatares Andando pelo Escritório */}
      {(officeMode === 'canvas' || officeMode === 'both') && (
        <AgentOfficeCanvas
          agents={agents}
          onSelectAgent={handleOpenDrawer}
        />
      )}

      {/* 2. Grid Isométrico dos Departamentos */}
      {(officeMode === 'desks' || officeMode === 'both') && (
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '16px',
          paddingBottom: '24px',
        }}
      >
        {DEPARTMENTS.filter((d) => selectedDepartment === 'all' || selectedDepartment === d.id).map((dept) => {
          const deptAgents = agents.filter((a) => a.department === dept.id);
          return (
            <div
              key={dept.id}
              style={{
                borderRadius: '12px',
                backgroundColor: 'rgba(15, 23, 42, 0.55)',
                border: `1px solid ${dept.border}`,
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                backdropFilter: 'blur(8px)',
              }}
            >
              {/* Cabeçalho do Departamento */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: `1px solid ${dept.border}`,
                  paddingBottom: '8px',
                }}
              >
                <div style={{ fontSize: '0.86rem', fontWeight: 600, color: dept.color }}>
                  {dept.name}
                </div>
                <span
                  style={{
                    fontSize: '0.68rem',
                    padding: '2px 7px',
                    borderRadius: '10px',
                    backgroundColor: dept.bg,
                    color: dept.color,
                    fontWeight: 600,
                  }}
                >
                  {deptAgents.length} Especialistas
                </span>
              </div>

              {/* Mesas dos Especialistas no Departamento */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
                {deptAgents.map((agent) => {
                  const hasCustomKey = !!agent.assignedKeyId;
                  return (
                    <div
                      key={agent.id}
                      onClick={() => handleOpenDrawer(agent)}
                      style={{
                        borderRadius: '10px',
                        backgroundColor: 'rgba(30, 41, 59, 0.7)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        padding: '12px 10px',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        textAlign: 'center',
                        position: 'relative',
                        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-3px)';
                        e.currentTarget.style.borderColor = dept.color;
                        e.currentTarget.style.boxShadow = `0 6px 16px ${dept.bg}`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                      title={`Clique para configurar ${agent.name}`}
                    >
                      {/* Indicador de Status Luminoso */}
                      <div
                        style={{
                          position: 'absolute',
                          top: '8px',
                          right: '8px',
                          width: '7px',
                          height: '7px',
                          borderRadius: '50%',
                          backgroundColor: '#10b981',
                          boxShadow: '0 0 6px #10b981',
                        }}
                        title="Ocioso (Pronto)"
                      />

                      {/* Estação de Trabalho / Avatar do Especialista */}
                      <div
                        style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '10px',
                          backgroundColor: dept.bg,
                          border: `1px solid ${dept.border}`,
                          color: dept.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginBottom: '8px',
                          position: 'relative',
                        }}
                      >
                        <Bot size={20} />
                        {/* Monitor Miniatura */}
                        <div
                          style={{
                            position: 'absolute',
                            bottom: '-4px',
                            right: '-4px',
                            width: '14px',
                            height: '14px',
                            borderRadius: '3px',
                            backgroundColor: '#0f172a',
                            border: `1px solid ${dept.color}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Code2 size={8} color={dept.color} />
                        </div>
                      </div>

                      {/* Nome do Especialista */}
                      <div
                        style={{
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          lineHeight: 1.2,
                          maxHeight: '2.4em',
                          overflow: 'hidden',
                        }}
                      >
                        {agent.name}
                      </div>

                      {/* Cargo Resumido */}
                      <div
                        style={{
                          fontSize: '0.66rem',
                          color: 'var(--text-muted)',
                          marginTop: '3px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          width: '100%',
                        }}
                      >
                        {agent.role}
                      </div>

                      {/* Plaquinha da Chave / Provedor */}
                      <div
                        style={{
                          marginTop: '8px',
                          fontSize: '0.63rem',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          backgroundColor: hasCustomKey ? 'rgba(99, 102, 241, 0.18)' : 'rgba(255, 255, 255, 0.06)',
                          color: hasCustomKey ? '#818cf8' : 'var(--text-secondary)',
                          border: `1px solid ${hasCustomKey ? 'rgba(99, 102, 241, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        <Key size={8} />
                        <span>{agent.assignedKeyId ? agent.assignedKeyId.split('_')[0] : 'auto_hybrid'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* Drawer Lateral de Configuração do Especialista */}
      {selectedAgent && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={() => setSelectedAgent(null)}
        >
          <div
            style={{
              width: '380px',
              maxWidth: '90vw',
              height: '100%',
              backgroundColor: 'var(--bg-secondary)',
              borderLeft: '1px solid var(--border-color)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.6)',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Topo do Drawer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    backgroundColor: `${selectedAgent.color}22`,
                    border: `1px solid ${selectedAgent.color}55`,
                    color: selectedAgent.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Bot size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {selectedAgent.name}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: selectedAgent.color }}>
                    {selectedAgent.departmentName}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedAgent(null)}
                className="btn btn-ghost"
                style={{ padding: '4px', color: 'var(--text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Missão do Especialista */}
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '12px',
              }}
            >
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Missão Operacional
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.4 }}>
                {selectedAgent.mission}
              </div>
            </div>

            {/* Permissões de Disco & Ferramentas */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Capacidades & Disco
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: '0.72rem',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    backgroundColor: selectedAgent.isReadOnly ? 'rgba(100, 116, 139, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                    color: selectedAgent.isReadOnly ? '#94a3b8' : '#34d399',
                    border: `1px solid ${selectedAgent.isReadOnly ? 'rgba(100, 116, 139, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                  }}
                >
                  {selectedAgent.isReadOnly ? '📖 Somente Leitura' : '✍️ Escrita & Leitura Liberada'}
                </span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(255, 255, 255, 0.04)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  {selectedAgent.tools.length} Ferramentas
                </span>
              </div>
            </div>

            {/* Matriz Multi-Chaves: Atribuir Chave do KeyVault */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Provedor / Chave de API Atribuída
              </div>
              <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: 0 }}>
                Escolha qual chave do cofre este agente utilizará nas deliberações.
              </p>

              <select
                className="input"
                value={activeKeySelection}
                onChange={(e) => setActiveKeySelection(e.target.value)}
                style={{ fontSize: '0.84rem', padding: '8px 10px', backgroundColor: 'var(--bg-primary)' }}
              >
                <option value="">(Padrão) auto_hybrid — Roteamento Inteligente</option>
                {Array.isArray(vaultKeys) && vaultKeys.map((k) => (
                  <option key={k.key_id} value={k.key_id}>
                    🔑 {(k.provider_name || (k as any).provider || 'AI').toUpperCase()} — {k.key_id} {(k.preferred_model || (k as any).default_model) ? `(${k.preferred_model || (k as any).default_model})` : ''}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleSaveAgentKey}
                disabled={savingKey}
                className="btn btn-primary"
                style={{
                  fontSize: '0.8rem',
                  padding: '8px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  backgroundColor: 'var(--accent-color)',
                  color: '#fff',
                  marginTop: '4px',
                }}
              >
                <Key size={14} />
                <span>{savingKey ? 'Salvando...' : 'Salvar Atribuição de Chave'}</span>
              </button>
            </div>

            {/* Botão de Ação: Abrir no Chat */}
            {onSelectForChat && (
              <button
                type="button"
                onClick={() => {
                  onSelectForChat(selectedAgent.id);
                  setSelectedAgent(null);
                }}
                className="btn btn-secondary"
                style={{
                  fontSize: '0.82rem',
                  padding: '9px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  color: '#818cf8',
                  borderColor: 'rgba(99, 102, 241, 0.3)',
                  marginTop: 'auto',
                }}
              >
                <Bot size={15} />
                <span>Conversar com {selectedAgent.name} no Chat</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
