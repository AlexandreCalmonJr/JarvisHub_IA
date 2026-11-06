import React from 'react';
import { AgentInfo } from '../types';
import { Cpu, Terminal } from 'lucide-react';

const AGENTS_LIST: AgentInfo[] = [
  { role: 'jarvis_master', name: 'JARVIS Master', mission: 'Coordenação de tarefas com estado, checkpoints e pedidos de aprovação.', preferred_model: 'llama3.2:3b', is_read_only: true, allowed_tools: ['delegate_agent', 'request_approval', 'query_audit'] },
  { role: 'software_architect', name: 'Software Architect', mission: 'Definição e análise de arquitetura técnica e padrões de design.', preferred_model: 'llama3.2:3b', is_read_only: true, allowed_tools: ['read_file', 'list_directory'] },
  { role: 'project_manager', name: 'Project Manager', mission: 'Gestão de tarefas, dependências, prazos e prioridades.', preferred_model: 'llama3.2:3b', is_read_only: true, allowed_tools: ['read_file', 'list_directory'] },
  { role: 'research_analyst', name: 'Research Analyst', mission: 'Pesquisa comparativa e sínteses com fontes verificadas.', preferred_model: 'llama3.2:3b', is_read_only: true, allowed_tools: ['read_file'] },
  { role: 'project_designer_planner', name: 'Project Designer & Planner', mission: 'Elaboração de PRDs, user stories e critérios de aceitação.', preferred_model: 'llama3.2:3b', is_read_only: true, allowed_tools: ['read_file'] },
  { role: 'ux_ui_designer', name: 'UX/UI Designer', mission: 'Desenho de fluxos, Design System e interfaces acessíveis.', preferred_model: 'llama3.2:3b', is_read_only: true, allowed_tools: ['read_file'] },
  { role: 'frontend_mobile_developer', name: 'Front-end & Mobile Developer', mission: 'Implementação de interfaces Flutter/Dart e React/TypeScript.', preferred_model: 'qwen2.5-coder:7b', is_read_only: false, allowed_tools: ['read_file', 'propose_patch', 'run_linter'] },
  { role: 'backend_developer', name: 'Back-end Developer', mission: 'Implementação de APIs FastAPI, persistência e regras de negócio.', preferred_model: 'qwen2.5-coder:7b', is_read_only: false, allowed_tools: ['read_file', 'propose_patch', 'run_tests'] },
  { role: 'qa_engineer', name: 'QA Engineer', mission: 'Planeamento e execução de testes automatizados e reporte de defeitos.', preferred_model: 'qwen2.5-coder:7b', is_read_only: true, allowed_tools: ['read_file', 'run_tests'] },
  { role: 'code_reviewer', name: 'Code Reviewer', mission: 'Avaliação detalhada de legibilidade, arquitetura e regressões em diffs.', preferred_model: 'qwen2.5-coder:7b', is_read_only: true, allowed_tools: ['read_file', 'inspect_diff'] },
  { role: 'data_scientist', name: 'Data Scientist', mission: 'Análise estatística, experimentos e modelagem analítica.', preferred_model: 'qwen2.5:7b', is_read_only: true, allowed_tools: ['read_file'] },
  { role: 'business_intelligence', name: 'Business Intelligence', mission: 'Definição de KPIs, métricas e relatórios estratégicos.', preferred_model: 'qwen2.5:7b', is_read_only: true, allowed_tools: ['read_file'] },
  { role: 'data_engineering_intelligence', name: 'Data Engineering & Intelligence', mission: 'Limpeza, validação, enriquecimento e normalização de dados.', preferred_model: 'qwen2.5:7b', is_read_only: true, allowed_tools: ['read_file'] },
  { role: 'data_engineer_pipelines', name: 'Data Engineer / Pipelines', mission: 'Arquitetura de ingestão, ETL/ELT e pipelines idempotentes.', preferred_model: 'qwen2.5-coder:7b', is_read_only: false, allowed_tools: ['read_file'] },
  { role: 'devops_engineer', name: 'DevOps Engineer', mission: 'Automação de CI/CD, builds, empacotamento e containers seguros.', preferred_model: 'qwen2.5-coder:7b', is_read_only: false, allowed_tools: ['read_file', 'run_linter'] },
  { role: 'network_infrastructure_engineer', name: 'Network & Infrastructure Engineer', mission: 'Análise de conectividade de rede privada, DNS e capacidade.', preferred_model: 'qwen2.5:7b', is_read_only: true, allowed_tools: ['read_file'] },
  { role: 'cybersecurity_engineer', name: 'Cybersecurity Engineer', mission: 'Coordenação da postura de segurança, mitigação e defesas ativas.', preferred_model: 'qwen2.5:7b', is_read_only: true, allowed_tools: ['read_file', 'scan_secrets'] },
  { role: 'automation_engineer', name: 'Automation Engineer', mission: 'Scripts operacionais, agendamento e automações repetíveis.', preferred_model: 'qwen2.5-coder:7b', is_read_only: false, allowed_tools: ['read_file'] },
  { role: 'threat_modeling_security_architect', name: 'Threat Modeling & Security Architect', mission: 'Identificação de ativos, superfícies de ataque e ameaças STRIDE.', preferred_model: 'qwen2.5:7b', is_read_only: true, allowed_tools: ['read_file'] },
  { role: 'secure_code_auditor', name: 'Secure Code Auditor', mission: 'Auditoria minuciosa contra vulnerabilidades de injeção e falhas de lógica.', preferred_model: 'qwen2.5-coder:7b', is_read_only: true, allowed_tools: ['read_file', 'scan_secrets'] },
  { role: 'api_security_specialist', name: 'API Security Specialist', mission: 'Análise de autorização de endpoints, rate limits e OWASP API Top 10.', preferred_model: 'qwen2.5:7b', is_read_only: true, allowed_tools: ['read_file'] },
  { role: 'identity_access_management', name: 'Identity & Access Management', mission: 'Governança de permissões, papéis RBAC e ciclo de sessões.', preferred_model: 'qwen2.5:7b', is_read_only: true, allowed_tools: ['read_file'] },
  { role: 'software_supply_chain_security', name: 'Software Supply Chain Security', mission: 'Auditoria de dependências, SBOM e integridade de pacotes.', preferred_model: 'qwen2.5:7b', is_read_only: true, allowed_tools: ['read_file'] },
  { role: 'soc_incident_response', name: 'SOC & Incident Response', mission: 'Monitorização cronológica de alertas e resposta a incidentes.', preferred_model: 'qwen2.5:7b', is_read_only: true, allowed_tools: ['query_audit'] },
  { role: 'ai_security_red_team', name: 'AI Security & Red Team', mission: 'Testes de robustez contra prompt injection e manipulação de agentes.', preferred_model: 'qwen2.5:7b', is_read_only: true, allowed_tools: ['read_file'] },
  { role: 'privacy_data_protection', name: 'Privacy & Data Protection', mission: 'Minimização de dados pessoais, retenção e conformidade com RGPD.', preferred_model: 'qwen2.5:7b', is_read_only: true, allowed_tools: ['read_file'] },
];

export const AgentCenterView: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Agent Center (26 Perfis Especializados)</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
          Especialistas lógicos que compartilham os modelos locais sem sobrecarga de processos simultâneos.
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: '16px',
      }}>
        {AGENTS_LIST.map((agent, i) => (
          <div
            key={agent.role}
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--accent-color)', fontWeight: 700 }}>
                  #{String(i + 1).padStart(2, '0')}
                </span>
                <span className={`badge ${agent.is_read_only ? 'badge-info' : 'badge-warning'}`}>
                  {agent.is_read_only ? 'Somente Leitura' : 'Edição Autorizada'}
                </span>
              </div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600 }}>{agent.name}</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: 1.4 }}>
                {agent.mission}
              </p>
            </div>

            <div style={{ paddingTop: '12px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}>
                <Cpu size={14} color="var(--accent-color)" />
                <span style={{ color: 'var(--text-secondary)' }}>Modelo Sugerido:</span>
                <code>{agent.preferred_model}</code>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}>
                <Terminal size={14} color="var(--success-color)" />
                <span style={{ color: 'var(--text-secondary)' }}>Ferramentas:</span>
                <span>{agent.allowed_tools.join(', ')}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
