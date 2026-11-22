import React, { useState, useMemo, useEffect } from 'react';
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
  FileText,
  Presentation,
  Image as ImageIcon,
  Download,
  Sparkles,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Plus,
} from 'lucide-react';
import { CodeViewer } from '../../shared/common/CodeViewer';
import {
  writeProjectFile,
  rollbackWorkspaceProject,
  generateDeliverableArtifact,
} from '../../api';
import {
  exportArtifactToPptx,
  exportArtifactToPdf,
  exportSvgArtifactToPng,
} from '../../services/artifactExporters';
import type { StructuredArtifactPayload } from '../../../server/artifactEngine';
import { useAssistantIdentity } from '../../context/AssistantIdentityContext';
import { notify } from '../../shared/common/Toast';

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
  structuredArtifact?: StructuredArtifactPayload | null;
  studioMode?: boolean;
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
      rows.push({ leftNum: lNum++, leftText: raw.slice(1), leftType: 'del', rightType: 'empty' });
    } else if (raw.startsWith('+')) {
      const last = rows[rows.length - 1];
      if (last && last.leftType === 'del' && last.rightType === 'empty') {
        last.rightNum = rNum++;
        last.rightText = raw.slice(1);
        last.rightType = 'add';
      } else {
        rows.push({ leftType: 'empty', rightNum: rNum++, rightText: raw.slice(1), rightType: 'add' });
      }
    } else {
      const text = raw.startsWith(' ') ? raw.slice(1) : raw;
      rows.push({ leftNum: lNum++, leftText: text, leftType: 'same', rightNum: rNum++, rightText: text, rightType: 'same' });
    }
  }
  return rows;
}

export const ArtifactCanvas: React.FC<ArtifactCanvasProps> = ({ artifact, onClose }) => {
  const { assistantName } = useAssistantIdentity();
  const hasStructured = Boolean(artifact?.structuredArtifact || artifact?.studioMode);

  const [activeTab, setActiveTab] = useState<'studio' | 'code' | 'preview' | 'diff' | 'files'>(
    hasStructured ? 'studio' : 'code'
  );
  const [diffMode, setDiffMode] = useState<'unified' | 'split'>('split');
  const [isWide, setIsWide] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [fidelity, setFidelity] = useState<'wireframe' | 'hifi'>('hifi');
  const [copied, setCopied] = useState(false);
  const [applying, setApplying] = useState(false);
  const [appliedSuccess, setAppliedSuccess] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);

  // Deliverable Studio state (.pptx, .pdf, .png)
  const [deliverable, setDeliverable] = useState<StructuredArtifactPayload | null>(
    artifact?.structuredArtifact || null
  );
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [genKind, setGenKind] = useState<'pptx' | 'pdf' | 'png'>('pptx');
  const [genTopic, setGenTopic] = useState('');
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (artifact?.structuredArtifact) {
      setDeliverable(artifact.structuredArtifact);
      setGenKind(artifact.structuredArtifact.kind);
      setActiveSlideIdx(0);
      setActiveTab('studio');
    } else if (artifact?.studioMode) {
      setActiveTab('studio');
    } else if (artifact?.content) {
      setActiveTab('code');
    } else if (artifact?.diffContent) {
      setActiveTab('diff');
    }
  }, [artifact]);

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

  const handleGenerateDeliverable = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const topic = genTopic.trim();
    if (!topic) {
      notify('Informe o tema do artefato para gerar.', 'warning');
      return;
    }
    setGenerating(true);
    try {
      const created = await generateDeliverableArtifact({
        kind: genKind,
        topic,
        assistant_name: assistantName,
      });
      setDeliverable(created);
      setActiveSlideIdx(0);
      notify(`Artefato ${created.kind.toUpperCase()} "${created.title}" pronto para revisão e download.`, 'success');
    } catch (err: any) {
      notify(err?.message || 'Erro ao gerar artefato.', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadDeliverable = async () => {
    if (!deliverable) return;
    setExporting(true);
    try {
      if (deliverable.kind === 'pptx') {
        await exportArtifactToPptx(deliverable);
        notify('Apresentação PowerPoint (.pptx) baixada com sucesso!', 'success');
      } else if (deliverable.kind === 'pdf') {
        await exportArtifactToPdf(deliverable);
        notify('Documento PDF (.pdf) baixado com sucesso!', 'success');
      } else if (deliverable.kind === 'png') {
        await exportSvgArtifactToPng(deliverable);
        notify('Imagem PNG (.png) baixada em alta definição!', 'success');
      }
    } catch (err: any) {
      notify(err?.message || 'Erro ao exportar arquivo.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const updateSlideField = (slideIndex: number, field: 'title' | 'subtitle' | 'bullets', value: string) => {
    setDeliverable((prev) => {
      if (!prev || !prev.slides) return prev;
      const nextSlides = prev.slides.map((s, idx) => {
        if (idx !== slideIndex) return s;
        if (field === 'bullets') {
          return { ...s, bullets: value.split('\n').map((l) => l.trim()).filter(Boolean) };
        }
        return { ...s, [field]: value };
      });
      return { ...prev, slides: nextSlides };
    });
  };

  const addSlide = () => {
    setDeliverable((prev) => {
      if (!prev || prev.kind !== 'pptx') return prev;
      const nextSlides = [
        ...(prev.slides || []),
        {
          title: 'Novo Slide',
          subtitle: 'Complemento estratégico',
          bullets: ['Ponto-chave 1', 'Ponto-chave 2', 'Próximo passo'],
        },
      ];
      setActiveSlideIdx(nextSlides.length - 1);
      return { ...prev, slides: nextSlides };
    });
  };

  const updateSectionField = (secIdx: number, field: 'heading' | 'body', value: string) => {
    setDeliverable((prev) => {
      if (!prev || !prev.sections) return prev;
      const nextSections = prev.sections.map((sec, idx) => (idx === secIdx ? { ...sec, [field]: value } : sec));
      return { ...prev, sections: nextSections };
    });
  };

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
      notify(`Arquivo '${artifact.filePath}' gravado com sucesso no projeto!`, 'success');
      setTimeout(() => setAppliedSuccess(false), 4000);
    } catch (err: any) {
      notify(`Erro ao aplicar alteração: ${err.message}`, 'error');
    } finally {
      setApplying(false);
    }
  };

  const handleRollback = async () => {
    if (!artifact?.projectId) return;
    setRollingBack(true);
    try {
      const res = await rollbackWorkspaceProject(artifact.projectId);
      notify(res.message || 'Última alteração desfeita no Git.', 'success');
    } catch (err: any) {
      notify(`Erro ao reverter alteração: ${err.message}`, 'error');
    } finally {
      setTimeout(() => setRollingBack(false), 500);
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
  const currentSlide = deliverable?.slides?.[activeSlideIdx] || null;

  return (
    <div
      data-testid="artifact-canvas-panel"
      style={{
        flex: isWide ? '0 0 64%' : '0 0 48%',
        width: isWide ? '64%' : '48%',
        minWidth: '380px',
        maxWidth: '760px',
        backgroundColor: 'var(--bg-secondary)',
        borderLeft: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        boxSizing: 'border-box',
        transition: 'flex-basis 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        zIndex: 50,
      }}
    >
      {/* Top Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'var(--bg-secondary)',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: 'rgba(249, 115, 22, 0.14)',
              border: '1px solid rgba(249, 115, 22, 0.32)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-light)',
              flexShrink: 0,
            }}
          >
            {deliverable?.kind === 'pptx' ? (
              <Presentation size={17} />
            ) : deliverable?.kind === 'pdf' ? (
              <FileText size={17} />
            ) : deliverable?.kind === 'png' ? (
              <ImageIcon size={17} />
            ) : (
              <Code2 size={17} />
            )}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <h4
              style={{
                fontSize: '0.92rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                margin: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {deliverable?.title || artifact.title || 'Painel de Artefatos Vivos'}
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {deliverable ? (
                <>
                  <span style={{ color: 'var(--accent-light)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    .{deliverable.kind.toUpperCase()}
                  </span>
                  <span>·</span>
                  <span>{deliverable.model_used}</span>
                </>
              ) : (
                <span>{artifact.filePath || 'Estúdio de Entregáveis & Código'}</span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {deliverable && activeTab === 'studio' && (
            <button
              type="button"
              data-testid={`download-${deliverable.kind}-btn`}
              onClick={handleDownloadDeliverable}
              disabled={exporting}
              className="btn btn-primary btn-xs"
            >
              {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              <span>Baixar .{deliverable.kind}</span>
            </button>
          )}

          {canApply && (
            <button
              type="button"
              onClick={handleApplyToProject}
              disabled={applying || appliedSuccess}
              className={`btn btn-xs ${appliedSuccess ? 'btn-success' : 'btn-primary'}`}
            >
              {appliedSuccess ? <Check size={13} /> : <Zap size={13} />}
              <span>{applying ? 'Gravando...' : appliedSuccess ? 'Aplicado' : 'Aplicar'}</span>
            </button>
          )}

          {artifact.projectId && (
            <button type="button" onClick={handleRollback} disabled={rollingBack} className="btn btn-secondary btn-xs">
              <RotateCcw size={13} color="#f59e0b" />
              <span>Git</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsWide(!isWide)}
            className="btn btn-ghost btn-icon-sm"
            aria-label={isWide ? 'Restaurar largura' : 'Expandir canvas'}
          >
            {isWide ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-icon-sm"
            aria-label="Fechar painel de artefatos"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Tabs Bar */}
      <div
        style={{
          padding: '8px 14px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'var(--bg-tertiary)',
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setActiveTab('studio')}
            className={`btn btn-xs ${activeTab === 'studio' ? 'btn-primary' : 'btn-ghost'}`}
          >
            <Sparkles size={13} /> Entregáveis (.PPTX / .PDF / .PNG)
          </button>
          {artifact.content && (
            <button
              type="button"
              onClick={() => setActiveTab('code')}
              className={`btn btn-xs ${activeTab === 'code' ? 'btn-primary' : 'btn-ghost'}`}
            >
              <FileCode size={13} /> Código
            </button>
          )}
          {hasHtml && (
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`btn btn-xs ${activeTab === 'preview' ? 'btn-primary' : 'btn-ghost'}`}
            >
              <Globe size={13} /> Preview Web
            </button>
          )}
          {artifact.diffContent && (
            <button
              type="button"
              onClick={() => setActiveTab('diff')}
              className={`btn btn-xs ${activeTab === 'diff' ? 'btn-primary' : 'btn-ghost'}`}
            >
              <GitCompare size={13} /> Diff
            </button>
          )}
          {artifact.affectedFiles && artifact.affectedFiles.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('files')}
              className={`btn btn-xs ${activeTab === 'files' ? 'btn-primary' : 'btn-ghost'}`}
            >
              Arquivos ({artifact.affectedFiles.length})
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {activeTab === 'diff' && artifact.diffContent && (
            <>
              <button
                type="button"
                onClick={() => setDiffMode('split')}
                className={`btn btn-xs ${diffMode === 'split' ? 'btn-secondary is-active' : 'btn-ghost'}`}
              >
                <Columns size={12} /> Split
              </button>
              <button
                type="button"
                onClick={() => setDiffMode('unified')}
                className={`btn btn-xs ${diffMode === 'unified' ? 'btn-secondary is-active' : 'btn-ghost'}`}
              >
                <List size={12} /> Unificado
              </button>
            </>
          )}
          {activeTab === 'preview' && (
            <>
              <button type="button" onClick={() => setFidelity(fidelity === 'hifi' ? 'wireframe' : 'hifi')} className="btn btn-ghost btn-xs">
                {fidelity === 'hifi' ? 'Hi-Fi' : 'Wireframe'}
              </button>
              <button type="button" onClick={() => setPreviewDevice('desktop')} className="btn btn-ghost btn-icon-sm" aria-label="Desktop">
                <Monitor size={13} />
              </button>
              <button type="button" onClick={() => setPreviewDevice('tablet')} className="btn btn-ghost btn-icon-sm" aria-label="Tablet">
                <Tablet size={13} />
              </button>
              <button type="button" onClick={() => setPreviewDevice('mobile')} className="btn btn-ghost btn-icon-sm" aria-label="Mobile">
                <Smartphone size={13} />
              </button>
            </>
          )}
          {activeTab === 'code' && artifact.content && (
            <button type="button" onClick={handleCopy} className={`btn btn-xs ${copied ? 'btn-success' : 'btn-ghost'}`}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
              <span>{copied ? 'Copiado' : 'Copiar'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Active Tab Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {activeTab === 'studio' && (
          <>
            {/* Fábrica Rápida de Entregáveis */}
            <form
              onSubmit={handleGenerateDeliverable}
              style={{
                padding: '12px',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Fábrica de Artefatos Reais
                </span>
                <div className="jarvis-segmented">
                  <button
                    type="button"
                    data-testid="artifact-kind-pptx"
                    onClick={() => setGenKind('pptx')}
                    className={`jarvis-segmented-btn ${genKind === 'pptx' ? 'is-active' : ''}`}
                  >
                    Slides .PPTX
                  </button>
                  <button
                    type="button"
                    data-testid="artifact-kind-pdf"
                    onClick={() => setGenKind('pdf')}
                    className={`jarvis-segmented-btn ${genKind === 'pdf' ? 'is-active' : ''}`}
                  >
                    Relatório .PDF
                  </button>
                  <button
                    type="button"
                    data-testid="artifact-kind-png"
                    onClick={() => setGenKind('png')}
                    className={`jarvis-segmented-btn ${genKind === 'png' ? 'is-active' : ''}`}
                  >
                    Poster .PNG
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  data-testid="artifact-topic-input"
                  aria-label="Tema do artefato"
                  value={genTopic}
                  onChange={(e) => setGenTopic(e.target.value)}
                  placeholder="Ex.: Plano Estratégico Q3 de IA Híbrida & Segurança"
                  className="jarvis-input"
                  style={{ flex: 1, fontSize: '0.82rem', padding: '8px 10px' }}
                />
                <button
                  type="submit"
                  data-testid="generate-artifact-btn"
                  disabled={generating}
                  className="btn btn-primary btn-sm"
                >
                  {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  <span>{generating ? 'Gerando...' : 'Gerar'}</span>
                </button>
              </div>
            </form>

            {/* Preview + Surgical Editor for PPTX */}
            {deliverable?.kind === 'pptx' && deliverable.slides && deliverable.slides.length > 0 && currentSlide && (
              <div data-testid="pptx-preview-studio" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* 16:9 Obsidian Slide Stage */}
                <div
                  style={{
                    minHeight: '250px',
                    width: '100%',
                    boxSizing: 'border-box',
                    borderRadius: 'var(--radius-lg)',
                    background: 'linear-gradient(135deg, #0b0d12 0%, #12161f 62%, #1d1510 100%)',
                    border: '1px solid rgba(249, 115, 22, 0.45)',
                    padding: '18px 22px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '10px',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '5px', backgroundColor: '#f97316' }} />
                  <div>
                    <div style={{ fontSize: '0.68rem', color: '#fb923c', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.06em' }}>
                      SLIDE {activeSlideIdx + 1} / {deliverable.slides.length} · {deliverable.title.toUpperCase()}
                    </div>
                    <h3 style={{ margin: '6px 0 3px', fontSize: '1.18rem', fontWeight: 700, color: '#f3f4f6', lineHeight: 1.25 }}>
                      {currentSlide.title}
                    </h3>
                    {currentSlide.subtitle && (
                      <div style={{ fontSize: '0.8rem', color: '#fb923c', fontWeight: 500 }}>
                        {currentSlide.subtitle}
                      </div>
                    )}
                  </div>

                  <ul style={{ margin: '6px 0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '5px', color: '#e5e7eb', fontSize: '0.8rem', lineHeight: 1.45 }}>
                    {currentSlide.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.68rem', color: '#9ca3af', fontFamily: 'var(--font-mono)' }}>
                    <span>{deliverable.author} AI Hub</span>
                    <span>Exportável em PowerPoint (.pptx)</span>
                  </div>
                </div>

                {/* Slide Navigator */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      disabled={activeSlideIdx <= 0}
                      onClick={() => setActiveSlideIdx((i) => Math.max(0, i - 1))}
                      className="btn btn-secondary btn-xs"
                      aria-label="Slide anterior"
                    >
                      <ChevronLeft size={13} /> Anterior
                    </button>
                    <button
                      type="button"
                      disabled={activeSlideIdx >= deliverable.slides.length - 1}
                      onClick={() => setActiveSlideIdx((i) => Math.min((deliverable.slides?.length || 1) - 1, i + 1))}
                      className="btn btn-secondary btn-xs"
                      aria-label="Próximo slide"
                    >
                      Próximo <ChevronRight size={13} />
                    </button>
                  </div>
                  <button type="button" onClick={addSlide} className="btn btn-ghost btn-xs">
                    <Plus size={13} /> Adicionar Slide
                  </button>
                </div>

                {/* Inline Surgical Slide Editor */}
                <div
                  style={{
                    padding: '12px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <span style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                    Edição Cirúrgica · Slide {activeSlideIdx + 1}
                  </span>
                  <input
                    type="text"
                    aria-label="Título do slide atual"
                    data-testid="slide-title-editor"
                    value={currentSlide.title}
                    onChange={(e) => updateSlideField(activeSlideIdx, 'title', e.target.value)}
                    className="jarvis-input"
                    style={{ fontSize: '0.82rem', padding: '7px 10px' }}
                  />
                  <input
                    type="text"
                    aria-label="Subtítulo do slide atual"
                    value={currentSlide.subtitle || ''}
                    onChange={(e) => updateSlideField(activeSlideIdx, 'subtitle', e.target.value)}
                    className="jarvis-input"
                    style={{ fontSize: '0.78rem', padding: '6px 10px' }}
                    placeholder="Subtítulo opcional"
                  />
                  <textarea
                    rows={4}
                    aria-label="Tópicos do slide atual"
                    value={currentSlide.bullets.join('\n')}
                    onChange={(e) => updateSlideField(activeSlideIdx, 'bullets', e.target.value)}
                    className="jarvis-input"
                    style={{ fontSize: '0.78rem', padding: '8px 10px', resize: 'vertical' }}
                  />
                </div>
              </div>
            )}

            {/* Preview + Surgical Editor for PDF */}
            {deliverable?.kind === 'pdf' && deliverable.sections && (
              <div data-testid="pdf-preview-studio" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div
                  style={{
                    padding: '18px 20px',
                    borderRadius: 'var(--radius-lg)',
                    backgroundColor: '#12161f',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                  }}
                >
                  <div style={{ borderBottom: '2px solid #f97316', paddingBottom: '10px' }}>
                    <div style={{ fontSize: '0.7rem', color: '#fb923c', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                      DOCUMENTO DIAGRAMADO · EXPORTAÇÃO PDF
                    </div>
                    <h3 style={{ margin: '4px 0 2px', fontSize: '1.15rem', fontWeight: 700, color: '#f3f4f6' }}>
                      {deliverable.title}
                    </h3>
                    <div style={{ fontSize: '0.78rem', color: '#9ca3af' }}>{deliverable.subtitle}</div>
                  </div>

                  {deliverable.sections.map((sec, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        paddingBottom: '10px',
                        borderBottom: '1px solid var(--border-subtle)',
                      }}
                    >
                      <input
                        type="text"
                        aria-label={`Título da seção ${idx + 1}`}
                        value={sec.heading}
                        onChange={(e) => updateSectionField(idx, 'heading', e.target.value)}
                        className="jarvis-input"
                        style={{ fontSize: '0.86rem', fontWeight: 700, padding: '6px 9px' }}
                      />
                      <textarea
                        rows={3}
                        aria-label={`Texto da seção ${idx + 1}`}
                        value={sec.body}
                        onChange={(e) => updateSectionField(idx, 'body', e.target.value)}
                        className="jarvis-input"
                        style={{ fontSize: '0.78rem', padding: '7px 9px', lineHeight: 1.5 }}
                      />
                      {Array.isArray(sec.highlights) && sec.highlights.length > 0 && (
                        <ul style={{ margin: '2px 0 0 18px', padding: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {sec.highlights.map((h, hIdx) => (
                            <li key={hIdx}>{h}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Preview for PNG Artwork */}
            {deliverable?.kind === 'png' && deliverable.svg_markup && (
              <div data-testid="png-preview-studio" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div
                  style={{
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                    border: '1px solid var(--border-accent)',
                    backgroundColor: '#0b0d12',
                  }}
                >
                  <img
                    src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(deliverable.svg_markup)}`}
                    alt={deliverable.title}
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                  />
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Pronto para download nativo em <strong>PNG (1200×675 px)</strong>.
                </div>
              </div>
            )}

            {!deliverable && (
              <div
                style={{
                  padding: '24px 18px',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px dashed var(--border-color)',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: '0.82rem',
                  lineHeight: 1.55,
                }}
              >
                Escolha um formato acima (<strong>Slides .PPTX</strong>, <strong>Relatório .PDF</strong> ou <strong>Poster .PNG</strong>), digite o tema e clique em <strong>Gerar</strong> para visualizar, editar e baixar o arquivo real.
              </div>
            )}
          </>
        )}

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
              backgroundColor: 'var(--bg-input)',
              borderRadius: '12px',
              border: '1px solid var(--border-color)',
              overflow: 'hidden',
            }}
          >
            <div style={{ width: getPreviewWidth(), height: '100%', backgroundColor: '#ffffff' }}>
              <iframe
                title="Live Web Preview"
                srcDoc={htmlSource}
                sandbox="allow-scripts allow-forms"
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  filter: fidelity === 'wireframe' ? 'grayscale(1) contrast(1.2) brightness(0.96)' : 'none',
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
                  backgroundColor: 'var(--bg-input)',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.8rem',
                  overflowX: 'auto',
                  maxHeight: 'calc(100vh - 220px)',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    borderBottom: '1px solid var(--border-color)',
                    padding: '6px 12px',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                  }}
                >
                  <div style={{ color: '#f87171' }}>Anterior</div>
                  <div style={{ color: '#34d399' }}>Proposto</div>
                </div>
                {splitRows.map((row, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: '22px', lineHeight: '20px' }}>
                    <div
                      style={{
                        backgroundColor: row.leftType === 'del' ? 'rgba(239, 68, 68, 0.18)' : 'transparent',
                        padding: '1px 8px',
                        display: 'flex',
                        gap: '8px',
                        borderRight: '1px solid rgba(255, 255, 255, 0.06)',
                        whiteSpace: 'pre',
                        overflow: 'hidden',
                      }}
                    >
                      <span style={{ color: 'rgba(255,255,255,0.25)', width: '26px', textAlign: 'right' }}>{row.leftNum || ''}</span>
                      <span style={{ color: row.leftType === 'del' ? '#fca5a5' : 'var(--text-secondary)' }}>{row.leftText || ''}</span>
                    </div>
                    <div
                      style={{
                        backgroundColor: row.rightType === 'add' ? 'rgba(16, 185, 129, 0.18)' : 'transparent',
                        padding: '1px 8px',
                        display: 'flex',
                        gap: '8px',
                        whiteSpace: 'pre',
                        overflow: 'hidden',
                      }}
                    >
                      <span style={{ color: 'rgba(255,255,255,0.25)', width: '26px', textAlign: 'right' }}>{row.rightNum || ''}</span>
                      <span style={{ color: row.rightType === 'add' ? '#86efac' : 'var(--text-primary)' }}>{row.rightText || ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-input)',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '0.82rem',
                  padding: '12px 0',
                }}
              >
                {artifact.diffContent.split('\n').map((line, idx) => (
                  <div key={idx} style={{ padding: '2px 14px', whiteSpace: 'pre-wrap' }}>
                    {line || ' '}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'files' && artifact.affectedFiles && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {artifact.affectedFiles.map((file, idx) => (
              <div key={idx} className="glass-card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                <FileCode size={15} color="var(--accent-light)" />
                <span>{file}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
