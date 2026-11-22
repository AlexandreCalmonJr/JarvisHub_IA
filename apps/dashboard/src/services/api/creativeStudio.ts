import { apiFetch } from '../sessionTransport';
import { API_BASE } from './client';
import { SpreadsheetPresetInfo, SpreadsheetSpec } from '../spreadsheetEngine';

export interface StudioImageAsset {
  id: string;
  kind: 'image';
  prompt: string;
  model: 'gemini-3.1-flash-lite-image' | 'gemini-nano-banana-2.1';
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  imageSize?: '1K' | '2K' | '4K';
  mimeType: string;
  dataUrl: string;
  caption?: string;
  editedFromReference: boolean;
  createdAt: string;
}

export interface StudioVideoJob {
  id: string;
  kind: 'video';
  prompt: string;
  model: 'gemini-omni-1.2-flash';
  aspectRatio: '16:9' | '9:16';
  duration: '5s' | '8s' | '10s';
  resolution: '720p' | '1080p';
  status: 'running' | 'completed' | 'failed';
  progressMessage: string;
  interactionId?: string;
  previousInteractionId?: string;
  videoUrl?: string;
  mimeType?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

async function parseJsonOrThrow<T>(res: Response, fallbackMsg: string): Promise<T> {
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((payload as any)?.error || fallbackMsg);
  }
  return payload as T;
}

export async function fetchSpreadsheets(): Promise<{
  presets: SpreadsheetPresetInfo[];
  items: SpreadsheetSpec[];
}> {
  const res = await apiFetch(`${API_BASE}/spreadsheets`);
  return parseJsonOrThrow(res, 'Erro ao carregar planilhas.');
}

export async function generateSpreadsheet(input: {
  prompt?: string;
  presetId?: SpreadsheetPresetInfo['id'];
  title?: string;
  useAi?: boolean;
}): Promise<{
  spreadsheet: SpreadsheetSpec;
  download_xlsx_url: string;
  download_csv_url: string;
}> {
  const res = await apiFetch(`${API_BASE}/spreadsheets/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow(res, 'Erro ao gerar planilha Excel.');
}

export async function deleteSpreadsheet(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/spreadsheets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  await parseJsonOrThrow(res, 'Erro ao excluir planilha.');
}

export async function downloadSpreadsheetFile(
  id: string,
  format: 'xlsx' | 'csv',
  filename: string,
  sheetIndex = 0
): Promise<void> {
  const url = `${API_BASE}/spreadsheets/${encodeURIComponent(id)}/download?format=${format}&sheet=${sheetIndex}`;
  const res = await apiFetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any)?.error || 'Falha ao baixar arquivo da planilha.');
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}

export async function fetchMediaGallery(): Promise<{
  gemini_configured: boolean;
  images: StudioImageAsset[];
  videos: StudioVideoJob[];
}> {
  const res = await apiFetch(`${API_BASE}/media/assets`);
  return parseJsonOrThrow(res, 'Erro ao carregar galeria de mídia.');
}

export async function generateStudioImageApi(input: {
  prompt: string;
  model: 'gemini-3.1-flash-lite-image' | 'gemini-nano-banana-2.1';
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  imageSize?: '1K' | '2K' | '4K';
  referenceImageBase64?: string;
  referenceMimeType?: string;
}): Promise<StudioImageAsset> {
  const res = await apiFetch(`${API_BASE}/media/images`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await parseJsonOrThrow<{ asset: StudioImageAsset }>(
    res,
    'Erro ao gerar imagem.'
  );
  return data.asset;
}

export async function startStudioVideoApi(input: {
  prompt: string;
  aspectRatio: '16:9' | '9:16';
  duration: '5s' | '8s' | '10s';
  resolution: '720p' | '1080p';
  referenceImageBase64?: string;
  referenceMimeType?: string;
  previousInteractionId?: string;
}): Promise<StudioVideoJob> {
  const res = await apiFetch(`${API_BASE}/media/videos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await parseJsonOrThrow<{ job: StudioVideoJob }>(
    res,
    'Erro ao iniciar geração de vídeo.'
  );
  return data.job;
}

export async function pollStudioVideoApi(jobId: string): Promise<StudioVideoJob> {
  const res = await apiFetch(`${API_BASE}/media/videos/${encodeURIComponent(jobId)}`);
  const data = await parseJsonOrThrow<{ job: StudioVideoJob }>(
    res,
    'Erro ao consultar status do vídeo.'
  );
  return data.job;
}

export async function deleteMediaAssetApi(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/media/assets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  await parseJsonOrThrow(res, 'Erro ao excluir mídia.');
}
