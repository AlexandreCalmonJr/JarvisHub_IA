import { apiFetch } from '../sessionTransport';
import { API_BASE } from './client';
import {
  AndroidMobileConfig,
  GeneratedAndroidFile,
  PairedDeviceRecord,
  PairingSessionInfo,
} from '../androidAppEngine';

async function parseJsonOrThrow<T>(res: Response, fallbackMsg: string): Promise<T> {
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((payload as any)?.error || (payload as any)?.detail || fallbackMsg);
  }
  return payload as T;
}

export async function fetchPairedDevicesApi(): Promise<{
  devices: PairedDeviceRecord[];
  pairing: PairingSessionInfo;
}> {
  const res = await apiFetch(`${API_BASE}/devices`);
  return parseJsonOrThrow(res, 'Erro ao consultar dispositivos pareados.');
}

export async function initDevicePairingApi(input: {
  serverUrl?: string;
  brainName?: string;
  assistantName?: string;
}): Promise<PairingSessionInfo> {
  const res = await apiFetch(`${API_BASE}/devices/pair/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow(res, 'Não foi possível gerar o QR Code de pareamento.');
}

export async function confirmDevicePairingApi(input: {
  pairingCode: string;
  deviceName: string;
  model?: string;
  osVersion?: string;
}): Promise<{ device: PairedDeviceRecord; devices: PairedDeviceRecord[]; pairing: PairingSessionInfo }> {
  const res = await apiFetch(`${API_BASE}/devices/pair/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow(res, 'Não foi possível confirmar o pareamento deste aparelho.');
}

export async function revokePairedDeviceApi(id: string): Promise<{ deleted: boolean; devices: PairedDeviceRecord[] }> {
  const res = await apiFetch(`${API_BASE}/devices/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return parseJsonOrThrow(res, 'Erro ao revogar o dispositivo.');
}

export async function previewAndroidAppProjectApi(config: Partial<AndroidMobileConfig>): Promise<{
  config: AndroidMobileConfig;
  files: GeneratedAndroidFile[];
  preview_html: string;
  zip_size_bytes: number;
  filename: string;
}> {
  const res = await apiFetch(`${API_BASE}/android-app/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  return parseJsonOrThrow(res, 'Não foi possível montar os artefatos Android.');
}

export async function downloadAndroidAppZipApi(config: Partial<AndroidMobileConfig>): Promise<string> {
  const res = await apiFetch(`${API_BASE}/android-app/package.zip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any)?.error || 'Falha ao gerar o pacote .zip do aplicativo Android.');
  }
  const cd = res.headers.get('Content-Disposition') || '';
  const match = cd.match(/filename="([^"]+)"/);
  const filename = match?.[1] || 'jarvis-mobile-android.zip';
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  return filename;
}
