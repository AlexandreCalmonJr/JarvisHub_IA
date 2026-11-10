import React, { useState } from 'react';
import { AlertCircle, FolderSearch } from 'lucide-react';
import { Modal } from '../common/Modal';
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
        <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
          Informe o caminho absoluto de qualquer pasta ou projeto no seu computador (ex: <code>C:\meus-projetos\api-python</code> ou <code>D:\workspace\app-java</code>). O JARVIS registrará os arquivos com permissões seguras para auditoria e edição pelo chat.
        </p>

        <div>
          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
            Caminho da Pasta no Computador: *
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="text"
              required
              placeholder="Ex: C:\Users\SeuUsuario\Projetos\meu-backend"
              value={importPath}
              onChange={(e) => setImportPath(e.target.value)}
              style={{
                flex: 1,
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
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
            Nome de Identificação (Opcional):
          </label>
          <input
            type="text"
            placeholder="Ex: API de Autenticação"
            value={importName}
            onChange={(e) => setImportName(e.target.value)}
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
              padding: '10px 14px',
              borderRadius: '8px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#fca5a5',
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertCircle size={15} />
            <span>{importError}</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost"
            disabled={importing}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={importing || !importPath.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <FolderSearch size={15} />
            <span>{importing ? 'Escaneando Pasta...' : 'Anexar e Escanear'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
