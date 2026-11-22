import React, { useState } from 'react';
import { AlertCircle, FolderSearch } from 'lucide-react';
import { Modal } from '../../shared/common/Modal';
import { importExternalFolder } from '../../api';

interface ImportFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
}

export const ImportFolderModal: React.FC<ImportFolderModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [importPath, setImportPath] = useState('');
  const [importName, setImportName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importPath.trim()) return;

    setImporting(true);
    setImportError(null);
    try {
      await importExternalFolder(importPath.trim(), importName.trim() || undefined);
      setImportPath('');
      setImportName('');
      onClose();
      await onSuccess();
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
      title="Anexar Pasta do Computador ao JARVIS"
      maxWidth="md"
    >
      <form onSubmit={handleImportSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
          Informe o caminho absoluto de qualquer pasta ou projeto no seu computador (ex:{' '}
          <code>C:\meus-projetos\api-python</code> ou <code>D:\workspace\app-java</code>). O JARVIS registrará os
          arquivos com permissões seguras para auditoria e edição pelo chat.
        </p>

        <div>
          <label className="user-profile-field-label" htmlFor="import-folder-path">
            Caminho da Pasta no Computador *
          </label>
          <input
            id="import-folder-path"
            type="text"
            required
            placeholder="Ex: C:\Users\SeuUsuario\Projetos\meu-backend"
            value={importPath}
            onChange={(e) => setImportPath(e.target.value)}
            className="jarvis-input"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}
          />
        </div>

        <div>
          <label className="user-profile-field-label" htmlFor="import-folder-name">
            Nome de Identificação (Opcional)
          </label>
          <input
            id="import-folder-name"
            type="text"
            placeholder="Ex: API de Autenticação"
            value={importName}
            onChange={(e) => setImportName(e.target.value)}
            className="jarvis-input"
          />
        </div>

        {importError && (
          <div role="alert" className="jarvis-error-banner">
            <AlertCircle size={15} />
            <span>{importError}</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            disabled={importing}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={importing || !importPath.trim()}
          >
            <FolderSearch size={14} />
            <span>{importing ? 'Escaneando Pasta…' : 'Anexar e Escanear'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
