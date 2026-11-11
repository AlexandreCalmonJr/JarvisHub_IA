import React from 'react';
import { Users, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { SkillInfo } from '../../types';

interface SkillCardProps {
  skill: SkillInfo;
  onToggle: (id: string) => void;
  onEditAgents: (skill: SkillInfo) => void;
  onDelete?: (id: string, name: string) => void;
  canManageSkills?: boolean;
  isAdmin?: boolean;
}

export const SkillCard: React.FC<SkillCardProps> = ({ skill, onToggle, onEditAgents, onDelete, canManageSkills = false, isAdmin = false }) => {
  const isApproved = skill.is_approved && !skill.is_revoked;
  const isPrivateSkill = skill.origin === 'user_created' || skill.origin === 'imported_ecc' || skill.id.startsWith('user_');
  const canManageThisSkill = canManageSkills && (isAdmin || isPrivateSkill);

  const getDomainBadge = (dom: string) => {
    switch (dom) {
      case 'flutter':
        return <span className="badge badge-purple">Flutter</span>;
      case 'web':
        return <span className="badge badge-info">Web</span>;
      case 'backend':
        return <span className="badge badge-info">Backend</span>;
      case 'security':
        return <span className="badge badge-danger">Segurança</span>;
      case 'qa':
        return <span className="badge badge-warning">QA & Testes</span>;
      default:
        return <span className="badge badge-secondary">{dom}</span>;
    }
  };

  return (
    <div
      className="glass-card"
      style={{
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: '14px',
        border: '1px solid var(--border-color)',
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {getDomainBadge(skill.domain)}
            <span
              style={{
                fontSize: '0.72rem',
                color: 'var(--text-muted)',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                padding: '2px 6px',
                borderRadius: '4px',
              }}
            >
              v{skill.version}
            </span>
            {skill.origin && skill.origin.includes('github') && (
              <span className="badge badge-purple" style={{ fontSize: '0.68rem' }}>
                ECC Importada
              </span>
            )}
          </div>

          {canManageThisSkill ? (
            <button
              type="button"
              onClick={() => onToggle(skill.id)}
              className={`btn ${isApproved ? 'badge-success' : 'badge-danger'}`}
              style={{
                fontSize: '0.74rem',
                padding: '3px 9px',
                cursor: 'pointer',
                border: isApproved ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)',
              }}
              title={isApproved ? 'Skill ativa - clique para desativar' : 'Skill inativa - clique para ativar'}
            >
              {isApproved ? <CheckCircle size={13} /> : <XCircle size={13} />}
              <span>{isApproved ? 'Ativa' : 'Desativada'}</span>
            </button>
          ) : (
            <span className={`badge ${isApproved ? 'badge-success' : 'badge-secondary'}`}>
              {isApproved ? 'Ativa' : 'Desativada'}
            </span>
          )}
        </div>

        <h4 style={{ fontSize: '0.98rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '10px' }}>
          {skill.name}
        </h4>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: '1.45' }}>
          {skill.description}
        </p>
      </div>

      {/* Agentes Vinculados */}
      <div
        style={{
          borderTop: '1px solid var(--border-color)',
          paddingTop: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <Users size={14} color="var(--text-muted)" />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {(skill.assigned_agents || []).length} Especialistas
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {canManageThisSkill && <button
            onClick={() => onEditAgents(skill)}
            className="btn btn-ghost"
            style={{ fontSize: '0.75rem', padding: '4px 8px' }}
          >
            Vincular Agentes
          </button>}
          {onDelete && canManageThisSkill && isPrivateSkill && (
            <button
              onClick={() => onDelete(skill.id, skill.name)}
              className="btn btn-ghost"
              style={{ fontSize: '0.75rem', padding: '4px 7px', color: 'var(--danger-color)' }}
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
