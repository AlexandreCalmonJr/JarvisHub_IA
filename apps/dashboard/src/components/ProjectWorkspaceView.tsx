import React, { useState, useEffect } from 'react';
import { FolderGit2, Shield, FileCode, RefreshCw, CheckCircle } from 'lucide-react';
import { fetchWorkspaceProjects } from '../api';

export const ProjectWorkspaceView: React.FC = () => {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const data = await fetchWorkspaceProjects();
      setProjects(data);
    } catch (e) {
      console.error('Falha ao listar projetos:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Project Workspace</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
            Projetos e websites físicos criados no computador dentro de <code>workspace/</code> com controle de arquivos e modificações.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={loadProjects} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Atualizar Workspace
        </button>
      </div>

      {/* Lista Dinâmica de Projetos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {projects.length === 0 && !loading && (
          <div className="card" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Nenhum projeto encontrado em <code>workspace/</code>. Peça no chat: <i>"Cria um site para mim..."</i>
          </div>
        )}

        {projects.map((proj) => {
          const isWeb = proj.files?.some((f: string) => f.endsWith('.html'));
          const isFlutter = proj.files?.some((f: string) => f.endsWith('.yaml') || f.endsWith('.dart'));

          return (
            <div
              key={proj.id}
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(99, 102, 241, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <FolderGit2 size={24} color="var(--accent-color)" />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>{proj.name}</h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                      workspace/{proj.id}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span className={`badge ${isWeb ? 'badge-primary' : 'badge-success'}`}>
                    {isWeb ? 'Web / HTML5 & CSS' : isFlutter ? 'Flutter / Dart' : 'Projeto Ativo'}
                  </span>
                  <span className="badge badge-secondary">{proj.file_count} arquivos</span>
                </div>
              </div>

              {/* Detalhes de Arquivos Físicos no Computador */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '12px',
                  padding: '16px',
                  backgroundColor: 'var(--bg-tertiary)',
                  borderRadius: '8px',
                }}
              >
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Tipo de Stack</span>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', marginTop: '2px' }}>
                    {isWeb ? 'HTML5 • CSS3 Moderno • Vanilla JS' : isFlutter ? 'Flutter / Dart' : 'Módulos de Código'}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Localização Física</span>
                  <div style={{ fontWeight: 500, fontSize: '0.8rem', marginTop: '2px', color: 'var(--accent-color)', wordBreak: 'break-all' }}>
                    {proj.path}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Status no Sistema</span>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', marginTop: '2px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle size={14} /> Pronto para Edição no Chat
                  </div>
                </div>
              </div>

              {/* Lista de Arquivos Gerados */}
              <div>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileCode size={16} /> Arquivos no Diretório:
                </h4>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {(proj.files || []).map((file: string) => (
                    <span
                      key={file}
                      style={{
                        padding: '4px 10px',
                        backgroundColor: 'var(--bg-primary)',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        border: '1px solid var(--border-color)',
                        fontFamily: 'monospace',
                        color: file.endsWith('.bak') ? 'var(--text-secondary)' : 'var(--text-primary)',
                      }}
                    >
                      {file} {file.endsWith('.bak') && '(backup)'}
                    </span>
                  ))}
                </div>
              </div>

              {/* Alerta de Proteção e Instruções */}
              <div
                style={{
                  padding: '12px 16px',
                  backgroundColor: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontSize: '0.85rem',
                }}
              >
                <Shield size={20} color="var(--success-color)" />
                <span>
                  <b>Modificação Rápida via Chat Ativa:</b> Para editar qualquer arquivo deste projeto, basta pedir no chat (ex: <i>"No {proj.id}, mude a cor para azul"</i> ou <i>"Altere o título para Meu Novo Site"</i>).
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
