import React from 'react';
import { FileText, Trash2, BookOpen, Upload, RefreshCw } from 'lucide-react';
import { getCategoryLabel, getFileTypeLabel } from '../../types';

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
    <section style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <h3 style={{ fontSize: '0.96rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          Documentos e Manuais no Vault
        </h3>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          Escopo privado da conta autenticada
        </span>
      </div>

      {loading ? (
        <div role="status" className="jarvis-empty-state">
          <RefreshCw size={22} className="spin" />
          <div className="jarvis-empty-state-title">Carregando inventário de documentos…</div>
        </div>
      ) : error ? (
        <div role="alert" className="jarvis-error-banner">
          {error}
        </div>
      ) : documents.length === 0 ? (
        <div className="jarvis-empty-state">
          <BookOpen size={28} />
          <div className="jarvis-empty-state-title">Nenhum documento indexado na Base de Conhecimento</div>
          <div className="jarvis-empty-state-desc">
            {canManage
              ? 'Faça upload de manuais, ficheiros Markdown ou indexe uma pasta autorizada do servidor. O conteúdo será dividido em blocos semânticos para recuperação contextual.'
              : 'Ainda não existem documentos nesta base de conhecimento da conta.'}
          </div>
          {canManage && (
            <button
              type="button"
              onClick={onSelectFileClick}
              className="btn btn-primary btn-sm"
              style={{ marginTop: '6px' }}
            >
              <Upload size={14} />
              <span>Selecionar primeiro arquivo</span>
            </button>
          )}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
            gap: '12px',
          }}
        >
          {documents.map((doc, index) => {
            const chunks = Number(doc.total_chunks) || 0;
            const createdLabel =
              doc.created_at && !Number.isNaN(new Date(doc.created_at).getTime())
                ? new Date(doc.created_at).toLocaleString('pt-PT')
                : 'Data indisponível';

            return (
              <article
                key={doc.id || `${doc.doc_name || 'doc'}-${index}`}
                className="jarvis-settings-card"
                style={{ padding: '16px', justifyContent: 'space-between', gap: '12px' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <FileText size={16} color="var(--accent-light)" style={{ flexShrink: 0 }} />
                      <span
                        style={{
                          fontSize: '0.88rem',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          wordBreak: 'break-word',
                        }}
                      >
                        {doc.doc_name}
                      </span>
                    </div>

                    {canManage && (
                      <button
                        type="button"
                        onClick={() => onDelete(doc.doc_name)}
                        className="btn btn-danger-ghost btn-icon-sm"
                        title="Excluir do Vault"
                        aria-label={`Excluir ${doc.doc_name} do Vault`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  <div
                    className="jarvis-tabular"
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '0.76rem',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <span style={{ color: 'var(--accent-light)', fontWeight: 600 }}>
                      {getFileTypeLabel(doc.file_type)}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>·</span>
                    <span>{getCategoryLabel(doc.category)}</span>
                    <span style={{ color: 'var(--text-muted)' }}>·</span>
                    <span>{chunks} bloco{chunks === 1 ? '' : 's'}</span>
                    {doc.file_size_formatted && (
                      <>
                        <span style={{ color: 'var(--text-muted)' }}>·</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                          {doc.file_size_formatted}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div
                  className="jarvis-tabular"
                  style={{
                    fontSize: '0.73rem',
                    color: 'var(--text-muted)',
                    paddingTop: '10px',
                    borderTop: '1px solid var(--border-subtle)',
                  }}
                >
                  Indexado em {createdLabel}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
