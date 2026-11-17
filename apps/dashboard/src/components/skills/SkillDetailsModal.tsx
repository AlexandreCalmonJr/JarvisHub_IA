import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { BookOpen, Copy, Check, Users, Shield, Wrench, Layers } from 'lucide-react';
import { SkillInfo } from '../../types';
import { ALL_26_AGENTS } from '../../data/agentsCatalog';
import { notify } from '../common/Toast';

interface SkillDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  skill: SkillInfo | null;
  onEditAgents?: (skill: SkillInfo) => void;
  canManageSkills?: boolean;
}

export const SkillDetailsModal: React.FC<SkillDetailsModalProps> = ({
  isOpen,
  onClose,
  skill,
  onEditAgents,
  canManageSkills = false,
}) => {
  const [copied, setCopied] = useState(false);

  if (!skill) return null;

  const handleCopyInstructions = async () => {
    try {
      await navigator.clipboard.writeText(skill.instructions || '');
      setCopied(true);
      notify('Diretrizes copiadas para a área de transferência!', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify('Não foi possível copiar as diretrizes.', 'error');
    }
  };

  const assignedAgentsList = (skill.assigned_agents || []).map((role) => {
    const found = ALL_26_AGENTS.find((a) => a.role === role);
    return found || {
      role,
      name: role.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
      color: '#0284c7',
      categoryLabel: 'Especialista',
    };
  });

  const getDomainColor = (dom: string) => {
    switch (dom.toLowerCase()) {
      case 'flutter':
        return { bg: 'rgba(168, 85, 247, 0.15)', text: '#c084fc', border: 'rgba(168, 85, 247, 0.3)' };
      case 'web':
        return { bg: 'rgba(6, 182, 212, 0.15)', text: '#22d3ee', border: 'rgba(6, 182, 212, 0.3)' };
      case 'backend':
        return { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: 'rgba(16, 185, 129, 0.3)' };
      case 'security':
        return { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: 'rgba(239, 68, 68, 0.3)' };
      case 'qa':
        return { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' };
      case 'data':
        return { bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa', border: 'rgba(59, 130, 246, 0.3)' };
      case 'ops':
        return { bg: 'rgba(139, 92, 246, 0.15)', text: '#a78bfa', border: 'rgba(139, 92, 246, 0.3)' };
      default:
        return { bg: 'rgba(255, 255, 255, 0.08)', text: '#e4e4e7', border: 'rgba(255, 255, 255, 0.15)' };
    }
  };

  const domainColors = getDomainColor(skill.domain);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={skill.name}
      subtitle={`Habilidade Técnica · ${skill.domain.toUpperCase()} · v${skill.version}`}
      icon={<BookOpen size={20} color="#38bdf8" />}
      maxWidth="lg"
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '0.74rem',
                color: '#71717a',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                padding: '4px 10px',
                borderRadius: '6px',
              }}
            >
              Licença: {skill.license || 'MIT'}
            </span>
            {skill.origin && (
              <span
                style={{
                  fontSize: '0.74rem',
                  color: '#a1a1aa',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  padding: '4px 10px',
                  borderRadius: '6px',
                }}
              >
                Origem: {skill.origin}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            {canManageSkills && onEditAgents && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditAgents(skill);
                }}
                className="btn btn-secondary"
                style={{ fontSize: '0.82rem', padding: '6px 14px', borderRadius: '8px' }}
              >
                <Users size={14} />
                <span>Vincular Agentes</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="btn btn-primary"
              style={{ fontSize: '0.82rem', padding: '6px 18px', borderRadius: '8px' }}
            >
              Fechar
            </button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Descrição & Tags */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: '999px',
                backgroundColor: domainColors.bg,
                color: domainColors.text,
                border: `1px solid ${domainColors.border}`,
              }}
            >
              {skill.domain.toUpperCase()}
            </span>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: '6px',
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                color: '#a1a1aa',
              }}
            >
              ID: {skill.id}
            </span>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: '6px',
                backgroundColor: skill.is_approved && !skill.is_revoked ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: skill.is_approved && !skill.is_revoked ? '#34d399' : '#f87171',
                border: skill.is_approved && !skill.is_revoked ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
              }}
            >
              {skill.is_approved && !skill.is_revoked ? '● Ativa no Runtime' : '○ Desativada'}
            </span>
          </div>

          <p style={{ fontSize: '0.88rem', color: '#d4d4d8', margin: '4px 0 0 0', lineHeight: 1.55 }}>
            {skill.description}
          </p>
        </div>

        {/* Ferramentas e Permissões */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '12px',
          }}
        >
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Wrench size={14} color="#38bdf8" />
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#f5f5f5' }}>
                Ferramentas MCP Autorizadas
              </span>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {(skill.allowed_tools && skill.allowed_tools.length > 0) ? (
                skill.allowed_tools.map((t) => (
                  <span
                    key={t}
                    style={{
                      fontSize: '0.70rem',
                      fontFamily: 'monospace',
                      backgroundColor: 'rgba(56, 189, 248, 0.1)',
                      color: '#38bdf8',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: '1px solid rgba(56, 189, 248, 0.25)',
                    }}
                  >
                    {t}
                  </span>
                ))
              ) : (
                <span style={{ fontSize: '0.75rem', color: '#71717a' }}>
                  Herança direta do modelo do agente
                </span>
              )}
            </div>
          </div>

          <div
            style={{
              padding: '12px 14px',
              borderRadius: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Shield size={14} color="#a855f7" />
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#f5f5f5' }}>
                Permissões & Isolamento
              </span>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {(skill.required_permissions && skill.required_permissions.length > 0) ? (
                skill.required_permissions.map((p) => (
                  <span
                    key={p}
                    style={{
                      fontSize: '0.70rem',
                      backgroundColor: 'rgba(168, 85, 247, 0.1)',
                      color: '#c084fc',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: '1px solid rgba(168, 85, 247, 0.25)',
                    }}
                  >
                    {p}
                  </span>
                ))
              ) : (
                <span style={{ fontSize: '0.75rem', color: '#71717a' }}>
                  Leitura e execução padrão do workspace
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Especialistas Vinculados */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Users size={15} color="#e4e4e7" />
              <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#f5f5f5' }}>
                Agentes que possuem esta Habilidade ({assignedAgentsList.length})
              </span>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '8px',
              maxHeight: '140px',
              overflowY: 'auto',
              padding: '2px',
            }}
          >
            {assignedAgentsList.map((agent) => (
              <div
                key={agent.role}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                <div
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '7px',
                    backgroundColor: agent.color || '#0284c7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
                  }}
                >
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#ffffff' }}>
                    {agent.name.charAt(0)}
                  </span>
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: '#f5f5f5',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {agent.name}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#71717a' }}>{'categoryLabel' in agent && agent.categoryLabel ? agent.categoryLabel : 'Especialista'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Diretrizes & Prompt Injetado */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Layers size={15} color="#38bdf8" />
              <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#f5f5f5' }}>
                Diretrizes de Prompt Injetadas
              </span>
            </div>

            <button
              type="button"
              onClick={handleCopyInstructions}
              className="btn btn-ghost"
              style={{
                fontSize: '0.74rem',
                padding: '4px 10px',
                borderRadius: '6px',
                color: copied ? '#34d399' : '#38bdf8',
                backgroundColor: 'rgba(56, 189, 248, 0.08)',
              }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              <span>{copied ? 'Copiado!' : 'Copiar Diretrizes'}</span>
            </button>
          </div>

          <div
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              backgroundColor: '#09090b',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
              fontSize: '0.80rem',
              color: '#e4e4e7',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: '260px',
              overflowY: 'auto',
            }}
          >
            {skill.instructions || '// Nenhuma instrução adicional informada'}
          </div>
        </div>
      </div>
    </Modal>
  );
};
