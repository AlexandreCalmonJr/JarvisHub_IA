import React, { useState, useEffect, useMemo } from 'react';
import { AgentInfo, getAgentLabel, getToolLabel, getToolDescription } from '../types';
import { fetchAgents, updateAgentConfig } from '../api';
import { notify } from './common/Toast';
import { AgentActionsModal } from './agents/AgentActionsModal';
import { AgentDetailModal } from './agents/AgentDetailModal';
import { AgentPlayground } from './agents/AgentPlayground';

export const AgentCenterView: React.FC = () => {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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
      setAgents(data);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Falha ao carregar o catálogo de agentes.');
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

      {loadError && (
        <div role="alert" className="glass-card" style={{ padding: '12px 16px', border: '1px solid rgba(248, 113, 113, 0.35)', borderRadius: '10px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
          Não foi possível carregar os agentes: {loadError}
          <button type="button" onClick={loadAgents} className="btn btn-ghost" style={{ marginLeft: '10px', fontSize: '0.76rem' }}>Tentar novamente</button>
        </div>
      )}

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

      {agents.length === 0 && !loading && !loadError && (
        <div role="status" className="glass-panel" style={{ padding: '36px 24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Nenhum especialista foi retornado pelo servidor.
        </div>
      )}

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
