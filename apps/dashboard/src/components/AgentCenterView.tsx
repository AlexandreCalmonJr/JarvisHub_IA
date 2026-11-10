import React, { useState, useEffect, useMemo } from 'react';
import { AgentInfo, getAgentLabel, getToolLabel, getToolDescription } from '../types';
import { fetchAgents, updateAgentConfig } from '../api';
import { notify } from './common/Toast';
import { AgentActionsModal } from './agents/AgentActionsModal';
import { AgentDetailModal } from './agents/AgentDetailModal';
import { AgentPlayground } from './agents/AgentPlayground';

const FALLBACK_AGENTS: AgentInfo[] = [
  { role: 'jarvis_master', name: 'JARVIS Master', mission: 'Coordenação de tarefas com estado, checkpoints e pedidos de aprovação.', preferred_model: 'auto_hybrid', is_read_only: false, allowed_tools: ['delegate_agent', 'request_approval', 'query_audit', 'read_file', 'write_file'] },
  { role: 'software_architect', name: 'Software Architect', mission: 'Definição e análise de arquitetura técnica e padrões de design.', preferred_model: 'auto_hybrid', is_read_only: false, allowed_tools: ['read_file', 'list_directory', 'inspect_manifest', 'write_file'] },
  { role: 'project_manager', name: 'Project Manager', mission: 'Gestão de tarefas, dependências, prazos e prioridades.', preferred_model: 'auto_hybrid', is_read_only: true, allowed_tools: ['read_file', 'list_directory'] },
  { role: 'research_analyst', name: 'Research Analyst', mission: 'Pesquisa comparativa e sínteses com fontes verificadas.', preferred_model: 'auto_hybrid', is_read_only: true, allowed_tools: ['read_file'] },
  { role: 'project_designer_planner', name: 'Project Designer & Planner', mission: 'Elaboração de PRDs, user stories e critérios de aceitação.', preferred_model: 'auto_hybrid', is_read_only: true, allowed_tools: ['read_file'] },
  { role: 'ux_ui_designer', name: 'UX/UI Designer', mission: 'Desenho de fluxos, Design System e interfaces acessíveis.', preferred_model: 'auto_hybrid', is_read_only: false, allowed_tools: ['read_file', 'write_file'] },
  { role: 'frontend_mobile_developer', name: 'Front-end & Mobile Developer', mission: 'Implementação de interfaces Flutter/Dart e React/TypeScript.', preferred_model: 'auto_hybrid', is_read_only: false, allowed_tools: ['read_file', 'propose_patch', 'run_linter', 'write_file'] },
  { role: 'backend_developer', name: 'Back-end Developer', mission: 'Implementação de APIs FastAPI, persistência e regras de negócio.', preferred_model: 'auto_hybrid', is_read_only: false, allowed_tools: ['read_file', 'propose_patch', 'run_tests', 'write_file'] },
  { role: 'qa_engineer', name: 'QA Engineer', mission: 'Planeamento e execução de testes automatizados e reporte de defeitos.', preferred_model: 'auto_hybrid', is_read_only: false, allowed_tools: ['read_file', 'run_tests', 'write_file'] },
  { role: 'code_reviewer', name: 'Code Reviewer', mission: 'Avaliação detalhada de legibilidade, arquitetura e regressões em diffs.', preferred_model: 'auto_hybrid', is_read_only: true, allowed_tools: ['read_file', 'inspect_diff'] },
  { role: 'data_scientist', name: 'Data Scientist', mission: 'Análise estatística, experimentos e modelagem analítica.', preferred_model: 'auto_hybrid', is_read_only: true, allowed_tools: ['read_file'] },
  { role: 'business_intelligence', name: 'Business Intelligence', mission: 'Definição de KPIs, métricas e relatórios estratégicos.', preferred_model: 'auto_hybrid', is_read_only: true, allowed_tools: ['read_file'] },
  { role: 'data_engineering_intelligence', name: 'Data Engineering & Intelligence', mission: 'Limpeza, validação, enriquecimento e normalização de dados.', preferred_model: 'auto_hybrid', is_read_only: false, allowed_tools: ['read_file', 'write_file'] },
  { role: 'data_engineer_pipelines', name: 'Data Engineer / Pipelines', mission: 'Arquitetura de ingestão, ETL/ELT e pipelines idempotentes.', preferred_model: 'auto_hybrid', is_read_only: false, allowed_tools: ['read_file', 'write_file'] },
  { role: 'devops_engineer', name: 'DevOps Engineer', mission: 'Automação de CI/CD, builds, empacotamento e containers seguros.', preferred_model: 'auto_hybrid', is_read_only: false, allowed_tools: ['read_file', 'run_linter', 'write_file'] },
  { role: 'network_infrastructure_engineer', name: 'Network & Infrastructure Engineer', mission: 'Análise de conectividade de rede privada, DNS e capacidade.', preferred_model: 'auto_hybrid', is_read_only: true, allowed_tools: ['read_file'] },
  { role: 'cybersecurity_engineer', name: 'Cybersecurity Engineer', mission: 'Coordenação da postura de segurança, mitigação e defesas ativas.', preferred_model: 'auto_hybrid', is_read_only: false, allowed_tools: ['read_file', 'scan_secrets', 'write_file'] },
  { role: 'automation_engineer', name: 'Automation Engineer', mission: 'Scripts operacionais, agendamento e automações repetíveis.', preferred_model: 'auto_hybrid', is_read_only: false, allowed_tools: ['read_file', 'write_file'] },
  { role: 'threat_modeling_security_architect', name: 'Threat Modeling & Security Architect', mission: 'Identificação de ativos, superfícies de ataque e ameaças STRIDE.', preferred_model: 'auto_hybrid', is_read_only: true, allowed_tools: ['read_file'] },
  { role: 'secure_code_auditor', name: 'Secure Code Auditor', mission: 'Auditoria minuciosa contra vulnerabilidades de injeção e falhas de lógica.', preferred_model: 'auto_hybrid', is_read_only: true, allowed_tools: ['read_file', 'scan_secrets'] },
  { role: 'api_security_specialist', name: 'API Security Specialist', mission: 'Análise de autorização de endpoints, rate limits e OWASP API Top 10.', preferred_model: 'auto_hybrid', is_read_only: true, allowed_tools: ['read_file'] },
  { role: 'identity_access_management', name: 'Identity & Access Management', mission: 'Governança de permissões, papéis RBAC e ciclo de sessões.', preferred_model: 'auto_hybrid', is_read_only: true, allowed_tools: ['read_file'] },
  { role: 'software_supply_chain_security', name: 'Software Supply Chain Security', mission: 'Auditoria de dependências, SBOM e integridade de pacotes.', preferred_model: 'auto_hybrid', is_read_only: true, allowed_tools: ['read_file'] },
  { role: 'soc_incident_response', name: 'SOC & Incident Response', mission: 'Monitorização cronológica de alertas e resposta a incidentes.', preferred_model: 'auto_hybrid', is_read_only: true, allowed_tools: ['query_audit'] },
  { role: 'ai_security_red_team', name: 'AI Security & Red Team', mission: 'Testes de robustez contra prompt injection e manipulação de agentes.', preferred_model: 'auto_hybrid', is_read_only: false, allowed_tools: ['read_file', 'write_file'] },
  { role: 'privacy_data_protection', name: 'Privacy & Data Protection', mission: 'Minimização de dados pessoais, retenção e conformidade com RGPD.', preferred_model: 'auto_hybrid', is_read_only: true, allowed_tools: ['read_file'] },
];

export const AgentCenterView: React.FC = () => {
  const [agents, setAgents] = useState<AgentInfo[]>(FALLBACK_AGENTS);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'security' | 'dev' | 'architecture' | 'data'>('all');

  // Modais interativos
  const [selectedModalAgent, setSelectedModalAgent] = useState<AgentInfo | null>(null);
  const [selectedPlaygroundAgent, setSelectedPlaygroundAgent] = useState<AgentInfo | null>(null);
  const [selectedActionsAgent, setSelectedActionsAgent] = useState<AgentInfo | null>(null);

    const handleResetAgentToHybrid = async (role: string) => {
    try {
      await updateAgentConfig(role, { preferred_model: 'auto_hybrid' });
      notify(`Especialista '${role}' restaurado para o Modo Híbrido!`, 'success');
      await loadAgents();
    } catch (err: any) {
      notify(`Erro ao restaurar especialista: ${err.message}`, 'error');
    }
  };

  const loadAgents = async () => {
    setLoading(true);
    try {
      const data = await fetchAgents();
      if (data && data.length > 0) {
        setAgents(data);
      }
    } catch (e) {
      console.warn('Usando catálogo fallback de agentes:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const filteredAgents = useMemo(() => {
    return agents.filter((ag) => {
      const q = search.toLowerCase();
      const matchSearch =
        ag.name.toLowerCase().includes(q) ||
        ag.role.toLowerCase().includes(q) ||
        ag.mission.toLowerCase().includes(q);

      if (!matchSearch) return false;

      if (categoryFilter === 'security') {
        return (
          ag.role.includes('security') ||
          ag.role.includes('threat') ||
          ag.role.includes('auditor') ||
          ag.role.includes('privacy') ||
          ag.role.includes('soc') ||
          ag.role.includes('identity') ||
          ag.role.includes('red_team')
        );
      }
      if (categoryFilter === 'dev') {
        return (
          ag.role.includes('developer') ||
          ag.role.includes('qa') ||
          ag.role.includes('code_reviewer') ||
          ag.role.includes('devops') ||
          ag.role.includes('automation')
        );
      }
      if (categoryFilter === 'architecture') {
        return (
          ag.role.includes('architect') ||
          ag.role.includes('manager') ||
          ag.role.includes('planner') ||
          ag.role.includes('designer') ||
          ag.role.includes('analyst') ||
          ag.role.includes('master')
        );
      }
      if (categoryFilter === 'data') {
        return ag.role.includes('data') || ag.role.includes('intelligence');
      }

      return true;
    });
  }, [agents, search, categoryFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 className="claude-serif-title" style={{ fontSize: '1.6rem', fontWeight: 500, margin: 0, letterSpacing: '-0.02em' }}>
            Agent Center (26 Especialistas Lógicos)
          </h2>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
            Orquestração modular com raciocínio ReAct/CoT, memória episódica transversal e execução real de ferramentas no sandbox
          </p>
        </div>

        <button
          onClick={loadAgents}
          className="btn btn-secondary"
          style={{ fontSize: '0.80rem', padding: '6px 14px' }}
        >
          {loading ? 'Atualizando...' : 'Atualizar Especialistas'}
        </button>
      </div>

      {/* Barra de Filtros e Busca */}
      <div
        className="glass-panel"
        style={{
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '220px' }}>
          <input
            type="text"
            placeholder="Filtrar especialista por nome, papel ou missão..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: '0.88rem',
            }}
          />
        </div>

        {/* Categorias */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setCategoryFilter('all')}
            className={`btn ${categoryFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.78rem', padding: '4px 10px' }}
          >
            Todos ({agents.length})
          </button>
          <button
            onClick={() => setCategoryFilter('dev')}
            className={`btn ${categoryFilter === 'dev' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.78rem', padding: '4px 10px' }}
          >
            Desenvolvimento
          </button>
          <button
            onClick={() => setCategoryFilter('security')}
            className={`btn ${categoryFilter === 'security' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.78rem', padding: '4px 10px' }}
          >
            Segurança (8)
          </button>
          <button
            onClick={() => setCategoryFilter('architecture')}
            className={`btn ${categoryFilter === 'architecture' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.78rem', padding: '4px 10px' }}
          >
            Arquitetura & Gestão
          </button>
          <button
            onClick={() => setCategoryFilter('data')}
            className={`btn ${categoryFilter === 'data' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.78rem', padding: '4px 10px' }}
          >
            Dados & BI
          </button>
        </div>
      </div>

      {/* Grid de Agentes */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
          gap: '16px',
        }}
      >
        {filteredAgents.map((agent, i) => (
          <div
            key={agent.role}
            className="glass-card"
            style={{
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '14px',
              border: '1px solid var(--border-color)',
            }}
          >
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '8px',
                }}
              >
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--accent-color)',
                    fontWeight: 700,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  #{String(i + 1).padStart(2, '0')}
                </span>
                <span className={`badge ${agent.is_read_only ? 'badge-info' : 'badge-warning'}`}>
                  {agent.is_read_only ? 'Somente Leitura' : 'Edição Autorizada'}
                </span>
              </div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {getAgentLabel(agent.role)}
              </h3>
              <p
                style={{
                  fontSize: '0.84rem',
                  color: 'var(--text-secondary)',
                  marginTop: '6px',
                  lineHeight: 1.45,
                }}
              >
                {agent.mission}
              </p>
            </div>

            <div
              style={{
                paddingTop: '12px',
                borderTop: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Modelo:</span>
                {!agent.preferred_model || agent.preferred_model === 'auto_hybrid' || agent.preferred_model === 'auto' ? (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      color: 'var(--text-secondary)',
                      backgroundColor: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid var(--border-color)',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      fontWeight: 500,
                    }}
                  >
                    Modo Híbrido (Auto)
                  </span>
                ) : (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      color: 'var(--text-secondary)',
                      backgroundColor: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid var(--border-color)',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                      fontWeight: 500,
                    }}
                  >
                    {agent.preferred_model}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '0.75rem', marginTop: '2px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Ferramentas Habilitadas:</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {agent.allowed_tools && agent.allowed_tools.length > 0 ? (
                      agent.allowed_tools.slice(0, 3).map((tool) => (
                        <span
                          key={tool}
                          style={{
                            fontSize: '0.70rem',
                            color: 'var(--text-secondary)',
                            backgroundColor: 'rgba(255, 255, 255, 0.04)',
                            border: '1px solid var(--border-color)',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontWeight: 500,
                          }}
                          title={getToolDescription(tool)}
                        >
                          {getToolLabel(tool)}
                        </span>
                      ))
                    ) : (
                      <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                        Modo Análise Pura
                      </span>
                    )}
                    {agent.allowed_tools && agent.allowed_tools.length > 3 && (
                      <span
                        style={{
                          fontSize: '0.70rem',
                          color: 'var(--text-muted)',
                          padding: '1px 4px',
                        }}
                      >
                        +{agent.allowed_tools.length - 3} mais
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Ações do Card */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                paddingTop: '8px',
              }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSelectedModalAgent(agent)}
                style={{
                  fontSize: '0.78rem',
                  padding: '7px 10px',
                }}
              >
                Configurar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setSelectedActionsAgent(agent)}
                style={{
                  fontSize: '0.78rem',
                  padding: '7px 10px',
                }}
              >
                Ações
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal de Detalhes e Configuração do Especialista */}
      {selectedModalAgent && (
        <AgentDetailModal
          isOpen={true}
          agent={selectedModalAgent}
          onClose={() => setSelectedModalAgent(null)}
          onUpdated={loadAgents}
          onOpenPlayground={(ag) => setSelectedPlaygroundAgent(ag)}
        />
      )}

      {/* Modal de Ações Rápidas do Especialista */}
      {selectedActionsAgent && (
        <AgentActionsModal
          isOpen={true}
          agent={selectedActionsAgent}
          onClose={() => setSelectedActionsAgent(null)}
          onOpenConfig={() => setSelectedModalAgent(selectedActionsAgent)}
          onOpenPlayground={() => setSelectedPlaygroundAgent(selectedActionsAgent)}
          onResetToHybridDefault={() => handleResetAgentToHybrid(selectedActionsAgent.role)}
        />
      )}

      {/* Modal Sandbox Playground */}
      {selectedPlaygroundAgent && (
        <AgentPlayground
          isOpen={true}
          agent={selectedPlaygroundAgent}
          onClose={() => setSelectedPlaygroundAgent(null)}
        />
      )}
    </div>
  );
};
