import React from 'react';
import { Modal } from '../../shared/common/Modal';

interface FolderIndexModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderPath: string;
  setFolderPath: (path: string) => void;
  folderCategory: string;
  setFolderCategory: (cat: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  indexing: boolean;
}

export const FolderIndexModal: React.FC<FolderIndexModalProps> = ({
  isOpen,
  onClose,
  folderPath,
  setFolderPath,
  folderCategory,
  setFolderCategory,
  onSubmit,
  indexing,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Indexar Pasta do Servidor no Vault">
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label htmlFor="vault-folder-path" className="user-profile-field-label">
            Caminho físico da pasta no servidor JARVIS
          </label>
          <input
            id="vault-folder-path"
            type="text"
            className="jarvis-input"
            placeholder="Ex: /srv/projetos/documentacao ou D:\Manuais"
            value={folderPath}
            onChange={(e) => setFolderPath(e.target.value)}
            required
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label htmlFor="vault-folder-category" className="user-profile-field-label">
            Categoria / tag de domínio
          </label>
          <input
            id="vault-folder-category"
            type="text"
            className="jarvis-input"
            placeholder="Ex: arquitetura, regras_negocio, apis..."
            value={folderCategory}
            onChange={(e) => setFolderCategory(e.target.value)}
          />
        </div>

        <div className="jarvis-callout jarvis-callout--info">
          O JARVIS percorrerá uma pasta acessível no servidor, recursivamente. Em instalações remotas, este caminho não aponta para o disco do seu computador. Apenas pastas de projetos e uploads autorizados da sua conta serão aceitas.
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '4px' }}>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">
            Cancelar
          </button>
          <button type="submit" disabled={indexing} className="btn btn-primary btn-sm">
            {indexing ? 'Indexando arquivos…' : 'Iniciar indexação'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

interface TextSnippetModalProps {
  isOpen: boolean;
  onClose: () => void;
  textDocName: string;
  setTextDocName: (name: string) => void;
  textContent: string;
  setTextContent: (content: string) => void;
  textCategory: string;
  setTextCategory: (cat: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  indexing: boolean;
}

export const TextSnippetModal: React.FC<TextSnippetModalProps> = ({
  isOpen,
  onClose,
  textDocName,
  setTextDocName,
  textContent,
  setTextContent,
  textCategory,
  setTextCategory,
  onSubmit,
  indexing,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Adicionar Anotação / Texto Direto">
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label htmlFor="vault-snippet-title" className="user-profile-field-label">
            Título do documento
          </label>
          <input
            id="vault-snippet-title"
            type="text"
            className="jarvis-input"
            placeholder="Ex: Regras de Negócio do Projeto X"
            value={textDocName}
            onChange={(e) => setTextDocName(e.target.value)}
            required
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label htmlFor="vault-snippet-category" className="user-profile-field-label">
            Categoria
          </label>
          <input
            id="vault-snippet-category"
            type="text"
            className="jarvis-input"
            placeholder="Ex: arquitetura, requisitos, backend..."
            value={textCategory}
            onChange={(e) => setTextCategory(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label htmlFor="vault-snippet-content" className="user-profile-field-label">
            Conteúdo da anotação
          </label>
          <textarea
            id="vault-snippet-content"
            rows={8}
            className="jarvis-textarea"
            placeholder="Cole ou digite o texto técnico, requisitos ou decisões arquiteturais aqui..."
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            required
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '4px' }}>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">
            Cancelar
          </button>
          <button type="submit" disabled={indexing} className="btn btn-primary btn-sm">
            {indexing ? 'Salvando…' : 'Salvar no Vault'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
