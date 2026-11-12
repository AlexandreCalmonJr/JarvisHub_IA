import React from 'react';
import { Modal } from '../common/Modal';
import { AgentInfo, getAgentLabel, getModelLabel, getToolLabel } from '../../types';
import {
  Settings,
  Sparkles,
  BookOpen,
  RotateCcw,
  Cpu,
  Terminal,
} from 'lucide-react';

interface AgentActionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  agent: AgentInfo;
  onOpenConfig: () => void;
  onOpenPlayground: () => void;
  onResetToHybridDefault?: () => void;
}

export const AgentActionsModal: React.FC<AgentActionsModalProps> = ({
  isOpen,
  onClose,
  agent,
  onOpenConfig,
  onOpenPlayground,
  onResetToHybridDefault,
}) => {
  const isHybrid = !agent.preferred_model || agent.preferred_model === 'auto_hybrid' || agent.preferred_model === 'auto';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Ações do Especialista — ${getAgentLabel(agent.role)}`}
      subtitle={`Modo: ${agent.is_read_only ? 'Somente Leitura' : 'Edição Propositiva'}`}
      icon={<Sparkles size={20} color="var(--accent-color)" />}
      maxWidth="md"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Fechar
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Status do Modelo Atual */}
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Cpu size={18} color="var(--accent-color)" />
            <div>
              <div style={{ fontSize: '0.80rem', color: 'var(--text-muted)' }}>Modelo em Execução:</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {isHybrid ? `🌐 ${getModelLabel(agent.preferred_model)} (Padrão)` : `💻 ${getModelLabel(agent.preferred_model)}`}
              </div>
            </div>
          </div>
          <span className={`badge ${agent.is_read_only ? 'badge-info' : 'badge-warning'}`}>
            {agent.is_read_only ? '🔒 Read-Only' : '✍️ Proposição de Escrita'}
          </span>
        </div>

        {/* Grade de Ações Principais */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          {/* Ação 1: Configurar */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenConfig();
            }}
            className="btn btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              padding: '14px',
              textAlign: 'left',
              borderRadius: '10px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--accent-glow)',
            }}
          >
            <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: 'var(--accent-glow)', color: 'var(--accent-color)', flexShrink: 0 }}>
              <Settings size={18} />
            </div>
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--accent-color)' }}>
                Configurações & Modelo
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Ajustar Modelo Preferencial (Híbrido/Local/Online), System Prompt e Ferramentas
              </div>
            </div>
          </button>

          {/* Ação 2: Playground */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenPlayground();
            }}
            className="btn btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              padding: '14px',
              textAlign: 'left',
              borderRadius: '10px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'rgba(217, 119, 87, 0.05)',
            }}
          >
            <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: 'rgba(217, 119, 87, 0.15)', color: 'var(--accent-color)', flexShrink: 0 }}>
              <Sparkles size={18} />
            </div>
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--accent-color)' }}>
                Testar no Playground
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Executar consultas de teste isoladas e auditar a geração cognitiva do agente
              </div>
            </div>
          </button>

          {/* Ação 3: Memória Episódica */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenConfig();
            }}
            className="btn btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              padding: '14px',
              textAlign: 'left',
              borderRadius: '10px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--accent-glow)',
            }}
          >
            <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: 'var(--accent-glow)', color: 'var(--accent-color)', flexShrink: 0 }}>
              <BookOpen size={18} />
            </div>
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--accent-color)' }}>
                Memória Episódica
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Ver e adicionar lições aprendidas e contexto persistido no SQLite
              </div>
            </div>
          </button>

          {/* Ação 4: Restaurar Padrão Híbrido se modificado */}
          {onResetToHybridDefault && !isHybrid && (
            <button
              type="button"
              onClick={() => {
                onResetToHybridDefault();
                onClose();
              }}
              className="btn btn-secondary"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '14px',
                textAlign: 'left',
                borderRadius: '10px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'rgba(52, 211, 153, 0.05)',
              }}
            >
              <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: 'rgba(52, 211, 153, 0.15)', color: '#34d399', flexShrink: 0 }}>
                <RotateCcw size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#34d399' }}>
                  Restaurar Padrão Híbrido
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Reverter este agente para o roteamento híbrido automático padrão
                </div>
              </div>
            </button>
          )}
        </div>

        {/* Resumo de Ferramentas Habilitadas */}
        <div
          style={{
            padding: '14px',
            borderRadius: '10px',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Terminal size={15} color="#34d399" />
            <span style={{ fontSize: '0.80rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Ferramentas Autorizadas no Sandbox:
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {agent.allowed_tools && agent.allowed_tools.length > 0 ? (
              agent.allowed_tools.map((t) => (
                <span
                  key={t}
                  style={{
                    fontSize: '0.72rem',
                    color: '#34d399',
                    backgroundColor: 'rgba(52, 211, 153, 0.1)',
                    border: '1px solid rgba(52, 211, 153, 0.25)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontFamily: 'monospace',
                  }}
                >
                  {getToolLabel(t)}
                </span>
              ))
            ) : (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                Nenhuma ferramenta externa permitida (Modo Análise Pura)
              </span>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
