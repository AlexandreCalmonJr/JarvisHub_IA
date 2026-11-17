import React from 'react';
import { Users, CheckCircle, XCircle, Trash2, BookOpen, Wrench } from 'lucide-react';
import { SkillInfo } from '../../types';
import { ALL_26_AGENTS } from '../../data/agentsCatalog';

interface SkillCardProps {
  skill: SkillInfo;
  onToggle: (id: string) => void;
  onEditAgents: (skill: SkillInfo) => void;
  onViewInstructions?: (skill: SkillInfo) => void;
  onDelete?: (id: string, name: string) => void;
  canManageSkills?: boolean;
  isAdmin?: boolean;
}

export const SkillCard: React.FC<SkillCardProps> = ({
  skill,
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

  const getDomainTheme = (dom: string) => {
    switch (dom.toLowerCase()) {
      case 'flutter':
        return { label: 'Flutter', bg: 'rgba(168, 85, 247, 0.15)', text: '#c084fc', border: 'rgba(168, 85, 247, 0.3)' };
      case 'web':
        return { label: 'Web', bg: 'rgba(6, 182, 212, 0.15)', text: '#22d3ee', border: 'rgba(6, 182, 212, 0.3)' };
      case 'backend':
        return { label: 'Backend', bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: 'rgba(16, 185, 129, 0.3)' };
      case 'security':
        return { label: 'Segurança & OWASP', bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: 'rgba(239, 68, 68, 0.3)' };
      case 'qa':
        return { label: 'QA & Testes', bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' };
      case 'data':
        return { label: 'Dados & BI', bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa', border: 'rgba(59, 130, 246, 0.3)' };
      case 'ops':
        return { label: 'DevOps & Infra', bg: 'rgba(139, 92, 246, 0.15)', text: '#a78bfa', border: 'rgba(139, 92, 246, 0.3)' };
      default:
        return { label: dom.toUpperCase(), bg: 'rgba(255, 255, 255, 0.08)', text: '#e4e4e7', border: 'rgba(255, 255, 255, 0.15)' };
    }
  };

  const domain = getDomainTheme(skill.domain);

  // Mapeia agentes atribuídos aos 26 especialistas
  const assigned = (skill.assigned_agents || []).map((role) => {
    const ag = ALL_26_AGENTS.find((a) => a.role === role);
    return ag || {
      role,
      name: role.replace(/_/g, ' '),
      color: '#0284c7',
      categoryLabel: 'Especialista',
    };
  });

  const visibleAvatars = assigned.slice(0, 4);
  const remainingCount = Math.max(0, assigned.length - 4);

  return (
    <div
      className="glass-card"
      style={{
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: '14px',
        borderRadius: '14px',
        backgroundColor: '#18181b',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
        transition: 'border-color 0.2s ease, transform 0.2s ease',
      }}
    >
      <div>
        {/* Top Badges & Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '0.70rem',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '6px',
                backgroundColor: domain.bg,
                color: domain.text,
                border: `1px solid ${domain.border}`,
              }}
            >
              {domain.label}
            </span>

            <span
              style={{
                fontSize: '0.68rem',
                color: '#71717a',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                padding: '2px 6px',
                borderRadius: '4px',
                fontWeight: 500,
              }}
            >
              v{skill.version}
            </span>

            {skill.origin && (skill.origin.includes('github') || skill.origin === 'imported_ecc') ? (
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(168, 85, 247, 0.15)',
                  color: '#c084fc',
                  border: '1px solid rgba(168, 85, 247, 0.3)',
                }}
              >
                ECC Oficial
              </span>
            ) : isPrivateSkill ? (
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                }}
              >
                Custom
              </span>
            ) : null}
          </div>

          {/* Toggle Switch */}
          {canManageThisSkill ? (
            <button
              type="button"
              onClick={() => onToggle(skill.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '0.74rem',
                fontWeight: 600,
                padding: '3px 9px',
                borderRadius: '999px',
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                backgroundColor: isApproved ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                color: isApproved ? '#34d399' : '#a1a1aa',
                border: isApproved ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(255, 255, 255, 0.12)',
              }}
              title={isApproved ? 'Habilidade ativa - clique para desativar' : 'Habilidade inativa - clique para ativar'}
            >
              {isApproved ? <CheckCircle size={13} color="#34d399" /> : <XCircle size={13} color="#71717a" />}
              <span>{isApproved ? 'Ativa' : 'Desativada'}</span>
            </button>
          ) : (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.72rem',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '999px',
                backgroundColor: isApproved ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.05)',
                color: isApproved ? '#34d399' : '#71717a',
              }}
            >
              {isApproved ? '● Ativa' : '○ Desativada'}
            </span>
          )}
        </div>

        {/* Title */}
        <h4
          style={{
            fontSize: '0.98rem',
            fontWeight: 600,
            color: '#f5f5f5',
            margin: '12px 0 4px 0',
            lineHeight: 1.35,
          }}
        >
          {skill.name}
        </h4>

        {/* Description */}
        <p
          style={{
            fontSize: '0.80rem',
            color: '#a1a1aa',
            margin: 0,
            lineHeight: 1.45,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {skill.description}
        </p>

        {/* Tools Badges */}
        {skill.allowed_tools && skill.allowed_tools.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '10px', flexWrap: 'wrap' }}>
            <Wrench size={11} color="#71717a" />
            {skill.allowed_tools.slice(0, 3).map((tool) => (
              <span
                key={tool}
                style={{
                  fontSize: '0.66rem',
                  fontFamily: 'monospace',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  color: '#d4d4d8',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                {tool}
              </span>
            ))}
            {skill.allowed_tools.length > 3 && (
              <span style={{ fontSize: '0.65rem', color: '#71717a' }}>
                +{skill.allowed_tools.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Footer: Assigned Agent Avatars & Actions */}
      <div
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          paddingTop: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        {/* Avatars */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {visibleAvatars.map((ag, i) => (
              <div
                key={ag.role}
                title={`${ag.name} (${'categoryLabel' in ag && ag.categoryLabel ? ag.categoryLabel : 'Especialista'})`}
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '6px',
                  backgroundColor: ag.color || '#0284c7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  marginLeft: i > 0 ? '-6px' : 0,
                  border: '2px solid #18181b',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                  cursor: 'pointer',
                }}
              >
                {ag.name.charAt(0)}
              </div>
            ))}
            {remainingCount > 0 && (
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#a1a1aa',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  marginLeft: '-6px',
                  border: '2px solid #18181b',
                }}
              >
                +{remainingCount}
              </div>
            )}
          </div>

          <span style={{ fontSize: '0.74rem', color: '#71717a', fontWeight: 500 }}>
            {assigned.length} {assigned.length === 1 ? 'Especialista' : 'Especialistas'}
          </span>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {onViewInstructions && (
            <button
              type="button"
              onClick={() => onViewInstructions(skill)}
              className="btn btn-ghost"
              style={{
                fontSize: '0.74rem',
                padding: '4px 8px',
                borderRadius: '6px',
                color: '#38bdf8',
                backgroundColor: 'rgba(56, 189, 248, 0.08)',
              }}
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
              className="btn btn-ghost"
              style={{
                fontSize: '0.74rem',
                padding: '4px 8px',
                borderRadius: '6px',
                color: '#d4d4d8',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
              }}
            >
              <Users size={12} />
              <span>Vincular</span>
            </button>
          )}

          {onDelete && canManageThisSkill && isPrivateSkill && (
            <button
              type="button"
              onClick={() => onDelete(skill.id, skill.name)}
              className="btn btn-ghost"
              style={{
                fontSize: '0.74rem',
                padding: '4px 6px',
                borderRadius: '6px',
                color: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
              }}
              title="Excluir habilidade customizada"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
