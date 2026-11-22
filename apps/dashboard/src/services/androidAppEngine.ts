export interface AndroidMobileCapabilities {
  voiceWakeWord: boolean;
  homeScreenWidget: boolean;
  cameraAndQr: boolean;
  shareIntent: boolean;
  pushNotifications: boolean;
  biometricLock: boolean;
  offlineQueue: boolean;
}

export interface AndroidMobileConfig {
  appName: string;
  assistantName: string;
  packageId: string;
  serverUrl: string;
  brainName: string;
  accentColor: string;
  capabilities: AndroidMobileCapabilities;
}

export interface GeneratedAndroidFile {
  path: string;
  language: 'typescript' | 'xml' | 'kotlin' | 'json' | 'yaml' | 'html' | 'markdown';
  description: string;
  content: string;
}

export interface PairedDeviceRecord {
  id: string;
  name: string;
  platform: 'android' | 'desktop' | 'web';
  model: string;
  os_version: string;
  status: 'online' | 'offline';
  paired_at: string;
  last_seen: string;
  token_hint: string;
}

export interface PairingSessionInfo {
  pairing_code: string;
  expires_at: string;
  server_url: string;
  brain_name: string;
  qr_payload: string;
}

export const DEFAULT_ANDROID_CAPABILITIES: AndroidMobileCapabilities = {
  voiceWakeWord: true,
  homeScreenWidget: true,
  cameraAndQr: true,
  shareIntent: true,
  pushNotifications: true,
  biometricLock: true,
  offlineQueue: true,
};

export function normalizeAndroidAppId(raw: string): string {
  const cleaned = String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+|\.+$/g, '');
  const parts = cleaned
    .split('.')
    .filter(Boolean)
    .map((part) => (/^[a-z]/.test(part) ? part : `app${part}`));
  if (parts.length < 2) {
    return 'br.jarvis.mobile';
  }
  return parts.slice(0, 4).join('.');
}

export function validateBrainServerUrl(rawUrl: string): string {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    return 'http://192.168.1.50:3000';
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Endereço do servidor inválido. Use https://seu-jarvis.ts.net ou http://192.168.x.x:3000.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Somente conexões HTTP (rede local) ou HTTPS são permitidas.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Não inclua usuário ou senha na URL do servidor.');
  }
  if (parsed.protocol === 'http:') {
    const h = parsed.hostname.toLowerCase();
    const isTrustedLocal =
      h === 'localhost' ||
      h === '127.0.0.1' ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(h) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(h) ||
      h.endsWith('.local');
    if (!isTrustedLocal) {
      throw new Error(
        'Para endereços externos fora da sua rede Wi-Fi local, use sempre HTTPS (ex.: Tailscale ou domínio com SSL).'
      );
    }
  }
  return parsed.origin;
}

export function buildPairingQrPayload(input: {
  brainName: string;
  serverUrl: string;
  pairingCode: string;
  expiresAt: string;
  assistantName: string;
}): string {
  return JSON.stringify({
    protocol: 'jarvis-mobile-pair/v1',
    brain: input.brainName,
    assistant: input.assistantName,
    server: input.serverUrl,
    code: input.pairingCode,
    expires_at: input.expiresAt,
  });
}

function escapeXml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeColor(hex: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#f97316';
}

export function buildAndroidMobilePreviewHtml(config: AndroidMobileConfig): string {
  const accent = sanitizeColor(config.accentColor);
  const safeApp = escapeHtml(config.appName || `${config.assistantName} Mobile`);
  const safeAssistant = escapeHtml(config.assistantName || 'JARVIS');
  const safeBrain = escapeHtml(config.brainName || 'Cérebro Casa · Local');
  const safeUrl = escapeHtml(config.serverUrl || 'http://192.168.1.50:3000');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="theme-color" content="#0b0d12" />
  <title>${safeApp}</title>
  <style>
    :root {
      --bg: #0b0d12;
      --card: #131824;
      --card-2: #1a2132;
      --border: rgba(255,255,255,0.09);
      --text: #f3f4f6;
      --muted: #94a3b8;
      --accent: ${accent};
      --ok: #10b981;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 14px;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 12px;
      border-radius: 14px;
      background: var(--card);
      border: 1px solid var(--border);
    }
    .brand { display: flex; align-items: center; gap: 9px; }
    .logo {
      width: 30px; height: 30px; border-radius: 9px;
      background: linear-gradient(135deg, var(--accent), #c2410c);
      display: grid; place-items: center; font-weight: 800; font-size: 0.9rem; color: #fff;
    }
    .brain-pill {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 0.72rem; color: #6ee7b7; background: rgba(16,185,129,0.12);
      border: 1px solid rgba(16,185,129,0.3); padding: 4px 8px; border-radius: 999px;
      cursor: pointer;
    }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ok); }
    .voice-hero {
      padding: 16px; border-radius: 16px;
      background: linear-gradient(135deg, rgba(249,115,22,0.16), rgba(19,24,36,0.96));
      border: 1px solid rgba(249,115,22,0.35);
      display: flex; flex-direction: column; gap: 10px;
    }
    .voice-btn {
      width: 100%; border: none; border-radius: 12px; padding: 12px 14px;
      background: var(--accent); color: #fff; font-weight: 700; font-size: 0.9rem;
      cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
    }
    .voice-btn.listening { background: #10b981; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .action-card {
      padding: 11px; border-radius: 12px; background: var(--card);
      border: 1px solid var(--border); color: var(--text); text-align: left;
      cursor: pointer; display: flex; flex-direction: column; gap: 4px;
    }
    .action-card strong { font-size: 0.8rem; }
    .action-card span { font-size: 0.7rem; color: var(--muted); }
    .log-box {
      flex: 1; padding: 12px; border-radius: 14px; background: var(--card);
      border: 1px solid var(--border); display: flex; flex-direction: column; gap: 8px;
    }
    .msg {
      padding: 9px 11px; border-radius: 10px; background: var(--card-2);
      font-size: 0.78rem; line-height: 1.45;
    }
    .msg.user { border-left: 3px solid var(--accent); }
    .msg.bot { border-left: 3px solid var(--ok); }
    .footer-nav {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;
      padding: 8px; border-radius: 14px; background: var(--card); border: 1px solid var(--border);
    }
    .nav-item {
      border: none; background: transparent; color: var(--muted); font-size: 0.68rem;
      padding: 6px 4px; border-radius: 8px; cursor: pointer; font-weight: 600;
    }
    .nav-item.active { background: rgba(249,115,22,0.16); color: #fdba74; }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="brand">
      <div class="logo">${safeAssistant.slice(0, 1).toUpperCase()}</div>
      <div>
        <div style="font-weight:700;font-size:0.86rem;">${safeApp}</div>
        <div id="brainSub" style="font-size:0.68rem;color:var(--muted);">${safeUrl}</div>
      </div>
    </div>
    <button type="button" class="brain-pill" id="brainSwitchBtn" title="Alternar Cérebro conectado">
      <span class="dot"></span>
      <span id="brainLabel">${safeBrain}</span>
    </button>
  </header>

  <section class="voice-hero">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <strong style="font-size:0.88rem;">Voz Mãos-Livres · "Ei ${safeAssistant}"</strong>
      <span style="font-size:0.68rem;color:#fdba74;">Android Nativo</span>
    </div>
    <div id="voiceStatus" style="font-size:0.76rem;color:var(--muted);">
      Toque para falar direto com ${safeAssistant} ou use o Widget na tela inicial do Android.
    </div>
    <button type="button" class="voice-btn" id="micBtn">Falar agora com ${safeAssistant}</button>
  </section>

  <section class="grid">
    <button type="button" class="action-card" id="shareTestBtn">
      <strong>Enviar Link à Kira</strong>
      <span>Simular Compartilhar do WhatsApp</span>
    </button>
    <button type="button" class="action-card" id="qrPairBtn">
      <strong>Parear por QR Code</strong>
      <span>Conectar a outro Cérebro</span>
    </button>
    <button type="button" class="action-card" id="approvalBtn">
      <strong>Aprovação 1-Toque</strong>
      <span>Confirmar ação pendente</span>
    </button>
    <button type="button" class="action-card" id="offlineBtn">
      <strong>Fila Offline</strong>
      <span id="offlineCounter">0 pendente(s)</span>
    </button>
  </section>

  <section class="log-box" id="feed">
    <div style="font-size:0.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;">Atividade Recente</div>
    <div class="msg bot"><strong>${safeAssistant}:</strong> Conectado ao Cérebro com segurança via Android Keystore. Pronto para comandos de voz, câmera ou links compartilhados.</div>
  </section>

  <nav class="footer-nav">
    <button type="button" class="nav-item active">Início</button>
    <button type="button" class="nav-item">Chat</button>
    <button type="button" class="nav-item">Kira</button>
    <button type="button" class="nav-item">Cérebros</button>
  </nav>

  <script>
    const brains = [
      { label: ${JSON.stringify(config.brainName || 'Cérebro Casa · Local')}, url: ${JSON.stringify(config.serverUrl || 'http://192.168.1.50:3000')} },
      { label: 'Cérebro Docker · Servidor', url: 'https://jarvis-casa.ts.net' },
      { label: 'Modo Offline (Fila Local)', url: 'sqlite://local-cache' }
    ];
    let brainIdx = 0;
    let offlineCount = 0;
    const feed = document.getElementById('feed');

    function addMsg(kind, author, text) {
      const el = document.createElement('div');
      el.className = 'msg ' + kind;
      const strong = document.createElement('strong');
      strong.textContent = author + ': ';
      el.appendChild(strong);
      el.appendChild(document.createTextNode(text));
      feed.appendChild(el);
      feed.scrollTop = feed.scrollHeight;
    }

    document.getElementById('brainSwitchBtn').addEventListener('click', () => {
      brainIdx = (brainIdx + 1) % brains.length;
      document.getElementById('brainLabel').textContent = brains[brainIdx].label;
      document.getElementById('brainSub').textContent = brains[brainIdx].url;
      addMsg('bot', ${JSON.stringify(config.assistantName || 'JARVIS')}, 'Cérebro alternado para ' + brains[brainIdx].label + '.');
    });

    const micBtn = document.getElementById('micBtn');
    const voiceStatus = document.getElementById('voiceStatus');
    let listening = false;
    micBtn.addEventListener('click', () => {
      listening = !listening;
      micBtn.classList.toggle('listening', listening);
      micBtn.textContent = listening ? 'Ouvindo... toque para enviar' : 'Falar agora com ' + ${JSON.stringify(config.assistantName || 'JARVIS')};
      voiceStatus.textContent = listening ? 'Microfone Android ativo — diga seu comando.' : 'Comando recebido e processado!';
      if (!listening) {
        addMsg('user', 'Você (Voz)', 'Resuma minhas tarefas e avisos de hoje.');
        addMsg('bot', ${JSON.stringify(config.assistantName || 'JARVIS')}, 'Você tem 3 tarefas prioritárias e 1 fluxo pronto. Tudo sincronizado com seu Cérebro.');
      }
    });

    document.getElementById('shareTestBtn').addEventListener('click', () => {
      addMsg('user', 'Compartilhado (WhatsApp)', 'https://promo-suspeita-exemplo.xyz/resgate');
      addMsg('bot', 'Kira Sentinela', 'Alerta: link de domínio recém-criado detectado. Recomendado não informar senhas nem Pix.');
    });

    document.getElementById('qrPairBtn').addEventListener('click', () => {
      addMsg('bot', 'Scanner QR', 'Câmera pronta para ler o QR Code do seu PC ou container Docker sem digitar IPs.');
    });

    document.getElementById('approvalBtn').addEventListener('click', () => {
      addMsg('bot', 'Notificação Push', 'Aprovação confirmada em 1 toque com biometria Android.');
    });

    document.getElementById('offlineBtn').addEventListener('click', () => {
      offlineCount += 1;
      document.getElementById('offlineCounter').textContent = offlineCount + ' pendente(s)';
      addMsg('user', 'Fila Offline', 'Comando salvo localmente para sincronizar assim que o Wi-Fi voltar.');
    });
  </script>
</body>
</html>`;
}

export function buildAndroidMobileProjectFiles(rawConfig: AndroidMobileConfig): GeneratedAndroidFile[] {
  const packageId = normalizeAndroidAppId(rawConfig.packageId);
  const serverUrl = validateBrainServerUrl(rawConfig.serverUrl);
  const appName = (rawConfig.appName || `${rawConfig.assistantName || 'JARVIS'} Mobile`).trim();
  const assistantName = (rawConfig.assistantName || 'JARVIS').trim();
  const accentColor = sanitizeColor(rawConfig.accentColor);
  const caps = rawConfig.capabilities;
  const packagePath = packageId.replace(/\./g, '/');

  const config: AndroidMobileConfig = {
    ...rawConfig,
    appName,
    assistantName,
    packageId,
    serverUrl,
    accentColor,
  };

  const packageJson = {
    name: packageId.replace(/\./g, '-'),
    version: '1.0.0',
    description: `${appName} — Aplicativo Android oficial conectado ao Cérebro JARVIS`,
    private: true,
    scripts: {
      'android:init': 'npx cap add android && node scripts/apply-android-overlay.mjs',
      'android:sync': 'npx cap sync android && node scripts/apply-android-overlay.mjs',
      'android:open': 'npx cap open android',
      'android:apk': 'cd android && ./gradlew assembleRelease',
      'android:aab': 'cd android && ./gradlew bundleRelease',
    },
    dependencies: {
      '@capacitor/core': '^6.2.0',
      '@capacitor/android': '^6.2.0',
      '@capacitor/app': '^6.0.2',
      '@capacitor/network': '^6.0.3',
      '@capacitor/preferences': '^6.0.3',
      ...(caps.cameraAndQr ? { '@capacitor/camera': '^6.1.0' } : {}),
      ...(caps.pushNotifications ? { '@capacitor/push-notifications': '^6.0.4' } : {}),
      ...(caps.voiceWakeWord ? { '@capacitor-community/speech-recognition': '^6.0.0' } : {}),
      ...(caps.biometricLock ? { 'capacitor-native-biometric': '^4.2.2' } : {}),
    },
    devDependencies: {
      '@capacitor/cli': '^6.2.0',
    },
  };

  const capacitorConfigTs = `import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: '${packageId}',
  appName: '${appName.replace(/'/g, "\\'")}',
  webDir: 'www',
  server: {
    androidScheme: 'https',
    // Para apontar direto ao seu Cérebro em desenvolvimento, descomente a linha abaixo:
    // url: '${serverUrl}',
    cleartext: false,
  },
  android: {
    backgroundColor: '#0b0d12',
    allowMixedContent: false,
    captureInput: true,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
`;

  const permissions: string[] = [
    '    <uses-permission android:name="android.permission.INTERNET" />',
    '    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
  ];
  if (caps.voiceWakeWord) {
    permissions.push('    <uses-permission android:name="android.permission.RECORD_AUDIO" />');
    permissions.push('    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />');
    permissions.push('    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />');
  }
  if (caps.cameraAndQr) {
    permissions.push('    <uses-permission android:name="android.permission.CAMERA" />');
  }
  if (caps.pushNotifications) {
    permissions.push('    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />');
  }
  if (caps.biometricLock) {
    permissions.push('    <uses-permission android:name="android.permission.USE_BIOMETRIC" />');
  }

  const shareIntentBlock = caps.shareIntent
    ? `
            <!-- Compartilhar links do WhatsApp, PDFs e imagens direto para a Kira / Maestro -->
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="text/plain" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="image/*" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="application/pdf" />
            </intent-filter>`
    : '';

  const widgetReceiverBlock = caps.homeScreenWidget
    ? `
        <!-- Widget na tela inicial do Android: 1 toque para falar com ${escapeXml(assistantName)} -->
        <receiver
            android:name=".JarvisVoiceWidgetProvider"
            android:exported="false">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/jarvis_voice_widget_info" />
        </receiver>`
    : '';

  const androidManifestXml = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

${permissions.join('\n')}

    <application
        android:allowBackup="false"
        android:icon="@mipmap/ic_launcher"
        android:label="${escapeXml(appName)}"
        android:networkSecurityConfig="@xml/network_security_config"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme">

        <activity
            android:name=".MainActivity"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
            android:exported="true"
            android:launchMode="singleTask"
            android:theme="@style/AppTheme.NoActionBarLaunch">

            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>${shareIntentBlock}
        </activity>${widgetReceiverBlock}
    </application>
</manifest>
`;

  const parsedHost = (() => {
    try {
      return new URL(serverUrl).hostname;
    } catch {
      return '192.168.1.50';
    }
  })();

  const networkSecurityXml = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- HTTPS estrito por padrão para qualquer acesso remoto pela internet -->
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>

    <!-- Tráfego HTTP permitido apenas para o Cérebro confiável na sua rede local -->
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">localhost</domain>
        <domain includeSubdomains="false">127.0.0.1</domain>
        <domain includeSubdomains="false">${escapeXml(parsedHost)}</domain>
    </domain-config>
</network-security-config>
`;

  const voiceWidgetKt = `package ${packageId}

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

/**
 * Widget oficial de tela inicial: abre o ${assistantName} Mobile já ouvindo voz imediatamente.
 */
class JarvisVoiceWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            val launchIntent = Intent(context, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                data = Uri.parse("jarvis://voice/listen")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pendingIntent = PendingIntent.getActivity(
                context,
                0,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val views = RemoteViews(context.packageName, R.layout.jarvis_voice_widget).apply {
                setOnClickPendingIntent(R.id.jarvis_widget_root, pendingIntent)
            }
            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
`;

  const voiceWidgetLayoutXml = `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/jarvis_widget_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="#121622"
    android:gravity="center_vertical"
    android:orientation="horizontal"
    android:padding="14dp">

    <TextView
        android:layout_width="36dp"
        android:layout_height="36dp"
        android:background="${accentColor}"
        android:gravity="center"
        android:text="${escapeXml(assistantName.slice(0, 1).toUpperCase())}"
        android:textColor="#FFFFFF"
        android:textSize="16sp"
        android:textStyle="bold" />

    <LinearLayout
        android:layout_width="0dp"
        android:layout_height="wrap_content"
        android:layout_marginStart="12dp"
        android:layout_weight="1"
        android:orientation="vertical">

        <TextView
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="Ei ${escapeXml(assistantName)}"
            android:textColor="#F8FAFC"
            android:textSize="15sp"
            android:textStyle="bold" />

        <TextView
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="Toque para falar com seu Cérebro"
            android:textColor="#94A3B8"
            android:textSize="12sp" />
    </LinearLayout>
</LinearLayout>
`;

  const githubActionsYml = `name: Build JARVIS Mobile Android (APK & AAB)

on:
  workflow_dispatch:
  push:
    tags:
      - 'v*'

jobs:
  android-release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 17

      - name: Install dependencies and sync Capacitor
        run: |
          npm ci
          npm run android:sync

      - name: Decode upload keystore (from GitHub Secrets)
        if: \${{ secrets.ANDROID_KEYSTORE_BASE64 != '' }}
        env:
          KEYSTORE_B64: \${{ secrets.ANDROID_KEYSTORE_BASE64 }}
        run: |
          echo "$KEYSTORE_B64" | base64 --decode > android/app/upload-keystore.jks

      - name: Build APK and Play Store AAB
        env:
          ANDROID_KEYSTORE_PASSWORD: \${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          ANDROID_KEY_ALIAS: \${{ secrets.ANDROID_KEY_ALIAS }}
          ANDROID_KEY_PASSWORD: \${{ secrets.ANDROID_KEY_PASSWORD }}
        run: |
          cd android
          ./gradlew assembleRelease bundleRelease

      - name: Upload APK & AAB artifacts
        uses: actions/upload-artifact@v4
        with:
          name: jarvis-mobile-android
          path: |
            android/app/build/outputs/apk/release/*.apk
            android/app/build/outputs/bundle/release/*.aab
`;

  const applyOverlayScript = `import fs from 'node:fs';
import path from 'node:path';

const srcBase = path.resolve('android-overlay');
const dstBase = path.resolve('android');

function copyRecursive(src, dst) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dst, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

if (!fs.existsSync(dstBase)) {
  console.log('Pasta android/ ainda não existe. Rode primeiro: npx cap add android');
  process.exit(0);
}

copyRecursive(srcBase, dstBase);
console.log('Overlay nativo do ${appName} aplicado com sucesso em android/!');
`;

  const readmeMd = `# ${appName} — Projeto Android Oficial (.apk e .aab)

Este pacote foi gerado pelo **JARVIS AI Hub (Fase 7)** com Capacitor 6, permissões Android configuradas, segurança de rede estrita, compartilhamento nativo (Share Intent) e Widget de voz na tela inicial.

## Dados do Projeto
- **Nome do App**: ${appName}
- **Application ID**: \`${packageId}\`
- **Cérebro padrão**: ${config.brainName} (\`${serverUrl}\`)
- **Assistente de voz**: "Ei ${assistantName}"

## Pré-requisitos
1. **Node.js 20+**
2. **JDK 17+** (Temurin)
3. **Android Studio** com **Android SDK 34/35**

## Passo a Passo para Gerar o APK (Instalação Direta) ou AAB (Play Store)

\`\`\`bash
# 1. Instalar dependências do Capacitor e plugins nativos
npm install

# 2. Criar o projeto nativo Android e aplicar permissões, Widget e Share Intent
npm run android:init

# 3. Abrir no Android Studio
npm run android:open
\`\`\`

No Android Studio:
- Para testar no celular via USB: clique em **Run (▶)**.
- Para gerar **APK instalável**: menu \`Build > Build Bundle(s) / APK(s) > Build APK(s)\` ou rode \`npm run android:apk\`.
- Para publicar na **Google Play Store (.aab)**: menu \`Build > Generate Signed Bundle / APK > Android App Bundle\` ou rode \`npm run android:aab\`.

## Criando sua chave de assinatura (fora do Git)
\`\`\`bash
keytool -genkey -v -keystore upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias jarvis-release
\`\`\`
Nunca salve a senha ou o arquivo \`.jks\` dentro de repositórios públicos — use GitHub Secrets no workflow \`.github/workflows/android-release.yml\`.
`;

  return [
    {
      path: 'package.json',
      language: 'json',
      description: 'Dependências Capacitor 6, plugins nativos Android e scripts de build APK/AAB',
      content: JSON.stringify(packageJson, null, 2),
    },
    {
      path: 'capacitor.config.ts',
      language: 'typescript',
      description: 'Configuração principal do app Android, esquema HTTPS e tema Obsidian',
      content: capacitorConfigTs,
    },
    {
      path: 'android-overlay/app/src/main/AndroidManifest.xml',
      language: 'xml',
      description: 'Permissões nativas (Microfone, Câmera, Push, Biometria), Share Intent e Widget',
      content: androidManifestXml,
    },
    {
      path: 'android-overlay/app/src/main/res/xml/network_security_config.xml',
      language: 'xml',
      description: 'HTTPS estrito remoto + permissão controlada para o seu Cérebro na rede local',
      content: networkSecurityXml,
    },
    {
      path: `android-overlay/app/src/main/java/${packagePath}/JarvisVoiceWidgetProvider.kt`,
      language: 'kotlin',
      description: 'Widget Kotlin na tela inicial do Android para abrir ouvindo voz em 1 toque',
      content: voiceWidgetKt,
    },
    {
      path: 'android-overlay/app/src/main/res/layout/jarvis_voice_widget.xml',
      language: 'xml',
      description: 'Layout visual Obsidian & Laranja do Widget de voz na tela inicial',
      content: voiceWidgetLayoutXml,
    },
    {
      path: 'scripts/apply-android-overlay.mjs',
      language: 'typescript',
      description: 'Script automático que aplica permissões, manifest e widget dentro da pasta android/',
      content: applyOverlayScript,
    },
    {
      path: '.github/workflows/android-release.yml',
      language: 'yaml',
      description: 'Pipeline automático (GitHub Actions) para compilar APK e AAB assinados',
      content: githubActionsYml,
    },
    {
      path: 'www/index.html',
      language: 'html',
      description: 'Interface mobile empacotada no APK com voz, seletor Multi-Cérebros e modo offline',
      content: buildAndroidMobilePreviewHtml(config),
    },
    {
      path: 'README_ANDROID_APK_AAB.md',
      language: 'markdown',
      description: 'Guia passo a passo em português para gerar APK, AAB e assinatura Play Store',
      content: readmeMd,
    },
  ];
}
