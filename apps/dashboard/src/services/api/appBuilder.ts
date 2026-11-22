import { apiFetch } from '../sessionTransport';
import { API_BASE } from './client';
import {
  AppBlueprintSpec,
  AppPresetId,
  AppPresetInfo,
  AppTargetPlatform,
  GeneratedProjectFile,
} from '../appBuilderEngine';

export interface ScaffoldedAppResult {
  blueprint: AppBlueprintSpec;
  files: GeneratedProjectFile[];
  preview_html: string;
  download_zip_url: string;
  zip_size_bytes: number;
}

async function parseJsonOrThrow<T>(res: Response, fallbackMsg: string): Promise<T> {
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((payload as any)?.error || fallbackMsg);
  }
  return payload as T;
}

export async function fetchGeneratedApps(): Promise<{
  presets: AppPresetInfo[];
  items: ScaffoldedAppResult[];
}> {
  const res = await apiFetch(`${API_BASE}/apps`);
  return parseJsonOrThrow(res, 'Erro ao carregar projetos de aplicativos.');
}

export async function scaffoldAppApi(input: {
  prompt?: string;
  presetId?: AppPresetId;
  name?: string;
  platform: AppTargetPlatform;
  accentColor?: string;
  useAi?: boolean;
}): Promise<ScaffoldedAppResult> {
  const res = await apiFetch(`${API_BASE}/apps/scaffold`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow(res, 'Não foi possível gerar o aplicativo.');
}

export async function downloadAppZip(id: string, filename: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/apps/${encodeURIComponent(id)}/download`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any)?.error || 'Falha ao baixar o pacote .zip do aplicativo.');
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

export async function deleteGeneratedAppApi(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/apps/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  await parseJsonOrThrow(res, 'Erro ao remover projeto.');
}
