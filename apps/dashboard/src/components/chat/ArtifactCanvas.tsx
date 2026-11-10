import React, { useState, useMemo } from 'react';
import {
  Code2,
  Globe,
  GitCompare,
  FileCode,
  X,
  Maximize2,
  Minimize2,
  Smartphone,
  Monitor,
  Tablet,
  Copy,
  Check,
  Zap,
  Columns,
  List,
  RotateCcw,
} from 'lucide-react';
import { CodeViewer } from '../common/CodeViewer';
import { writeProjectFile, rollbackWorkspaceProject } from '../../api';
import { notify } from '../common/Toast';

export interface CanvasArtifact {
  title: string;
  projectId?: string;
  filePath?: string;
  content?: string;
  diffContent?: string;
  htmlContent?: string;
  affectedFiles?: string[];
  mode?: string;
  planStatus?: string[];
}

interface ArtifactCanvasProps {
  artifact: CanvasArtifact | null;
  onClose: () => void;
}

interface DiffSplitRow {
  leftNum?: number;
  leftText?: string;
  leftType?: 'del' | 'same' | 'empty';
  rightNum?: number;
  rightText?: string;
  rightType?: 'add' | 'same' | 'empty';
}

function parseUnifiedDiffToSplit(diff: string): DiffSplitRow[] {
  const lines = diff.split('\n');
  const rows: DiffSplitRow[] = [];
  let lNum = 1;
  let rNum = 1;

  for (const raw of lines) {
    if (raw.startsWith('@@')) {
      const match = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        lNum = parseInt(match[1], 10);
        rNum = parseInt(match[2], 10);
      }
      continue;
    }
    if (raw.startsWith('diff') || raw.startsWith('---') || raw.startsWith('+++') || raw.startsWith('index')) {
      continue;
    }

    if (raw.startsWith('-')) {
      rows.push({
        leftNum: lNum++,
        leftText: raw.slice(1),
        leftType: 'del',
        rightType: 'empty',
      });
    } else if (raw.startsWith('+')) {
      const last = rows[rows.length - 1];
      if (last && last.leftType === 'del' && last.rightType === 'empty') {
        last.rightNum = rNum++;
        last.rightText = raw.slice(1);
        last.rightType = 'add';
      } else {
        rows.push({
          leftType: 'empty',
          rightNum: rNum++,
          rightText: raw.slice(1),
          rightType: 'add',
        });
      }
    } else {
      const text = raw.startsWith(' ') ? raw.slice(1) : raw;
      rows.push({
        leftNum: lNum++,
        leftText: text,
        leftType: 'same',
        rightNum: rNum++,
        rightText: text,
        rightType: 'same',
      });
    }
  }
  return rows;
}

export const ArtifactCanvas: React.FC<ArtifactCanvasProps> = ({ artifact, onClose }) => {
  const [activeTab, setActiveTab] = useState<'code' | 'preview' | 'diff' | 'files'>('code');
  const [diffMode, setDiffMode] = useState<'unified' | 'split'>('split');
  const [isWide, setIsWide] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [fidelity, setFidelity] = useState<'wireframe' | 'hifi'>('hifi');
  const [copied, setCopied] = useState(false);
  const [applying, setApplying] = useState(false);
  const [appliedSuccess, setAppliedSuccess] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);

  const splitRows = useMemo(() => {
    if (!artifact?.diffContent) return [];
    return parseUnifiedDiffToSplit(artifact.diffContent);
  }, [artifact?.diffContent]);

  if (!artifact) return null;

  const hasHtml = Boolean(
    artifact.htmlContent ||
    (artifact.filePath && artifact.filePath.endsWith('.html')) ||
    (artifact.content && artifact.content.includes('<!DOCTYPE html>'))
  );

  const htmlSource =
    artifact.htmlContent ||
    (artifact.content && artifact.content.includes('<html') ? artifact.content : null);

  const handleCopy = () => {
    const textToCopy = artifact.content || artifact.diffContent || '';
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleApplyToProject = async () => {
    if (!artifact.projectId || !artifact.filePath || !artifact.content) {
      notify('Para aplicar diretamente, o artefato precisa estar vinculado a um projeto e arquivo.', 'warning');
      return;
    }
    setApplying(true);
    try {
      await writeProjectFile(
        artifact.projectId,
        artifact.filePath,
        artifact.content,
        'Modificação de código aplicada pelo usuário via Artifact Canvas'
      );
      setAppliedSuccess(true);
      notify(`Arquivo '${artifact.filePath}' gravado com sucesso no projeto! Backup .bak criado.`, 'success');
      setTimeout(() => setAppliedSuccess(false), 4000);
    } catch (err: any) {
      notify(`Erro ao aplicar alteração: ${err.message}`, 'error');
    } finally {
      setApplying(false);
    }
  };

  const handleRollback = async () => {
    if (!artifact?.projectId) {
      notify('Projeto não identificado para rollback.', 'warning');
      return;
    }
    setRollingBack(true);
    notify(`Desfazendo última alteração no projeto '${artifact.projectId}' via Git...`, 'info');
    try {
      const res = await rollbackWorkspaceProject(artifact.projectId);
      if (res.status === 'cannot_rollback') {
        notify(res.message || 'Projeto no commit inicial. Sem alterações para reverter.', 'info');
      } else {
        notify(res.message || 'Última alteração desfeita com sucesso no Git!', 'success');
      }
    } catch (err: any) {
      notify(`Erro ao reverter alteração: ${err.message}`, 'error');
    } finally {
      setTimeout(() => setRollingBack(false), 600);
    }
  };

  const getPreviewWidth = () => {
    switch (previewDevice) {
      case 'mobile':
        return '375px';
      case 'tablet':
        return '768px';
      default:
        return '100%';
    }
  };

  const canApply = Boolean(artifact.projectId && artifact.filePath && artifact.content);

  return (
    <div
      style={{
        width: isWide ? '72%' : '52%',
        minWidth: '400px',
        maxWidth: '960px',
        backgroundColor: 'var(--bg-secondary)',
        borderLeft: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        transition: 'width 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        zIndex: 50,
      }}
    >
      {/* Top Header do Canvas */}
      <div
        style={{
          padding: '12px 18px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'var(--bg-secondary)',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: 'rgba(217, 119, 87, 0.15)',
              border: '1px solid rgba(217, 119, 87, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-color)',
              flexShrink: 0,
            }}
          >
            <Code2 size={18} />
          </div>
          <div style={{ overflow: 'hidden' }}>
            <h4
              style={{
                fontSize: '0.92rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {artifact.title || 'Canvas de Código & Artefatos'}
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {artifact.projectId && (
                <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                  <code>workspace/{artifact.projectId}</code>
                </span>
              )}
              {artifact.filePath && (
                <span style={{ fontSize: '0.74rem', color: '#38bdf8', fontFamily: 'monospace' }}>
                  /{artifact.filePath}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Ação Aplicar ao Projeto, Rollback & Controles de Janela */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {canApply && (
            <button
              onClick={handleApplyToProject}
              disabled={applying || appliedSuccess}
              className="btn btn-primary"
              style={{
                fontSize: '0.76rem',
                padding: '5px 12px',
                backgroundColor: appliedSuccess ? '#059669' : undefined,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              title="Grava o código diretamente no arquivo do projeto com backup .bak automático"
            >
              {appliedSuccess ? <Check size={13} /> : <Zap size={13} />}
              <span>{applying ? 'Gravando...' : appliedSuccess ? 'Aplicado ✓' : 'Aplicar ao Projeto'}</span>
            </button>
          )}

          {artifact.projectId && (
            <button
              onClick={handleRollback}
              disabled={rollingBack}
              className="btn btn-secondary"
              style={{
                fontSize: '0.76rem',
                padding: '5px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
              title="Desfazer última alteração de código via Git local"
            >
              <RotateCcw size={13} color="#f59e0b" />
              <span>{rollingBack ? 'Revertendo...' : 'Desfazer (Git)'}</span>
            </button>
          )}

          <button
            onClick={() => setIsWide(!isWide)}
            className="btn btn-ghost"
            style={{ padding: '6px', borderRadius: '6px' }}
            title={isWide ? 'Restaurar largura' : 'Expandir canvas'}
          >
            {isWide ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button
            onClick={onClose}
            className="btn btn-ghost"
            style={{ padding: '6px', borderRadius: '6px' }}
            title="Fechar canvas"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Barra de Abas (Tabs) */}
      <div
        style={{
          padding: '8px 16px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'rgba(13, 19, 34, 0.6)',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', gap: '4px' }}>
          {artifact.content && (
            <button
              onClick={() => setActiveTab('code')}
              className={`btn ${activeTab === 'code' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '0.78rem', padding: '5px 12px' }}
            >
              <FileCode size={14} /> Código
            </button>
          )}

          {hasHtml && (
            <button
              onClick={() => setActiveTab('preview')}
              className={`btn ${activeTab === 'preview' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '0.78rem', padding: '5px 12px' }}
            >
              <Globe size={14} /> Preview Web
            </button>
          )}

          {artifact.diffContent && (
            <button
              onClick={() => setActiveTab('diff')}
              className={`btn ${activeTab === 'diff' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '0.78rem', padding: '5px 12px' }}
            >
              <GitCompare size={14} /> Comparador Diff
            </button>
          )}

          {artifact.affectedFiles && artifact.affectedFiles.length > 0 && (
            <button
              onClick={() => setActiveTab('files')}
              className={`btn ${activeTab === 'files' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ fontSize: '0.78rem', padding: '5px 12px' }}
            >
              Arquivos ({artifact.affectedFiles.length})
            </button>
          )}
        </div>

        {/* Controles contextuais da aba ativa */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Toggle Wireframe vs High-Fidelity (Claude Design Mode) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              borderRadius: '6px',
              padding: '2px',
              border: '1px solid var(--border-color)',
            }}
          >
            <button
              onClick={() => setFidelity('wireframe')}
              className="btn btn-ghost"
              style={{
                fontSize: '0.70rem',
                padding: '2px 8px',
                borderRadius: '4px',
                backgroundColor: fidelity === 'wireframe' ? 'rgba(217, 119, 87, 0.25)' : 'transparent',
                color: fidelity === 'wireframe' ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: fidelity === 'wireframe' ? 600 : 400,
              }}
              title="Modo Wireframe (Baixa Fidelidade / Estrutural)"
            >
              📐 Wireframe
            </button>
            <button
              onClick={() => setFidelity('hifi')}
              className="btn btn-ghost"
              style={{
                fontSize: '0.70rem',
                padding: '2px 8px',
                borderRadius: '4px',
                backgroundColor: fidelity === 'hifi' ? 'rgba(217, 119, 87, 0.25)' : 'transparent',
                color: fidelity === 'hifi' ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: fidelity === 'hifi' ? 600 : 400,
              }}
              title="Modo High-Fidelity (Visual Polido com Sombras e Tokens)"
            >
              ✨ High-Fidelity
            </button>
          </div>
        {activeTab === 'diff' && artifact.diffContent && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              onClick={() => setDiffMode('split')}
              className={`btn ${diffMode === 'split' ? 'btn-secondary' : 'btn-ghost'}`}
              style={{ padding: '4px 8px', fontSize: '0.74rem', display: 'flex', alignItems: 'center', gap: '4px' }}
              title="Comparação Lado a Lado (Antes vs Depois)"
            >
              <Columns size={13} />
              <span>Split-View</span>
            </button>
            <button
              onClick={() => setDiffMode('unified')}
              className={`btn ${diffMode === 'unified' ? 'btn-secondary' : 'btn-ghost'}`}
              style={{ padding: '4px 8px', fontSize: '0.74rem', display: 'flex', alignItems: 'center', gap: '4px' }}
              title="Visão Unificada"
            >
              <List size={13} />
              <span>Unificado</span>
            </button>
          </div>
        )}

        {activeTab === 'preview' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              onClick={() => setPreviewDevice('desktop')}
              className={`btn ${previewDevice === 'desktop' ? 'btn-secondary' : 'btn-ghost'}`}
              style={{ padding: '4px 8px' }}
              title="Desktop"
            >
              <Monitor size={14} />
            </button>
            <button
              onClick={() => setPreviewDevice('tablet')}
              className={`btn ${previewDevice === 'tablet' ? 'btn-secondary' : 'btn-ghost'}`}
              style={{ padding: '4px 8px' }}
              title="Tablet (768px)"
            >
              <Tablet size={14} />
            </button>
            <button
              onClick={() => setPreviewDevice('mobile')}
              className={`btn ${previewDevice === 'mobile' ? 'btn-secondary' : 'btn-ghost'}`}
              style={{ padding: '4px 8px' }}
              title="Mobile (375px)"
            >
              <Smartphone size={14} />
            </button>
          </div>
        )}

        {activeTab === 'code' && artifact.content && (
          <button
            onClick={handleCopy}
            className="btn btn-ghost"
            style={{ fontSize: '0.75rem', padding: '4px 8px', color: copied ? '#34d399' : 'var(--text-secondary)' }}
          >
            {copied ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
            <span>{copied ? 'Copiado' : 'Copiar'}</span>
          </button>
        )}
        </div>
      </div>

      {/* Conteúdo da Aba Ativa */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {activeTab === 'code' && artifact.content && (
          <CodeViewer
            code={artifact.content}
            filename={artifact.filePath || 'artifact.txt'}
            maxHeight="calc(100vh - 220px)"
            showLineNumbers={true}
          />
        )}

        {activeTab === 'preview' && htmlSource && (
          <div
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              backgroundColor: '#020617',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: getPreviewWidth(),
                height: '100%',
                transition: 'width 0.25s ease',
                backgroundColor: '#ffffff',
                boxShadow: previewDevice !== 'desktop' ? '0 12px 36px rgba(0,0,0,0.7)' : 'none',
              }}
            >
              <iframe
                title="Live Web Preview"
                srcDoc={htmlSource}
                sandbox="allow-scripts allow-forms"
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  filter: fidelity === 'wireframe' ? 'grayscale(1) contrast(1.2) brightness(0.96)' : 'none',
                  outline: fidelity === 'wireframe' ? '2px dashed rgba(217, 119, 87, 0.4)' : 'none',
                }}
              />
            </div>
          </div>
        )}

        {activeTab === 'diff' && artifact.diffContent && (
          <div>
            {diffMode === 'split' ? (
              <div
                style={{
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: '#070a12',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.8rem',
                  overflowX: 'auto',
                  maxHeight: 'calc(100vh - 220px)',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Header das Colunas */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    borderBottom: '1px solid var(--border-color)',
                    padding: '6px 12px',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <div style={{ color: '#f87171' }}>Versão Anterior (Original)</div>
                  <div style={{ color: '#34d399' }}>Nova Versão Proposta (JARVIS)</div>
                </div>

                {/* Linhas Lado a Lado */}
                {splitRows.map((row, idx) => {
                  const leftBg =
                    row.leftType === 'del'
                      ? 'rgba(239, 68, 68, 0.18)'
                      : 'transparent';
                  const rightBg =
                    row.rightType === 'add'
                      ? 'rgba(16, 185, 129, 0.18)'
                      : 'transparent';

                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.02)',
                        minHeight: '22px',
                        lineHeight: '20px',
                      }}
                    >
                      {/* Lado Esquerdo */}
                      <div
                        style={{
                          backgroundColor: leftBg,
                          padding: '1px 8px',
                          display: 'flex',
                          gap: '8px',
                          borderRight: '1px solid rgba(255, 255, 255, 0.06)',
                          overflowX: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'pre',
                        }}
                      >
                        <span style={{ color: 'rgba(255,255,255,0.25)', userSelect: 'none', width: '28px', textAlign: 'right' }}>
                          {row.leftNum || ''}
                        </span>
                        <span style={{ color: row.leftType === 'del' ? '#fca5a5' : 'var(--text-secondary)' }}>
                          {row.leftText || ''}
                        </span>
                      </div>

                      {/* Lado Direito */}
                      <div
                        style={{
                          backgroundColor: rightBg,
                          padding: '1px 8px',
                          display: 'flex',
                          gap: '8px',
                          overflowX: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'pre',
                        }}
                      >
                        <span style={{ color: 'rgba(255,255,255,0.25)', userSelect: 'none', width: '28px', textAlign: 'right' }}>
                          {row.rightNum || ''}
                        </span>
                        <span style={{ color: row.rightType === 'add' ? '#86efac' : 'var(--text-primary)' }}>
                          {row.rightText || ''}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                style={{
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: '#070a12',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.82rem',
                  overflowY: 'auto',
                  maxHeight: 'calc(100vh - 220px)',
                  padding: '12px 0',
                }}
              >
                {artifact.diffContent.split('\n').map((line, idx) => {
                  let cls = '';
                  if (line.startsWith('+') && !line.startsWith('+++')) cls = 'diff-line-add';
                  else if (line.startsWith('-') && !line.startsWith('---')) cls = 'diff-line-del';
                  else if (line.startsWith('@@') || line.startsWith('diff')) cls = 'diff-line-info';

                  return (
                    <div
                      key={idx}
                      className={cls}
                      style={{
                        padding: '2px 14px',
                        whiteSpace: 'pre-wrap',
                        lineHeight: '1.5',
                      }}
                    >
                      {line || ' '}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'files' && artifact.affectedFiles && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              ARQUIVOS AFETADOS NESTA OPERAÇÃO
            </span>
            {artifact.affectedFiles.map((file, idx) => (
              <div
                key={idx}
                className="glass-card"
                style={{
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.82rem',
                }}
              >
                <FileCode size={16} color="#818cf8" />
                <span style={{ color: 'var(--text-primary)' }}>{file}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
