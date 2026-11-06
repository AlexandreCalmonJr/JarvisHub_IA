import React from 'react';
import { FolderGit2, Shield } from 'lucide-react';

export const ProjectWorkspaceView: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Project Workspace</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
          Análise e gestão de repositórios locais existentes em modo estritamente Read-Only ou Edit-Approved.
        </p>
      </div>

      {/* Projeto Registado Ativo */}
      <div style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              backgroundColor: 'rgba(99, 102, 241, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <FolderGit2 size={22} color="var(--accent-color)" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>demo_flutter_app</h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                workspace/demo_flutter_app • Branch: <code>main</code>
              </span>
            </div>
          </div>
          <span className="badge badge-success">Read-Only Ativo</span>
        </div>

        {/* Resumo de Inventário */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          padding: '16px',
          backgroundColor: 'var(--bg-tertiary)',
          borderRadius: '8px',
        }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Tipo de Projeto</span>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginTop: '2px' }}>Flutter / Dart</div>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Ponto de Entrada</span>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginTop: '2px' }}><code>lib/main.dart</code></div>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Manifesto</span>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginTop: '2px' }}><code>pubspec.yaml</code></div>
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Integridade</span>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginTop: '2px', color: 'var(--success-color)' }}>
              100% Inalterado
            </div>
          </div>
        </div>

        {/* Dependências e Arquitetura */}
        <div>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '10px' }}>
            Principais Dependências Detetadas
          </h4>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ padding: '6px 12px', backgroundColor: 'var(--bg-primary)', borderRadius: '6px', fontSize: '0.8rem', border: '1px solid var(--border-color)' }}>
              flutter (sdk: flutter)
            </span>
            <span style={{ padding: '6px 12px', backgroundColor: 'var(--bg-primary)', borderRadius: '6px', fontSize: '0.8rem', border: '1px solid var(--border-color)' }}>
              cupertino_icons: ^1.0.8
            </span>
            <span style={{ padding: '6px 12px', backgroundColor: 'var(--bg-primary)', borderRadius: '6px', fontSize: '0.8rem', border: '1px solid var(--border-color)' }}>
              http: ^1.2.2
            </span>
          </div>
        </div>

        {/* Diretriz de Escrita e Git Worktree */}
        <div style={{
          padding: '14px 16px',
          backgroundColor: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '0.85rem',
        }}>
          <Shield size={20} color="var(--success-color)" />
          <span>
            <b>Proteção Ativa:</b> Qualquer melhoria ou patch de código será gerado numa branch isolada (<code>jarvis/task-xxx</code>) com diff prévio e aprovação humana obrigatória.
          </span>
        </div>
      </div>
    </div>
  );
};
