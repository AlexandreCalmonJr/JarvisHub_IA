import React, { useState } from 'react';
import { Modal } from '../../shared/common/Modal';
import { BookOpen, Copy, Check, Users, Shield, Wrench, Layers } from 'lucide-react';
import { SkillInfo } from '../../types';
import { ALL_26_AGENTS } from '../../data/agentsCatalog';
import { notify } from '../../shared/common/Toast';

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

  const isActive = skill.is_approved && !skill.is_revoked;

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
    return (
      found || {
        role,
        name: role.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
        color: 'var(--accent-color)',
        categoryLabel: 'Especialista',
      }
    );
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={skill.name}
      subtitle={`Habilidade Técnica · ${skill.domain.toUpperCase()} · v${skill.version}`}
      icon={<BookOpen size={18} color="var(--accent-light)" />}
      maxWidth="lg"
      footer={
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
              fontSize: '0.74rem',
              color: 'var(--text-muted)',
            }}
          >
            <span>Licença: {skill.license || 'MIT'}</span>
            {skill.origin && (
              <>
                <span aria-hidden="true">·</span>
                <span>Origem: {skill.origin}</span>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {canManageSkills && onEditAgents && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditAgents(skill);
                }}
                className="btn btn-secondary btn-sm"
              >
                <Users size={14} />
                <span>Vincular Agentes</span>
              </button>
            )}
            <button type="button" onClick={onClose} className="btn btn-primary btn-sm">
              Fechar
            </button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {/* Metadados & Descrição */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
              fontSize: '0.74rem',
              fontWeight: 600,
              color: 'var(--text-muted)',
            }}
          >
            <span style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {skill.domain}
            </span>
            <span aria-hidden="true">·</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>ID: {skill.id}</span>
            <span aria-hidden="true">·</span>
            <span style={{ color: isActive ? 'var(--success-color)' : 'var(--danger-color)' }}>
              {isActive ? '● Ativa no Runtime' : '○ Desativada'}
            </span>
          </div>

          <p style={{ fontSize: '0.86rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.55 }}>
            {skill.description}
          </p>
        </div>

        {/* Ferramentas e Permissões */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
            gap: '12px',
          }}
        >
          <div className="jarvis-settings-subcard">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Wrench size={14} color="var(--accent-light)" />
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Ferramentas MCP Autorizadas
              </span>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {skill.allowed_tools && skill.allowed_tools.length > 0 ? (
                skill.allowed_tools.map((t) => (
                  <span
                    key={t}
                    style={{
                      fontSize: '0.7rem',
                      fontFamily: 'var(--font-mono)',
                      backgroundColor: 'var(--accent-soft)',
                      color: 'var(--accent-light)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-accent)',
                    }}
                  >
                    {t}
                  </span>
                ))
              ) : (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Herança direta do modelo do agente
                </span>
              )}
            </div>
          </div>

          <div className="jarvis-settings-subcard">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Shield size={14} color="var(--accent-light)" />
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Permissões & Isolamento
              </span>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {skill.required_permissions && skill.required_permissions.length > 0 ? (
                skill.required_permissions.map((p) => (
                  <span
                    key={p}
                    style={{
                      fontSize: '0.7rem',
                      fontFamily: 'var(--font-mono)',
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-secondary)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    {p}
                  </span>
                ))
              ) : (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Leitura e execução padrão do workspace
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Especialistas Vinculados */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Users size={14} color="var(--text-secondary)" />
            <span className="jarvis-tabular" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Agentes que possuem esta Habilidade ({assignedAgentsList.length})
            </span>
          </div>

          {assignedAgentsList.length === 0 ? (
            <div className="jarvis-settings-subcard" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Nenhum especialista vinculado no momento.
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 190px), 1fr))',
                gap: '8px',
                maxHeight: '148px',
                overflowY: 'auto',
                paddingRight: '2px',
              }}
            >
              {assignedAgentsList.map((agent) => (
                <div
                  key={agent.role}
                  className="jarvis-settings-subcard"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 10px',
                  }}
                >
                  <div
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '7px',
                      backgroundColor: agent.color || 'var(--accent-color)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
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
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {agent.name}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      {'categoryLabel' in agent && agent.categoryLabel ? agent.categoryLabel : 'Especialista'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Diretrizes & Prompt Injetado */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Layers size={14} color="var(--accent-light)" />
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Diretrizes de Prompt Injetadas
              </span>
            </div>

            <button
              type="button"
              onClick={handleCopyInstructions}
              className={`btn btn-xs ${copied ? 'btn-success' : 'btn-secondary'}`}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              <span>{copied ? 'Copiado!' : 'Copiar Diretrizes'}</span>
            </button>
          </div>

          <div
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.79rem',
              color: 'var(--text-primary)',
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
