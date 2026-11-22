import React from 'react';
import { Users, CheckCircle, XCircle, Trash2, BookOpen, Wrench } from 'lucide-react';
import { SkillInfo, AgentInfo } from '../../types';
import { ALL_26_AGENTS } from '../../data/agentsCatalog';
import { resolveSkillDomainLabel } from '../../services/domainCatalog';

interface SkillCardProps {
  skill: SkillInfo;
  agents?: AgentInfo[];
  onToggle: (id: string) => void;
  onEditAgents: (skill: SkillInfo) => void;
  onViewInstructions?: (skill: SkillInfo) => void;
  onDelete?: (id: string, name: string) => void;
  canManageSkills?: boolean;
  isAdmin?: boolean;
}

export const SkillCard: React.FC<SkillCardProps> = ({
  skill,
  agents = [],
  onToggle,
  onEditAgents,
  onViewInstructions,
  onDelete,
  canManageSkills = false,
  isAdmin = false,
}) => {
  const isApproved = skill.is_approved && !skill.is_revoked;
  const isPrivateSkill =
    skill.origin === 'user_created' ||
    skill.origin === 'imported_ecc' ||
    skill.id.startsWith('user_');
  const canManageThisSkill = canManageSkills && (isAdmin || isPrivateSkill);

  const domainLabel = resolveSkillDomainLabel(skill.domain);
  const originLabel =
    skill.origin && (skill.origin.includes('github') || skill.origin === 'imported_ecc')
      ? 'ECC Oficial'
      : isPrivateSkill
        ? 'Custom'
        : null;

  const assigned = (skill.assigned_agents || []).map((role) => {
    const liveAg = agents.find((a) => a.role === role);
    if (liveAg) {
      return {
        role: liveAg.role,
        name: liveAg.proper_name || liveAg.name,
        color: liveAg.mascot?.color || 'var(--accent-color)',
        categoryLabel: liveAg.name || 'Especialista',
      };
    }
    const ag = ALL_26_AGENTS.find((a) => a.role === role);
    return (
      ag || {
        role,
        name: role.replace(/_/g, ' '),
        color: 'var(--accent-color)',
        categoryLabel: 'Especialista',
      }
    );
  });

  const visibleAvatars = assigned.slice(0, 4);
  const remainingCount = Math.max(0, assigned.length - 4);

  return (
    <article
      className="jarvis-settings-card"
      style={{
        justifyContent: 'space-between',
        gap: '14px',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0 }}>
        {/* Top Metadata & Status Control */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              flexWrap: 'wrap',
              fontSize: '0.7rem',
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              minWidth: 0,
            }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>{domainLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="jarvis-tabular" style={{ fontFamily: 'var(--font-mono)', textTransform: 'none' }}>
              v{skill.version}
            </span>
            {originLabel && (
              <>
                <span aria-hidden="true">·</span>
                <span style={{ color: 'var(--accent-light)' }}>{originLabel}</span>
              </>
            )}
          </div>

          {canManageThisSkill ? (
            <button
              type="button"
              onClick={() => onToggle(skill.id)}
              aria-pressed={isApproved}
              className={`btn btn-xs ${isApproved ? 'btn-success' : 'btn-secondary'}`}
              title={isApproved ? 'Habilidade ativa — clique para desativar' : 'Habilidade inativa — clique para ativar'}
            >
              {isApproved ? <CheckCircle size={12} /> : <XCircle size={12} />}
              <span>{isApproved ? 'Ativa' : 'Desativada'}</span>
            </button>
          ) : (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '0.72rem',
                fontWeight: 500,
                color: isApproved ? 'var(--success-color)' : 'var(--text-muted)',
              }}
            >
              <span aria-hidden="true">{isApproved ? '●' : '○'}</span>
              <span>{isApproved ? 'Ativa' : 'Desativada'}</span>
            </span>
          )}
        </div>

        {/* Title & Description */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
          <h4
            style={{
              fontSize: '0.94rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
              lineHeight: 1.35,
            }}
          >
            {skill.name}
          </h4>

          <p
            style={{
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              margin: 0,
              lineHeight: 1.48,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {skill.description}
          </p>
        </div>

        {/* Authorized MCP Tools */}
        {skill.allowed_tools && skill.allowed_tools.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
            <Wrench size={11} color="var(--text-muted)" />
            {skill.allowed_tools.slice(0, 3).map((tool) => (
              <span
                key={tool}
                style={{
                  fontSize: '0.68rem',
                  fontFamily: 'var(--font-mono)',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {tool}
              </span>
            ))}
            {skill.allowed_tools.length > 3 && (
              <span className="jarvis-tabular" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                +{skill.allowed_tools.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Footer: Assigned Agent Avatars & Actions */}
      <div
        style={{
          borderTop: '1px solid var(--border-subtle)',
          paddingTop: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          {visibleAvatars.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {visibleAvatars.map((ag, i) => (
                <div
                  key={ag.role}
                  title={`${ag.name} (${'categoryLabel' in ag && ag.categoryLabel ? ag.categoryLabel : 'Especialista'})`}
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '6px',
                    backgroundColor: ag.color || 'var(--accent-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    marginLeft: i > 0 ? '-6px' : 0,
                    border: '2px solid var(--bg-secondary)',
                  }}
                >
                  {ag.name.charAt(0)}
                </div>
              ))}
              {remainingCount > 0 && (
                <div
                  className="jarvis-tabular"
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-tertiary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-secondary)',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    marginLeft: '-6px',
                    border: '2px solid var(--bg-secondary)',
                  }}
                >
                  +{remainingCount}
                </div>
              )}
            </div>
          )}

          <span className="jarvis-tabular" style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 500 }}>
            {assigned.length} {assigned.length === 1 ? 'especialista' : 'especialistas'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {onViewInstructions && (
            <button
              type="button"
              onClick={() => onViewInstructions(skill)}
              className="btn btn-secondary btn-xs"
              title="Ver diretrizes e instruções de prompt"
            >
              <BookOpen size={12} />
              <span>Diretrizes</span>
            </button>
          )}

          {canManageThisSkill && (
            <button
              type="button"
              onClick={() => onEditAgents(skill)}
              className="btn btn-secondary btn-xs"
            >
              <Users size={12} />
              <span>Vincular</span>
            </button>
          )}

          {onDelete && canManageThisSkill && isPrivateSkill && (
            <button
              type="button"
              onClick={() => onDelete(skill.id, skill.name)}
              className="btn btn-danger-ghost btn-icon-sm"
              title={`Excluir habilidade ${skill.name}`}
              aria-label={`Excluir habilidade ${skill.name}`}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
};
