import React from 'react';
import { FileText, Trash2, BookOpen, Upload, RefreshCw } from 'lucide-react';

interface DocumentListGridProps {
  documents: any[];
  loading: boolean;
  error?: string | null;
  onDelete: (docName: string) => void;
  canManage?: boolean;
  onSelectFileClick: () => void;
}

export const DocumentListGrid: React.FC<DocumentListGridProps> = ({
  documents,
  loading,
  error,
  onDelete,
  canManage = false,
  onSelectFileClick,
}) => {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '14px',
        }}
      >
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Documentos e Manuais no Vault
        </h3>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          Documentos associados à conta autenticada e processados pelo ambiente JARVIS
        </span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
          <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px' }} />
          Carregando inventário de documentos...
        </div>
      ) : error ? (
        <div role="alert" style={{ padding: '24px', border: '1px solid var(--danger-color)', borderRadius: '10px', color: 'var(--danger-color)', fontSize: '0.86rem' }}>
          {error}
        </div>
      ) : documents.length === 0 ? (
        <div
          className="glass-card"
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            borderRadius: '16px',
            border: '1px dashed rgba(255, 255, 255, 0.15)',
            color: 'var(--text-secondary)',
          }}
        >
          <BookOpen size={40} color="var(--accent-color)" style={{ margin: '0 auto 14px', opacity: 0.8 }} />
          <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px 0' }}>
            Nenhum documento indexado na Base de Conhecimento
          </h4>
          <p
            style={{
              fontSize: '0.84rem',
              maxWidth: '480px',
              margin: '0 auto 16px auto',
              lineHeight: 1.5,
            }}
          >
            {canManage ? 'Faça upload de manuais, ficheiros Markdown ou indexe uma pasta autorizada do servidor. O conteúdo será dividido em blocos semânticos para recuperação contextual.' : 'Ainda não existem documentos nesta base de conhecimento da conta.'}
          </p>
          {canManage && <button
            onClick={onSelectFileClick}
            className="btn btn-primary"
            style={{ fontSize: '0.82rem', padding: '8px 18px' }}
          >
            <Upload size={14} /> Selecionar Primeiro Arquivo
          </button>}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
            gap: '14px',
          }}
        >
          {documents.map((doc) => (
            <div
              key={doc.doc_name}
              className="glass-card"
              style={{
                padding: '16px',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-secondary)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={18} color="var(--accent-color)" />
                    <span
                      style={{
                        fontSize: '0.92rem',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        wordBreak: 'break-all',
                      }}
                    >
                      {doc.doc_name}
                    </span>
                  </div>
                  {canManage && <button
                    type="button"
                    onClick={() => onDelete(doc.doc_name)}
                    className="btn btn-ghost"
                    style={{ padding: '3px', color: 'var(--danger-color)' }}
                    title="Excluir do Vault"
                  >
                    <Trash2 size={14} />
                  </button>}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                  <span className="badge badge-info" style={{ fontSize: '0.68rem' }}>
                    {doc.file_type || 'TXT'}
                  </span>
                  <span className="badge" style={{ fontSize: '0.68rem' }}>
                    {doc.category || 'geral'}
                  </span>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(255, 255, 255, 0.06)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {doc.total_chunks} blocos semânticos
                  </span>
                  {doc.file_size_formatted && (
                    <span
                      style={{
                        fontSize: '0.68rem',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(255, 255, 255, 0.06)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {doc.file_size_formatted}
                    </span>
                  )}
                </div>
              </div>

              <div
                style={{
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                  paddingTop: '8px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                }}
              >
                Indexado em: {new Date(doc.created_at).toLocaleString('pt-PT')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
