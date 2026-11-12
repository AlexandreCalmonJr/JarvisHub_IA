import React, { useState } from 'react';
import {
  FolderGit2,
  FolderPlus,
  FolderSearch,
  AlertCircle,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { importExternalFolder } from '../../api';
import { getProjectTypeLabel } from '../../types';

interface ChatProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableProjects: any[];
  activeProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onProjectsReload: () => Promise<void>;
}

export const ChatProjectModal: React.FC<ChatProjectModalProps> = ({
  isOpen,
  onClose,
  availableProjects,
  activeProjectId,
  onSelectProject,
  onProjectsReload,
}) => {
  const [showImportSubform, setShowImportSubform] = useState(false);
  const [importFolderPath, setImportFolderPath] = useState('');
  const [importFolderName, setImportFolderName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const handleImportFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFolderPath.trim()) return;

    setImporting(true);
    setImportError(null);
    try {
      const res = await importExternalFolder(
        importFolderPath.trim(),
        importFolderName.trim() || undefined
      );
      await onProjectsReload();
      const targetId = res.project?.id || importFolderName.trim() || 'projeto-importado';
      onSelectProject(targetId);
      setShowImportSubform(false);
      setImportFolderPath('');
      setImportFolderName('');
      onClose();
    } catch (err: any) {
      setImportError(err.message || 'Falha ao importar diretório do computador');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Vincular Projeto ou Pasta ao Chat"
      maxWidth="md"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
          Selecione um projeto existente em <code>workspace/</code> ou anexe qualquer pasta do seu computador para que o JARVIS leia, analise e aplique modificações físicas diretamente nos arquivos.
        </p>

        {!showImportSubform ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                PROJETOS REGISTRADOS NO WORKSPACE ({availableProjects.length})
              </span>
              <button
                type="button"
                onClick={() => setShowImportSubform(true)}
                className="btn btn-secondary"
                style={{ fontSize: '0.74rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}
              >
                <FolderPlus size={13} color="#38bdf8" />
                <span>Anexar Pasta Local do PC</span>
              </button>
            </div>

            {availableProjects.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                Nenhum projeto encontrado. Crie um novo pelo chat ou anexe uma pasta existente.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
                {availableProjects.map((p) => {
                  const isSelected = p.id === activeProjectId;
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        onSelectProject(p.id);
                        onClose();
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        backgroundColor: isSelected ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                        border: `1px solid ${isSelected ? 'rgba(99, 102, 241, 0.5)' : 'rgba(255, 255, 255, 0.08)'}`,
                        cursor: 'pointer',
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FolderGit2 size={16} color={isSelected ? '#818cf8' : 'var(--text-secondary)'} />
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#fff' }}>
                              {p.name || p.id}
                            </span>
                            {p.project_type && (
                              <span className="badge badge-info" style={{ fontSize: '0.66rem' }}>
                                {getProjectTypeLabel(p.project_type)}
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                            {p.path || p.root_path}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        className={isSelected ? 'btn btn-primary' : 'btn btn-ghost'}
                        style={{ fontSize: '0.74rem', padding: '4px 10px' }}
                      >
                        {isSelected ? 'Vinculado' : 'Selecionar'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <form onSubmit={handleImportFolder} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                Caminho Absoluto da Pasta no seu Computador: *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: C:\Users\SeuUsuario\Projetos\meu-backend"
                value={importFolderPath}
                onChange={(e) => setImportFolderPath(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#fff',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.84rem',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                Nome de Identificação (Opcional):
              </label>
              <input
                type="text"
                placeholder="Ex: API de Autenticação"
                value={importFolderName}
                onChange={(e) => setImportFolderName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#fff',
                  fontSize: '0.84rem',
                }}
              />
            </div>

            {importError && (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#fca5a5',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <AlertCircle size={14} />
                <span>{importError}</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => setShowImportSubform(false)}
                className="btn btn-ghost"
                disabled={importing}
              >
                Voltar à Lista
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={importing || !importFolderPath.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <FolderSearch size={14} />
                <span>{importing ? 'Anexando...' : 'Anexar e Vincular ao Chat'}</span>
              </button>
            </div>
          </form>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost"
            style={{ fontSize: '0.8rem' }}
          >
            Fechar
          </button>
        </div>
      </div>
    </Modal>
  );
};
