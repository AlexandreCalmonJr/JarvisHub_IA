import JSZip from 'jszip';
import {
  AndroidMobileConfig,
  DEFAULT_ANDROID_CAPABILITIES,
  GeneratedAndroidFile,
  buildAndroidMobileProjectFiles,
  normalizeAndroidAppId,
  validateBrainServerUrl,
} from '../src/services/androidAppEngine';

export function resolveAndroidMobileConfig(raw: Partial<AndroidMobileConfig>): AndroidMobileConfig {
  const assistantName = String(raw.assistantName || 'JARVIS').trim().slice(0, 32) || 'JARVIS';
  const appName = String(raw.appName || `${assistantName} Mobile`).trim().slice(0, 48) || `${assistantName} Mobile`;
  const packageId = normalizeAndroidAppId(raw.packageId || 'br.jarvis.mobile');
  const serverUrl = validateBrainServerUrl(raw.serverUrl || 'http://192.168.1.50:3000');
  const brainName = String(raw.brainName || 'Cérebro Casa · Local').trim().slice(0, 48) || 'Cérebro Casa · Local';
  const accentColor = /^#[0-9a-fA-F]{6}$/.test(String(raw.accentColor || ''))
    ? String(raw.accentColor)
    : '#f97316';

  return {
    appName,
    assistantName,
    packageId,
    serverUrl,
    brainName,
    accentColor,
    capabilities: {
      ...DEFAULT_ANDROID_CAPABILITIES,
      ...(raw.capabilities || {}),
    },
  };
}

export async function packageAndroidProjectToZip(
  config: AndroidMobileConfig,
  files?: GeneratedAndroidFile[]
): Promise<{ files: GeneratedAndroidFile[]; zipBuffer: Buffer; filename: string }> {
  const generatedFiles = files || buildAndroidMobileProjectFiles(config);
  const folderName = config.packageId.replace(/\./g, '-') + '-android';
  const zip = new JSZip();
  const root = zip.folder(folderName);
  if (!root) {
    throw new Error('Não foi possível inicializar o pacote ZIP do aplicativo Android.');
  }
  for (const file of generatedFiles) {
    root.file(file.path, file.content);
  }
  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return {
    files: generatedFiles,
    zipBuffer,
    filename: `${folderName}.zip`,
  };
}
