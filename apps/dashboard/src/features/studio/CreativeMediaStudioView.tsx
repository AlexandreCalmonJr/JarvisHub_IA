import React, { useEffect, useRef, useState } from 'react';
import {
  FileSpreadsheet,
  Image as ImageIcon,
  Film,
  Download,
  Sparkles,
  Trash2,
  Upload,
  X,
  RefreshCw,
  Wand2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  PlusCircle,
  Table2,
  Layers,
} from 'lucide-react';
import {
  SPREADSHEET_PRESETS,
  SpreadsheetPresetInfo,
  SpreadsheetSpec,
  formatCellForPreview,
  isFormulaCell,
} from '../../services/spreadsheetEngine';
import {
  StudioImageAsset,
  StudioVideoJob,
  deleteMediaAssetApi,
  deleteSpreadsheet,
  downloadSpreadsheetFile,
  fetchMediaGallery,
  fetchSpreadsheets,
  generateSpreadsheet,
  generateStudioImageApi,
  pollStudioVideoApi,
  startStudioVideoApi,
} from '../../services/api/creativeStudio';
import { notify } from '../../shared/common/Toast';

type StudioTab = 'spreadsheets' | 'images' | 'videos';

function readFileAsBase64(file: File): Promise<{ base64: string; mimeType: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        reject(new Error('Não foi possível ler o arquivo de imagem selecionado.'));
        return;
      }
      resolve({ mimeType: match[1], base64: match[2], dataUrl });
    };
    reader.onerror = () => reject(new Error('Erro ao ler imagem local.'));
    reader.readAsDataURL(file);
  });
}

export const CreativeMediaStudioView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<StudioTab>('spreadsheets');

  // --- Planilhas Excel (.xlsx / .csv) ---
  const [presets, setPresets] = useState<SpreadsheetPresetInfo[]>(SPREADSHEET_PRESETS);
  const [spreadsheets, setSpreadsheets] = useState<SpreadsheetSpec[]>([]);
  const [activeSheetDoc, setActiveSheetDoc] = useState<SpreadsheetSpec | null>(null);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [sheetPrompt, setSheetPrompt] = useState('');
  const [sheetTitle, setSheetTitle] = useState('');
  const [sheetUseAi, setSheetUseAi] = useState(false);
  const [generatingSheet, setGeneratingSheet] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  // --- Estúdio de Imagens ---
  const [images, setImages] = useState<StudioImageAsset[]>([]);
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageModel, setImageModel] = useState<'gemini-3.1-flash-lite-image' | 'gemini-nano-banana-2.1'>(
    'gemini-3.1-flash-lite-image'
  );
  const [imageAspect, setImageAspect] = useState<'1:1' | '16:9' | '9:16' | '4:3' | '3:4'>('1:1');
  const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [imageRef, setImageRef] = useState<{ name: string; base64: string; mimeType: string; dataUrl: string } | null>(
    null
  );
  const [generatingImage, setGeneratingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);

  // --- Diretor de Vídeos ---
  const [videos, setVideos] = useState<StudioVideoJob[]>([]);
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoAspect, setVideoAspect] = useState<'16:9' | '9:16'>('16:9');
  const [videoDuration, setVideoDuration] = useState<'5s' | '8s' | '10s'>('8s');
  const [videoResolution, setVideoResolution] = useState<'720p' | '1080p'>('720p');
  const [videoRef, setVideoRef] = useState<{ name: string; base64: string; mimeType: string; dataUrl: string } | null>(
    null
  );
  const [startingVideo, setStartingVideo] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [extendingJobId, setExtendingJobId] = useState<string | null>(null);
  const [extensionPrompt, setExtensionPrompt] = useState('');
  const videoFileInputRef = useRef<HTMLInputElement | null>(null);

  const loadAll = async () => {
    try {
      const [sheetData, mediaData] = await Promise.all([fetchSpreadsheets(), fetchMediaGallery()]);
      if (sheetData.presets?.length) setPresets(sheetData.presets);
      setSpreadsheets(sheetData.items || []);
      if (!activeSheetDoc && sheetData.items?.length) {
        setActiveSheetDoc(sheetData.items[0]);
      }
      setImages(mediaData.images || []);
      setVideos(mediaData.videos || []);
    } catch {
      // keep local presets usable
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  // Poll any running video jobs every 4 seconds
  useEffect(() => {
    const running = videos.filter((v) => v.status === 'running');
    if (running.length === 0) return;

    const timer = window.setInterval(() => {
      running.forEach((job) => {
        void pollStudioVideoApi(job.id)
          .then((updated) => {
            setVideos((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
            if (updated.status === 'completed') {
              notify('Vídeo pronto para assistir e baixar!', 'success');
            } else if (updated.status === 'failed') {
              notify(updated.error || 'A geração do vídeo falhou.', 'error');
            }
          })
          .catch(() => {});
      });
    }, 4000);

    return () => window.clearInterval(timer);
  }, [videos]);

  const handleGeneratePresetSheet = async (preset: SpreadsheetPresetInfo) => {
    setGeneratingSheet(true);
    setSheetError(null);
    try {
      const res = await generateSpreadsheet({
        presetId: preset.id,
        title: preset.title,
        useAi: false,
      });
      setSpreadsheets((prev) => [res.spreadsheet, ...prev.filter((s) => s.id !== res.spreadsheet.id)]);
      setActiveSheetDoc(res.spreadsheet);
      setActiveSheetIdx(0);
      notify(`Planilha "${res.spreadsheet.title}" gerada com fórmulas Excel prontas!`, 'success');
    } catch (err: any) {
      setSheetError(err?.message || 'Não foi possível criar a planilha.');
    } finally {
      setGeneratingSheet(false);
    }
  };

  const handleGenerateCustomSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sheetPrompt.trim() && !sheetTitle.trim()) {
      setSheetError('Descreva que planilha você precisa ou clique em um dos modelos prontos acima.');
      return;
    }
    setGeneratingSheet(true);
    setSheetError(null);
    try {
      const res = await generateSpreadsheet({
        prompt: sheetPrompt.trim() || sheetTitle.trim(),
        title: sheetTitle.trim() || undefined,
        useAi: sheetUseAi,
      });
      setSpreadsheets((prev) => [res.spreadsheet, ...prev.filter((s) => s.id !== res.spreadsheet.id)]);
      setActiveSheetDoc(res.spreadsheet);
      setActiveSheetIdx(0);
      notify(`Planilha "${res.spreadsheet.title}" criada com sucesso!`, 'success');
    } catch (err: any) {
      setSheetError(err?.message || 'Erro ao gerar planilha personalizada.');
    } finally {
      setGeneratingSheet(false);
    }
  };

  const handleDownloadSheet = async (doc: SpreadsheetSpec, format: 'xlsx' | 'csv') => {
    try {
      const slug =
        doc.title
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'planilha';
      await downloadSpreadsheetFile(doc.id, format, `${slug}.${format}`, activeSheetIdx);
      notify(`Download de ${slug}.${format} iniciado.`, 'success');
    } catch (err: any) {
      notify(err?.message || 'Erro ao baixar planilha.', 'error');
    }
  };

  const handleDeleteSheet = async (id: string) => {
    try {
      await deleteSpreadsheet(id);
      setSpreadsheets((prev) => {
        const next = prev.filter((item) => item.id !== id);
        if (activeSheetDoc?.id === id) {
          setActiveSheetDoc(next[0] || null);
          setActiveSheetIdx(0);
        }
        return next;
      });
      notify('Planilha removida do histórico.', 'info');
    } catch (err: any) {
      notify(err?.message || 'Não foi possível excluir a planilha.', 'error');
    }
  };

  const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await readFileAsBase64(file);
      setImageRef({ name: file.name, ...parsed });
      setImageError(null);
    } catch (err: any) {
      setImageError(err?.message || 'Falha ao carregar imagem.');
    }
    e.target.value = '';
  };

  const handleGenerateImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imagePrompt.trim()) {
      setImageError('Escreva uma descrição da imagem ou da edição desejada.');
      return;
    }
    setGeneratingImage(true);
    setImageError(null);
    try {
      const asset = await generateStudioImageApi({
        prompt: imagePrompt.trim(),
        model: imageModel,
        aspectRatio: imageAspect,
        imageSize: imageModel === 'gemini-nano-banana-2.1' ? imageSize : undefined,
        referenceImageBase64: imageRef?.base64,
        referenceMimeType: imageRef?.mimeType,
      });
      setImages((prev) => [asset, ...prev]);
      notify(
        asset.editedFromReference ? 'Imagem editada com sucesso!' : 'Imagem criada com sucesso!',
        'success'
      );
    } catch (err: any) {
      setImageError(err?.message || 'Não foi possível gerar a imagem.');
    } finally {
      setGeneratingImage(false);
    }
  };

  const handleVideoFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await readFileAsBase64(file);
      setVideoRef({ name: file.name, ...parsed });
      setVideoError(null);
    } catch (err: any) {
      setVideoError(err?.message || 'Falha ao carregar imagem inicial.');
    }
    e.target.value = '';
  };

  const handleGenerateVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoPrompt.trim()) {
      setVideoError('Descreva o movimento e a cena do vídeo.');
      return;
    }
    setStartingVideo(true);
    setVideoError(null);
    try {
      const job = await startStudioVideoApi({
        prompt: videoPrompt.trim(),
        aspectRatio: videoAspect,
        duration: videoDuration,
        resolution: videoResolution,
        referenceImageBase64: videoRef?.base64,
        referenceMimeType: videoRef?.mimeType,
      });
      setVideos((prev) => [job, ...prev]);
      notify('Geração de vídeo iniciada! Acompanhe o progresso abaixo.', 'info');
    } catch (err: any) {
      setVideoError(err?.message || 'Não foi possível iniciar o vídeo.');
    } finally {
      setStartingVideo(false);
    }
  };

  const handleExtendVideo = async (sourceJob: StudioVideoJob) => {
    if (!sourceJob.interactionId) return;
    const promptToUse =
      extensionPrompt.trim() || 'Continue a cena suavemente com movimento cinematográfico de câmera.';
    setStartingVideo(true);
    setVideoError(null);
    try {
      const job = await startStudioVideoApi({
        prompt: promptToUse,
        aspectRatio: sourceJob.aspectRatio,
        duration: '5s',
        resolution: sourceJob.resolution,
        previousInteractionId: sourceJob.interactionId,
      });
      setVideos((prev) => [job, ...prev]);
      setExtendingJobId(null);
      setExtensionPrompt('');
      notify('Extensão de cena (+5s) iniciada!', 'info');
    } catch (err: any) {
      setVideoError(err?.message || 'Não foi possível estender o vídeo.');
    } finally {
      setStartingVideo(false);
    }
  };

  const handleDeleteMedia = async (id: string, kind: 'image' | 'video') => {
    try {
      await deleteMediaAssetApi(id);
      if (kind === 'image') {
        setImages((prev) => prev.filter((item) => item.id !== id));
      } else {
        setVideos((prev) => prev.filter((item) => item.id !== id));
      }
      notify('Item removido da galeria.', 'info');
    } catch (err: any) {
      notify(err?.message || 'Erro ao remover item.', 'error');
    }
  };

  const currentSheet = activeSheetDoc?.sheets[activeSheetIdx] || activeSheetDoc?.sheets[0] || null;

  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        paddingBottom: '28px',
      }}
    >
      {/* Header do Estúdio */}
      <div
        className="jarvis-settings-card"
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          background:
            'linear-gradient(135deg, rgba(249, 115, 22, 0.12) 0%, rgba(18, 22, 31, 0.96) 55%, rgba(11, 13, 18, 0.98) 100%)',
          borderColor: 'rgba(249, 115, 22, 0.28)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #f97316 0%, #c2410c 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Wand2 size={22} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                margin: 0,
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
              }}
            >
              Estúdio Criativo — Planilhas, Imagens & Vídeos
            </h1>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: '0.86rem',
                color: 'var(--text-secondary)',
              }}
            >
              Gere planilhas Excel reais (.xlsx) com fórmulas automáticas via Iris, crie ou edite imagens com Kauan e produza vídeos curtos com Enzo.
            </p>
          </div>
        </div>

        {/* Seletor de 3 Abas Principais */}
        <div
          role="tablist"
          aria-label="Módulos do Estúdio Criativo"
          style={{
            display: 'inline-flex',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            padding: '4px',
            gap: '4px',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'spreadsheets'}
            onClick={() => setActiveTab('spreadsheets')}
            className={`btn btn-sm ${activeTab === 'spreadsheets' ? 'btn-primary' : 'btn-ghost'}`}
          >
            <FileSpreadsheet size={15} />
            <span>Planilhas Excel ({spreadsheets.length})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'images'}
            onClick={() => setActiveTab('images')}
            className={`btn btn-sm ${activeTab === 'images' ? 'btn-primary' : 'btn-ghost'}`}
          >
            <ImageIcon size={15} />
            <span>Imagens ({images.length})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'videos'}
            onClick={() => setActiveTab('videos')}
            className={`btn btn-sm ${activeTab === 'videos' ? 'btn-primary' : 'btn-ghost'}`}
          >
            <Film size={15} />
            <span>Vídeos ({videos.length})</span>
          </button>
        </div>
      </div>

      {/* ================= ABA 1: PLANILHAS EXCEL (.XLSX / .CSV) ================= */}
      {activeTab === 'spreadsheets' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Modelos Prontos em 1 Clique */}
          <div className="jarvis-settings-card" style={{ gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Modelos Prontos em 1 Clique (Iris · Excel Real .xlsx)
                </h2>
                <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Clique em qualquer modelo abaixo para montar uma planilha multi-abas com fórmulas prontas (SOMA, MÉDIA, margem e saldo).
                </p>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '12px',
              }}
            >
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  disabled={generatingSheet}
                  onClick={() => void handleGeneratePresetSheet(preset)}
                  className="jarvis-settings-subcard"
                  style={{
                    textAlign: 'left',
                    cursor: generatingSheet ? 'wait' : 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    transition: 'border-color 0.15s ease, transform 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                      {preset.title}
                    </strong>
                    <FileSpreadsheet size={16} color="var(--accent-light)" />
                  </div>
                  <p style={{ margin: 0, fontSize: '0.79rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                    {preset.description}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: 'auto', paddingTop: '4px' }}>
                    {preset.sheetNames.map((name) => (
                      <span
                        key={name}
                        style={{
                          fontSize: '0.7rem',
                          color: 'var(--text-muted)',
                          background: 'var(--bg-primary)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '6px',
                          padding: '2px 7px',
                        }}
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Criador Sob Medida */}
          <form onSubmit={handleGenerateCustomSheet} className="jarvis-settings-card" style={{ gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <h2 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Ou descreva a planilha que você precisa
              </h2>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={sheetUseAi}
                  onChange={(e) => setSheetUseAi(e.target.checked)}
                />
                <span>Estruturar colunas sob medida com IA (Gemini)</span>
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 280px) 1fr auto', gap: '10px', alignItems: 'end' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Título do arquivo (opcional)
                <input
                  type="text"
                  className="jarvis-input"
                  placeholder="Ex.: Finanças Novembro 2026"
                  value={sheetTitle}
                  onChange={(e) => setSheetTitle(e.target.value)}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                O que deve ter na planilha?
                <input
                  type="text"
                  className="jarvis-input"
                  placeholder="Ex.: Planilha de controle de vendas por vendedor com comissão de 8% e total mensal"
                  value={sheetPrompt}
                  onChange={(e) => setSheetPrompt(e.target.value)}
                />
              </label>

              <button type="submit" className="btn btn-primary" disabled={generatingSheet}>
                {generatingSheet ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
                <span>{generatingSheet ? 'Gerando...' : 'Criar Planilha .xlsx'}</span>
              </button>
            </div>

            {sheetError && (
              <div
                role="alert"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#fca5a5',
                  fontSize: '0.82rem',
                }}
              >
                <AlertCircle size={15} />
                <span>{sheetError}</span>
              </div>
            )}
          </form>

          {/* Prévia Interativa da Planilha Ativa + Histórico */}
          {activeSheetDoc && currentSheet && (
            <div className="jarvis-settings-card" style={{ gap: '14px' }}>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Table2 size={18} color="var(--accent-light)" />
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {activeSheetDoc.title}
                    </h3>
                  </div>
                  <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {activeSheetDoc.subtitle} · {activeSheetDoc.sheets.length} aba(s)
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => void handleDownloadSheet(activeSheetDoc, 'xlsx')}
                  >
                    <Download size={14} />
                    <span>Baixar Excel (.xlsx)</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => void handleDownloadSheet(activeSheetDoc, 'csv')}
                  >
                    <Download size={14} />
                    <span>Baixar CSV (aba atual)</span>
                  </button>
                </div>
              </div>

              {/* Abas do Workbook */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
                {activeSheetDoc.sheets.map((sheet, idx) => (
                  <button
                    key={sheet.name}
                    type="button"
                    onClick={() => setActiveSheetIdx(idx)}
                    className={`btn btn-sm ${activeSheetIdx === idx ? 'btn-secondary' : 'btn-ghost'}`}
                    style={
                      activeSheetIdx === idx
                        ? { borderColor: 'var(--border-accent)', color: 'var(--accent-light)' }
                        : undefined
                    }
                  >
                    <Layers size={13} />
                    <span>{sheet.name}</span>
                  </button>
                ))}
              </div>

              {currentSheet.description && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{currentSheet.description}</div>
              )}

              {/* Tabela Interativa */}
              <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '0.83rem',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-tertiary)', borderBottom: '2px solid var(--accent-color)' }}>
                      {currentSheet.columns.map((col) => (
                        <th
                          key={col.key}
                          style={{
                            padding: '10px 12px',
                            textAlign: col.type === 'text' || col.type === 'date' ? 'left' : 'right',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {col.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {currentSheet.rows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        style={{
                          borderBottom: '1px solid var(--border-subtle)',
                          backgroundColor: rIdx % 2 === 1 ? 'rgba(255,255,255,0.015)' : 'transparent',
                        }}
                      >
                        {currentSheet.columns.map((col) => {
                          const cell = row[col.key];
                          const formula = isFormulaCell(cell) ? cell.formula : null;
                          return (
                            <td
                              key={col.key}
                              title={formula ? `Fórmula Excel: =${formula}` : undefined}
                              style={{
                                padding: '9px 12px',
                                textAlign: col.type === 'text' || col.type === 'date' ? 'left' : 'right',
                                color: 'var(--text-primary)',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <span>{formatCellForPreview(cell, col.type)}</span>
                              {formula && (
                                <span
                                  style={{
                                    marginLeft: '6px',
                                    fontSize: '0.67rem',
                                    fontFamily: 'var(--font-mono)',
                                    color: 'var(--accent-light)',
                                  }}
                                >
                                  fx
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}

                    {currentSheet.summaryRow && (
                      <tr
                        style={{
                          backgroundColor: 'rgba(249, 115, 22, 0.12)',
                          borderTop: '2px solid rgba(249, 115, 22, 0.45)',
                          fontWeight: 700,
                        }}
                      >
                        {currentSheet.columns.map((col) => {
                          const cell = currentSheet.summaryRow![col.key];
                          const formula = isFormulaCell(cell) ? cell.formula : null;
                          return (
                            <td
                              key={col.key}
                              title={formula ? `Fórmula Excel: =${formula}` : undefined}
                              style={{
                                padding: '10px 12px',
                                textAlign: col.type === 'text' || col.type === 'date' ? 'left' : 'right',
                                color: 'var(--text-primary)',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <span>{formatCellForPreview(cell, col.type)}</span>
                              {formula && (
                                <span
                                  style={{
                                    marginLeft: '6px',
                                    fontSize: '0.67rem',
                                    fontFamily: 'var(--font-mono)',
                                    color: 'var(--accent-light)',
                                  }}
                                >
                                  ={formula}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Lista de Planilhas Geradas na Sessão */}
          {spreadsheets.length > 0 && (
            <div className="jarvis-settings-card" style={{ gap: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Planilhas Recentes ({spreadsheets.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {spreadsheets.map((item) => (
                  <div
                    key={item.id}
                    className="jarvis-settings-subcard"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      borderColor: activeSheetDoc?.id === item.id ? 'var(--border-accent)' : undefined,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSheetDoc(item);
                        setActiveSheetIdx(0);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        textAlign: 'left',
                        cursor: 'pointer',
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                        {item.sheets.map((s) => s.name).join(' · ')}
                      </div>
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => void handleDownloadSheet(item, 'xlsx')}
                      >
                        <Download size={13} />
                        <span>.xlsx</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger-ghost btn-icon-sm"
                        aria-label={`Excluir planilha ${item.title}`}
                        onClick={() => void handleDeleteSheet(item.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= ABA 2: ESTÚDIO DE IMAGENS (GEMINI IMAGE) ================= */}
      {activeTab === 'images' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <form onSubmit={handleGenerateImage} className="jarvis-settings-card" style={{ gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Estúdio de Imagens — Kauan (@kauan)
                </h2>
                <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Crie imagens originais ou envie uma foto de referência para editar por comando de texto.
                </p>
              </div>
            </div>

            <textarea
              className="jarvis-input"
              rows={3}
              aria-label="Descrição da imagem"
              placeholder="Descreva a imagem em detalhes: ex. Fotografia editorial de um escritório minimalista moderno ao entardecer com iluminação quente e vista para a cidade"
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
            />

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Qualidade / Modelo
                  <select
                    className="jarvis-input"
                    value={imageModel}
                    onChange={(e) => setImageModel(e.target.value as any)}
                  >
                    <option value="gemini-3.1-flash-lite-image">Rápido (Gemini Flash Image)</option>
                    <option value="gemini-nano-banana-2.1">Alta Resolução 1K–4K (Nano Banana 2.1)</option>
                  </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Proporção
                  <select
                    className="jarvis-input"
                    value={imageAspect}
                    onChange={(e) => setImageAspect(e.target.value as any)}
                  >
                    <option value="1:1">1:1 (Quadrado / Feed)</option>
                    <option value="16:9">16:9 (Widescreen / Capa)</option>
                    <option value="9:16">9:16 (Vertical / Stories)</option>
                    <option value="4:3">4:3 (Apresentação)</option>
                    <option value="3:4">3:4 (Retrato)</option>
                  </select>
                </label>

                {imageModel === 'gemini-nano-banana-2.1' && (
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Resolução
                    <select
                      className="jarvis-input"
                      value={imageSize}
                      onChange={(e) => setImageSize(e.target.value as any)}
                    >
                      <option value="1K">1K (Padrão)</option>
                      <option value="2K">2K (Alta definição)</option>
                      <option value="4K">4K (Ultra HD)</option>
                    </select>
                  </label>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Editar foto (opcional)</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      ref={imageFileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      style={{ display: 'none' }}
                      onChange={handleImageFileSelect}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => imageFileInputRef.current?.click()}
                    >
                      <Upload size={14} />
                      <span>{imageRef ? 'Trocar foto' : 'Enviar foto'}</span>
                    </button>
                    {imageRef && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon-sm"
                        aria-label="Remover foto de referência"
                        onClick={() => setImageRef(null)}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <button type="submit" className="btn btn-primary" disabled={generatingImage}>
                {generatingImage ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
                <span>
                  {generatingImage
                    ? 'Criando imagem...'
                    : imageRef
                      ? 'Editar Imagem'
                      : 'Gerar Imagem'}
                </span>
              </button>
            </div>

            {imageRef && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <img
                  src={imageRef.dataUrl}
                  alt="Referência para edição"
                  style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px' }}
                />
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Editando imagem de referência: <strong style={{ color: 'var(--text-primary)' }}>{imageRef.name}</strong>
                </div>
              </div>
            )}

            {imageError && (
              <div
                role="alert"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#fca5a5',
                  fontSize: '0.82rem',
                }}
              >
                <AlertCircle size={15} />
                <span>{imageError}</span>
              </div>
            )}
          </form>

          {/* Galeria de Imagens */}
          <div className="jarvis-settings-card" style={{ gap: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Galeria de Imagens Geradas ({images.length})
            </h3>
            {images.length === 0 ? (
              <div
                style={{
                  padding: '28px 16px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '0.84rem',
                  border: '1px dashed var(--border-color)',
                  borderRadius: '10px',
                }}
              >
                Suas artes e fotos editadas aparecerão aqui prontas para baixar em PNG.
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                  gap: '14px',
                }}
              >
                {images.map((img) => (
                  <article
                    key={img.id}
                    className="jarvis-settings-subcard"
                    style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px' }}
                  >
                    <img
                      src={img.dataUrl}
                      alt={img.prompt}
                      style={{
                        width: '100%',
                        aspectRatio: img.aspectRatio.replace(':', ' / '),
                        maxHeight: '280px',
                        objectFit: 'cover',
                        borderRadius: '8px',
                        backgroundColor: 'var(--bg-primary)',
                      }}
                    />
                    <p
                      style={{
                        margin: 0,
                        fontSize: '0.8rem',
                        color: 'var(--text-primary)',
                        lineHeight: 1.4,
                      }}
                    >
                      {img.prompt}
                    </p>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        marginTop: 'auto',
                      }}
                    >
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {img.aspectRatio}
                        {img.imageSize ? ` · ${img.imageSize}` : ''}
                      </span>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <a
                          href={img.dataUrl}
                          download={`jarvis-${img.id}.png`}
                          className="btn btn-secondary btn-sm"
                        >
                          <Download size={13} />
                          <span>Baixar</span>
                        </a>
                        <button
                          type="button"
                          className="btn btn-danger-ghost btn-icon-sm"
                          aria-label="Excluir imagem"
                          onClick={() => void handleDeleteMedia(img.id, 'image')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= ABA 3: DIRETOR DE VÍDEOS (GEMINI OMNI FLASH) ================= */}
      {activeTab === 'videos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <form onSubmit={handleGenerateVideo} className="jarvis-settings-card" style={{ gap: '14px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Diretor de Vídeos — Enzo (@enzo · Gemini Omni Flash)
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Gere clipes curtos em MP4 por texto, anime uma imagem parada ou estenda um vídeo já criado com mais 5 segundos.
              </p>
            </div>

            <textarea
              className="jarvis-input"
              rows={3}
              aria-label="Descrição do vídeo"
              placeholder="Descreva a cena e o movimento de câmera: ex. Drone sobrevoando uma praia brasileira ao amanhecer com ondas suaves e luz dourada cinematográfica"
              value={videoPrompt}
              onChange={(e) => setVideoPrompt(e.target.value)}
            />

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Formato
                  <select
                    className="jarvis-input"
                    value={videoAspect}
                    onChange={(e) => setVideoAspect(e.target.value as any)}
                  >
                    <option value="16:9">16:9 (Horizontal / YouTube)</option>
                    <option value="9:16">9:16 (Vertical / Reels & Shorts)</option>
                  </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Duração
                  <select
                    className="jarvis-input"
                    value={videoDuration}
                    onChange={(e) => setVideoDuration(e.target.value as any)}
                  >
                    <option value="5s">5 segundos</option>
                    <option value="8s">8 segundos</option>
                    <option value="10s">10 segundos</option>
                  </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Resolução
                  <select
                    className="jarvis-input"
                    value={videoResolution}
                    onChange={(e) => setVideoResolution(e.target.value as any)}
                  >
                    <option value="720p">720p (Mais rápido)</option>
                    <option value="1080p">1080p (Full HD)</option>
                  </select>
                </label>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Animar foto (opcional)</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      ref={videoFileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      style={{ display: 'none' }}
                      onChange={handleVideoFileSelect}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => videoFileInputRef.current?.click()}
                    >
                      <Upload size={14} />
                      <span>{videoRef ? 'Trocar quadro' : 'Quadro inicial'}</span>
                    </button>
                    {videoRef && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon-sm"
                        aria-label="Remover quadro inicial"
                        onClick={() => setVideoRef(null)}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <button type="submit" className="btn btn-primary" disabled={startingVideo}>
                {startingVideo ? <Loader2 size={15} className="spin" /> : <Film size={15} />}
                <span>{startingVideo ? 'Iniciando...' : 'Gerar Vídeo (.mp4)'}</span>
              </button>
            </div>

            {videoRef && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <img
                  src={videoRef.dataUrl}
                  alt="Quadro inicial do vídeo"
                  style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px' }}
                />
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Animando imagem inicial: <strong style={{ color: 'var(--text-primary)' }}>{videoRef.name}</strong>
                </div>
              </div>
            )}

            {videoError && (
              <div
                role="alert"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#fca5a5',
                  fontSize: '0.82rem',
                }}
              >
                <AlertCircle size={15} />
                <span>{videoError}</span>
              </div>
            )}
          </form>

          {/* Fila e Galeria de Vídeos */}
          <div className="jarvis-settings-card" style={{ gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Vídeos & Fila de Renderização ({videos.length})
              </h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void loadAll()}>
                <RefreshCw size={13} />
                <span>Atualizar</span>
              </button>
            </div>

            {videos.length === 0 ? (
              <div
                style={{
                  padding: '28px 16px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '0.84rem',
                  border: '1px dashed var(--border-color)',
                  borderRadius: '10px',
                }}
              >
                Nenhum vídeo gerado nesta sessão ainda. Descreva uma cena acima para começar.
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                  gap: '14px',
                }}
              >
                {videos.map((job) => (
                  <article
                    key={job.id}
                    className="jarvis-settings-subcard"
                    style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 600 }}>
                        {job.status === 'running' && <Loader2 size={14} className="spin" color="var(--accent-light)" />}
                        {job.status === 'completed' && <CheckCircle2 size={14} color="var(--success-color)" />}
                        {job.status === 'failed' && <AlertCircle size={14} color="#f87171" />}
                        <span style={{ color: 'var(--text-primary)' }}>
                          {job.status === 'running'
                            ? 'Renderizando...'
                            : job.status === 'completed'
                              ? 'Concluído'
                              : 'Falhou'}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {job.aspectRatio} · {job.duration} · {job.resolution}
                      </span>
                    </div>

                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                      {job.prompt}
                    </p>

                    {job.status === 'completed' && job.videoUrl ? (
                      <video
                        controls
                        src={job.videoUrl}
                        style={{
                          width: '100%',
                          borderRadius: '8px',
                          backgroundColor: '#000',
                          maxHeight: '240px',
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          padding: '14px 12px',
                          borderRadius: '8px',
                          backgroundColor: 'var(--bg-primary)',
                          border: '1px solid var(--border-subtle)',
                          fontSize: '0.78rem',
                          color: job.status === 'failed' ? '#fca5a5' : 'var(--text-secondary)',
                        }}
                      >
                        {job.error || job.progressMessage}
                      </div>
                    )}

                    {extendingJobId === job.id && (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <input
                          type="text"
                          className="jarvis-input"
                          placeholder="Como a cena deve continuar? (+5s)"
                          value={extensionPrompt}
                          onChange={(e) => setExtensionPrompt(e.target.value)}
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => void handleExtendVideo(job)}
                        >
                          Estender
                        </button>
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginTop: 'auto' }}>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {job.status === 'completed' && job.videoUrl && (
                          <a
                            href={job.videoUrl}
                            download={`jarvis-${job.id}.mp4`}
                            className="btn btn-secondary btn-sm"
                          >
                            <Download size={13} />
                            <span>Baixar .mp4</span>
                          </a>
                        )}
                        {job.status === 'completed' && job.interactionId && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() =>
                              setExtendingJobId((prev) => (prev === job.id ? null : job.id))
                            }
                          >
                            <PlusCircle size={13} />
                            <span>Estender (+5s)</span>
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        className="btn btn-danger-ghost btn-icon-sm"
                        aria-label="Excluir vídeo"
                        onClick={() => void handleDeleteMedia(job.id, 'video')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
