import React, { useState, useEffect } from 'react';
import { BookOpen, CheckCircle, XCircle, Shield, RefreshCw } from 'lucide-react';
import { fetchSkills, toggleSkill } from '../api';

export const SkillsManagerView: React.FC = () => {
  const [skills, setSkills] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadSkills = async () => {
    setLoading(true);
    try {
      const data = await fetchSkills();
      setSkills(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSkills();
  }, []);

  const handleToggle = async (skillId: string) => {
    try {
      await toggleSkill(skillId);
      loadSkills();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Skills Manager</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Catálogo de conhecimento especializado sob demanda, validação anti-injeção e sandbox.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={loadSkills} disabled={loading}>
          <RefreshCw size={16} /> Atualizar
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
        {skills.map((s) => {
          const isActive = s.is_approved && !s.is_revoked;
          return (
            <div key={s.id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <BookOpen size={18} color="var(--accent-color)" />
                    <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{s.name}</span>
                  </div>
                  <span className={`badge ${isActive ? 'badge-success' : 'badge-danger'}`}>
                    {isActive ? 'Ativa' : 'Desativada'}
                  </span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                  {s.description}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                  <span className="badge badge-info">{s.domain}</span>
                  <span className="badge badge-secondary">v{s.version}</span>
                  <span className="badge badge-secondary" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Shield size={10} /> {s.license}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                <button
                  className={`btn ${isActive ? 'btn-danger' : 'btn-primary'}`}
                  style={{ fontSize: '0.75rem', padding: '6px 12px' }}
                  onClick={() => handleToggle(s.id)}
                >
                  {isActive ? (
                    <>
                      <XCircle size={14} /> Desativar
                    </>
                  ) : (
                    <>
                      <CheckCircle size={14} /> Ativar
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
