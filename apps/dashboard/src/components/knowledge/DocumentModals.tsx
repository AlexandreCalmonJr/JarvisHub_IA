import React from 'react';
import { Modal } from '../common/Modal';

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
    <Modal isOpen={isOpen} onClose={onClose} title="Indexar Diretório Local no Vault">
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '4px' }}>
            Caminho Físico da Pasta no Computador
          </label>
          <input
            type="text"
            placeholder="Ex: C:\MeusProjetos\documentacao ou D:\Manuais"
            value={folderPath}
            onChange={(e) => setFolderPath(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 12px',
              backgroundColor: '#070a12',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '0.86rem',
            }}
            required
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '4px' }}>
            Categoria / Tag de Domínio
          </label>
          <input
            type="text"
            placeholder="Ex: arquitetura, regras_negocio, apis..."
            value={folderCategory}
            onChange={(e) => setFolderCategory(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 12px',
              backgroundColor: '#070a12',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '0.86rem',
            }}
          />
        </div>

        <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
          O JARVIS percorrerá o diretório recursivamente, indexando arquivos de código, markdown e texto (ignorando node_modules e dependências pesadas).
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button type="button" onClick={onClose} className="btn btn-secondary" style={{ fontSize: '0.84rem' }}>
            Cancelar
          </button>
          <button type="submit" disabled={indexing} className="btn btn-primary" style={{ fontSize: '0.84rem' }}>
            {indexing ? 'Indexando Arquivos...' : 'Iniciar Indexação'}
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
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '4px' }}>
            Título do Documento
          </label>
          <input
            type="text"
            placeholder="Ex: Regras de Negócio do Projeto X"
            value={textDocName}
            onChange={(e) => setTextDocName(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 12px',
              backgroundColor: '#070a12',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '0.86rem',
            }}
            required
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '4px' }}>
            Categoria
          </label>
          <input
            type="text"
            placeholder="Ex: arquitetura, requisitos, backend..."
            value={textCategory}
            onChange={(e) => setTextCategory(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 12px',
              backgroundColor: '#070a12',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '0.86rem',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '4px' }}>
            Conteúdo da Anotação
          </label>
          <textarea
            rows={8}
            placeholder="Cole ou digite o texto técnico, requisitos ou decisões arquiteturais aqui..."
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              backgroundColor: '#070a12',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '0.84rem',
            }}
            required
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button type="button" onClick={onClose} className="btn btn-secondary" style={{ fontSize: '0.84rem' }}>
            Cancelar
          </button>
          <button type="submit" disabled={indexing} className="btn btn-primary" style={{ fontSize: '0.84rem' }}>
            {indexing ? 'Salvando...' : 'Salvar no Vault'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
