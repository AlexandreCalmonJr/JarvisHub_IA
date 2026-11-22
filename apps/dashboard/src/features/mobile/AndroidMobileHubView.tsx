import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  Smartphone,
  QrCode,
  Download,
  RefreshCw,
  ShieldCheck,
  Mic,
  Camera,
  Share2,
  Bell,
  Fingerprint,
  WifiOff,
  LayoutGrid,
  Code2,
  BookOpen,
  Copy,
  Check,
  Trash2,
  Plus,
  Loader2,
  AlertCircle,
  Terminal,
  CheckCircle2,
  FolderOpen,
  FileCode2,
  Sliders,
} from 'lucide-react';
import {
  AndroidMobileCapabilities,
  AndroidMobileConfig,
  DEFAULT_ANDROID_CAPABILITIES,
  GeneratedAndroidFile,
  PairedDeviceRecord,
  PairingSessionInfo,
} from '../../services/androidAppEngine';
import {
  confirmDevicePairingApi,
  downloadAndroidAppZipApi,
  fetchPairedDevicesApi,
  initDevicePairingApi,
  previewAndroidAppProjectApi,
  revokePairedDeviceApi,
} from '../../services/api/androidApp';
import { useAssistantIdentity } from '../../context/AssistantIdentityContext';
import { notify } from '../../shared/common/Toast';

type AndroidHubTab = 'pairing' | 'customize' | 'files' | 'guide';

function formatKb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const CAPABILITY_ITEMS: Array<{
  key: keyof AndroidMobileCapabilities;
  title: string;
  description: string;
  permission: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
}> = [
  {
    key: 'voiceWakeWord',
    title: 'Voz Mãos-Livres ("Ei [Nome]")',
    description: 'Captura de voz imediata e serviço em primeiro plano para escuta contínua no Android.',
    permission: 'RECORD_AUDIO',
    icon: Mic,
  },
  {
    key: 'homeScreenWidget',
    title: 'Widget na Tela Inicial',
    description: 'Atalho Kotlin nativo na tela inicial do celular para falar em 1 toque.',
    permission: 'AppWidgetProvider',
    icon: LayoutGrid,
  },
  {
    key: 'cameraAndQr',
    title: 'Câmera & Scanner QR Code',
    description: 'Pareamento sem digitação e foto instantânea de recibos, boletos ou quadros.',
    permission: 'CAMERA',
    icon: Camera,
  },
  {
    key: 'shareIntent',
    title: 'Compartilhar do WhatsApp → Kira',
    description: 'Registra ACTION_SEND no Android para enviar links suspeitos, PDFs e imagens ao JARVIS.',
    permission: 'ACTION_SEND',
    icon: Share2,
  },
  {
    key: 'pushNotifications',
    title: 'Notificações Push & Aprovações',
    description: 'Avisos nativos de fluxos, alertas de segurança e botões Aprovar/Recusar.',
    permission: 'POST_NOTIFICATIONS',
    icon: Bell,
  },
  {
    key: 'biometricLock',
    title: 'Biometria & Android Keystore',
    description: 'Tokens criptografados no hardware do aparelho com proteção por digital/rosto.',
    permission: 'USE_BIOMETRIC',
    icon: Fingerprint,
  },
  {
    key: 'offlineQueue',
    title: 'Modo Offline & Sincronização',
    description: 'Cache local das últimas conversas e fila de comandos que sincroniza ao reconectar.',
    permission: 'ACCESS_NETWORK_STATE',
    icon: WifiOff,
  },
];

export const AndroidMobileHubView: React.FC = () => {
  const { assistantName } = useAssistantIdentity();
  const [activeTab, setActiveTab] = useState<AndroidHubTab>('pairing');

  // Config do app Android
  const [appName, setAppName] = useState(`${assistantName} Mobile`);
  const [packageId, setPackageId] = useState('br.jarvis.mobile');
  const [serverUrl, setServerUrl] = useState(() =>
    typeof window !== 'undefined' && window.location.origin.startsWith('https://')
      ? window.location.origin
      : 'http://192.168.1.50:3000'
  );
  const [brainName, setBrainName] = useState('Cérebro Casa · Local');
  const [capabilities, setCapabilities] = useState<AndroidMobileCapabilities>(DEFAULT_ANDROID_CAPABILITIES);

  // Pareamento e dispositivos
  const [devices, setDevices] = useState<PairedDeviceRecord[]>([]);
  const [pairing, setPairing] = useState<PairingSessionInfo | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [pairingBusy, setPairingBusy] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [testDeviceName, setTestDeviceName] = useState('Meu Celular Android');
  const [testDeviceModel, setTestDeviceModel] = useState('Samsung Galaxy / Pixel');
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Artefatos gerados
  const [files, setFiles] = useState<GeneratedAndroidFile[]>([]);
  const [previewHtml, setPreviewHtml] = useState('');
  const [zipSizeBytes, setZipSizeBytes] = useState(0);
  const [selectedFilePath, setSelectedFilePath] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const currentConfig: Partial<AndroidMobileConfig> = useMemo(
    () => ({
      appName,
      assistantName,
      packageId,
      serverUrl,
      brainName,
      accentColor: '#f97316',
      capabilities,
    }),
    [appName, assistantName, packageId, serverUrl, brainName, capabilities]
  );

  const activeFile = useMemo(
    () => files.find((f) => f.path === selectedFilePath) || files[0] || null,
    [files, selectedFilePath]
  );

  const loadDevicesAndArtifacts = async () => {
    setPreviewLoading(true);
    setErrorMsg(null);
    try {
      const [devRes, artRes] = await Promise.all([
        fetchPairedDevicesApi(),
        previewAndroidAppProjectApi(currentConfig),
      ]);
      setDevices(devRes.devices || []);
      setPairing(devRes.pairing || null);
      setFiles(artRes.files || []);
      setPreviewHtml(artRes.preview_html || '');
      setZipSizeBytes(artRes.zip_size_bytes || 0);
      setSelectedFilePath((prev) => prev || artRes.files[0]?.path || '');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao carregar central do aplicativo Android.');
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    void loadDevicesAndArtifacts();
  }, []);

  useEffect(() => {
    if (!pairing?.qr_payload) return;
    QRCode.toDataURL(pairing.qr_payload, {
      width: 204,
      margin: 2,
      color: { dark: '#0b0d12', light: '#f8fafc' },
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [pairing?.qr_payload]);

  const handleRebuildArtifacts = async () => {
    setPreviewLoading(true);
    setErrorMsg(null);
    try {
      const res = await previewAndroidAppProjectApi(currentConfig);
      setFiles(res.files || []);
      setPreviewHtml(res.preview_html || '');
      setZipSizeBytes(res.zip_size_bytes || 0);
      setPackageId(res.config.packageId);
      setServerUrl(res.config.serverUrl);
      if (!res.files.some((f) => f.path === selectedFilePath)) {
        setSelectedFilePath(res.files[0]?.path || '');
      }
      notify('Artefatos nativos Android e prévia atualizados!', 'success');
    } catch (err: any) {
      const msg = err?.message || 'Verifique o endereço do servidor ou ID do pacote.';
      setErrorMsg(msg);
      notify(msg, 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleRegenerateQr = async () => {
    setPairingBusy(true);
    setErrorMsg(null);
    try {
      const next = await initDevicePairingApi({ serverUrl, brainName, assistantName });
      setPairing(next);
      notify(`Novo QR Code de pareamento gerado (${next.pairing_code}).`, 'success');
    } catch (err: any) {
      const msg = err?.message || 'Não foi possível gerar novo QR Code.';
      setErrorMsg(msg);
      notify(msg, 'error');
    } finally {
      setPairingBusy(false);
    }
  };

  const handleConfirmTestPairing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pairing?.pairing_code) return;
    setConfirmBusy(true);
    setErrorMsg(null);
    try {
      const res = await confirmDevicePairingApi({
        pairingCode: pairing.pairing_code,
        deviceName: testDeviceName.trim() || 'Celular Android',
        model: testDeviceModel.trim() || 'Android 14',
        osVersion: 'Android 15',
      });
      setDevices(res.devices || []);
      setPairing(res.pairing || null);
      notify(`Aparelho "${res.device.name}" pareado com sucesso!`, 'success');
    } catch (err: any) {
      const msg = err?.message || 'Falha ao confirmar pareamento.';
      setErrorMsg(msg);
      notify(msg, 'error');
    } finally {
      setConfirmBusy(false);
    }
  };

  const handleRevokeDevice = async (device: PairedDeviceRecord) => {
    setRevokingId(device.id);
    try {
      const res = await revokePairedDeviceApi(device.id);
      setDevices(res.devices || []);
      notify(`Acesso revogado para "${device.name}".`, 'info');
    } catch (err: any) {
      notify(err?.message || 'Erro ao revogar acesso do dispositivo.', 'error');
    } finally {
      setRevokingId(null);
    }
  };

  const handleDownloadAndroidZip = async () => {
    setDownloadingZip(true);
    setErrorMsg(null);
    try {
      const filename = await downloadAndroidAppZipApi(currentConfig);
      notify(`Projeto Android baixado: ${filename}`, 'success');
    } catch (err: any) {
      const msg = err?.message || 'Falha ao baixar o projeto Android (.zip).';
      setErrorMsg(msg);
      notify(msg, 'error');
    } finally {
      setDownloadingZip(false);
    }
  };

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      notify('Copiado para a área de transferência.', 'success');
      setTimeout(() => setCopiedKey((curr) => (curr === key ? null : curr)), 1800);
    } catch {
      notify('Não foi possível copiar automaticamente.', 'warning');
    }
  };

  const toggleCapability = (key: keyof AndroidMobileCapabilities) => {
    setCapabilities((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', paddingBottom: '36px' }}>
      {/* Cabeçalho Principal */}
      <section
        className="jarvis-settings-card"
        style={{
          padding: '22px 24px',
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '18px',
          background:
            'linear-gradient(135deg, rgba(249, 115, 22, 0.09) 0%, rgba(15, 19, 28, 0.96) 55%, rgba(15, 19, 28, 1) 100%)',
          borderColor: 'rgba(249, 115, 22, 0.28)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', flex: '1 1 420px', maxWidth: '660px' }}>
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
              boxShadow: '0 8px 20px rgba(249, 115, 22, 0.28)',
            }}
          >
            <Smartphone size={22} />
          </div>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: '1.28rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
              }}
            >
              {appName} — Aplicativo Android (.apk &amp; .aab)
            </h1>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: '0.88rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
              }}
            >
              Conecte seu celular por <strong>QR Code sem digitação</strong>, gerencie dispositivos pareados e
              baixe o projeto oficial <strong>Capacitor 6 + Kotlin/XML</strong> pronto para gerar o{' '}
              <strong>APK instalável</strong> ou o <strong>AAB da Play Store</strong>.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
          <button
            type="button"
            disabled={downloadingZip}
            onClick={() => void handleDownloadAndroidZip()}
            className="btn btn-primary"
          >
            {downloadingZip ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
            <span>Baixar Projeto Android (.zip)</span>
          </button>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {files.length || 10} arquivos nativos · {formatKb(zipSizeBytes)} · {packageId}
          </span>
        </div>
      </section>

      {errorMsg && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            borderRadius: '10px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#fca5a5',
            fontSize: '0.83rem',
          }}
        >
          <AlertCircle size={15} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Abas da Central Android */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }} role="tablist" aria-label="Seções do App Android">
        {(
          [
            { id: 'pairing', label: 'QR Code & Dispositivos', icon: QrCode },
            { id: 'customize', label: 'Recursos Nativos & Prévia', icon: Sliders },
            { id: 'files', label: `Arquivos Android (${files.length || 10})`, icon: Code2 },
            { id: 'guide', label: 'Guia APK & Play Store (.aab)', icon: BookOpen },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={active ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ABA 1: PAREAMENTO QR CODE & DISPOSITIVOS PAREADOS */}
      {activeTab === 'pairing' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: '18px',
            alignItems: 'start',
          }}
        >
          {/* Cartão do QR Code */}
          <section className="jarvis-settings-card" style={{ padding: '22px', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Pareamento por QR Code (Zero Digitação)
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Abra o {appName} no Android e aponte a câmera para conectar com token revogável.
                </p>
              </div>
              <button
                type="button"
                disabled={pairingBusy}
                onClick={() => void handleRegenerateQr()}
                className="btn btn-secondary btn-sm"
              >
                <RefreshCw size={13} className={pairingBusy ? 'spin' : ''} />
                <span>Novo QR</span>
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '20px',
                padding: '16px',
                borderRadius: '12px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
              }}
            >
              <div
                style={{
                  width: '188px',
                  height: '188px',
                  borderRadius: '12px',
                  backgroundColor: '#f8fafc',
                  padding: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="QR Code de pareamento do aplicativo Android"
                    style={{ width: '100%', height: '100%', display: 'block', borderRadius: '6px' }}
                  />
                ) : (
                  <Loader2 size={24} className="spin" color="#0b0d12" />
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: '1 1 180px' }}>
                <div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                    Código efêmero (expira em 10 min)
                  </span>
                  <div
                    style={{
                      marginTop: '4px',
                      fontSize: '1.45rem',
                      fontWeight: 800,
                      letterSpacing: '0.1em',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--accent-light)',
                    }}
                  >
                    {pairing?.pairing_code || '----'}
                  </div>
                </div>

                <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  <div>
                    <strong>Cérebro:</strong> {pairing?.brain_name || brainName}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {pairing?.server_url || serverUrl}
                  </div>
                </div>

                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.73rem',
                    color: '#6ee7b7',
                  }}
                >
                  <ShieldCheck size={14} />
                  <span>Armazenado no Android Keystore · uso único</span>
                </div>
              </div>
            </div>

            {/* Confirmar / Simular pareamento de aparelho */}
            <form
              onSubmit={handleConfirmTestPairing}
              className="jarvis-settings-subcard"
              style={{ padding: '14px', gap: '10px' }}
            >
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Confirmar pareamento de um celular Android
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <input
                  type="text"
                  className="jarvis-input"
                  aria-label="Nome do celular"
                  value={testDeviceName}
                  onChange={(e) => setTestDeviceName(e.target.value)}
                  placeholder="Ex.: Celular do Alexandre"
                />
                <input
                  type="text"
                  className="jarvis-input"
                  aria-label="Modelo do celular"
                  value={testDeviceModel}
                  onChange={(e) => setTestDeviceModel(e.target.value)}
                  placeholder="Ex.: Galaxy S24 / Pixel 9"
                />
              </div>
              <button
                type="submit"
                disabled={confirmBusy || !pairing?.pairing_code}
                className="btn btn-secondary btn-sm"
                style={{ alignSelf: 'flex-start' }}
              >
                {confirmBusy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                <span>Confirmar Pareamento com Código Atual</span>
              </button>
            </form>
          </section>

          {/* Lista de Dispositivos Pareados */}
          <section className="jarvis-settings-card" style={{ padding: '22px', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Dispositivos Conectados ({devices.length})
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Revogue o acesso de qualquer celular ou tablet instantaneamente se trocar ou perder o aparelho.
                </p>
              </div>
            </div>

            {devices.length === 0 ? (
              <div
                className="jarvis-settings-subcard"
                style={{ padding: '24px', alignItems: 'center', textAlign: 'center', gap: '8px' }}
              >
                <Smartphone size={24} color="var(--text-muted)" />
                <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                  Nenhum celular pareado ainda
                </strong>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Escaneie o QR Code ao lado ou confirme um pareamento de teste para ver o dispositivo aqui.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {devices.map((dev) => (
                  <div
                    key={dev.id}
                    className="jarvis-settings-subcard"
                    style={{
                      padding: '14px',
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '10px',
                          backgroundColor: 'var(--accent-soft)',
                          border: '1px solid var(--border-accent)',
                          color: 'var(--accent-light)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Smartphone size={17} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                            {dev.name}
                          </strong>
                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              color: dev.status === 'online' ? '#6ee7b7' : 'var(--text-muted)',
                              backgroundColor:
                                dev.status === 'online' ? 'rgba(16, 185, 129, 0.14)' : 'var(--bg-primary)',
                              padding: '1px 7px',
                              borderRadius: '6px',
                            }}
                          >
                            {dev.status === 'online' ? 'Online' : 'Offline'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          {dev.model} · {dev.os_version} · chave{' '}
                          <code style={{ fontFamily: 'var(--font-mono)' }}>{dev.token_hint}</code>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={revokingId === dev.id}
                      onClick={() => void handleRevokeDevice(dev)}
                      className="btn btn-danger-ghost btn-sm"
                      title="Revogar acesso deste aparelho"
                    >
                      {revokingId === dev.id ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />}
                      <span>Revogar</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ABA 2: PERSONALIZAÇÃO DE RECURSOS NATIVOS + PRÉVIA ANDROID AO VIVO */}
      {activeTab === 'customize' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(320px, 1.15fr) minmax(320px, 412px)',
            gap: '20px',
            alignItems: 'start',
          }}
        >
          <section className="jarvis-settings-card" style={{ padding: '22px', gap: '18px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Identidade &amp; Permissões Nativas do APK/AAB
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Cada opção atualiza automaticamente o <code>AndroidManifest.xml</code>, <code>capacitor.config.ts</code> e o Widget Kotlin antes do download.
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label htmlFor="android-app-name" style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Nome do App no Android
                </label>
                <input
                  id="android-app-name"
                  type="text"
                  className="jarvis-input"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label htmlFor="android-pkg-id" style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Application ID (Play Store)
                </label>
                <input
                  id="android-pkg-id"
                  type="text"
                  className="jarvis-input"
                  style={{ fontFamily: 'var(--font-mono)' }}
                  value={packageId}
                  onChange={(e) => setPackageId(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label htmlFor="android-server-url" style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  URL do Cérebro Padrão
                </label>
                <input
                  id="android-server-url"
                  type="text"
                  className="jarvis-input"
                  style={{ fontFamily: 'var(--font-mono)' }}
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="https://meu-jarvis.ts.net ou http://192.168.1.50:3000"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label htmlFor="android-brain-name" style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Rótulo do Cérebro
                </label>
                <input
                  id="android-brain-name"
                  type="text"
                  className="jarvis-input"
                  value={brainName}
                  onChange={(e) => setBrainName(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
              {CAPABILITY_ITEMS.map((item) => {
                const Icon = item.icon;
                const enabled = capabilities[item.key];
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => toggleCapability(item.key)}
                    aria-pressed={enabled}
                    className="jarvis-settings-subcard"
                    style={{
                      padding: '12px 14px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      borderColor: enabled ? 'rgba(249, 115, 22, 0.45)' : 'var(--border-color)',
                      backgroundColor: enabled ? 'rgba(249, 115, 22, 0.06)' : undefined,
                      gap: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Icon size={15} color={enabled ? '#f97316' : 'var(--text-muted)'} />
                        <strong style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                          {item.title.replace('[Nome]', assistantName)}
                        </strong>
                      </div>
                      <span
                        style={{
                          fontSize: '0.66rem',
                          fontWeight: 700,
                          color: enabled ? '#6ee7b7' : 'var(--text-muted)',
                        }}
                      >
                        {enabled ? 'ATIVO' : 'OFF'}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                      {item.description}
                    </p>
                    <code style={{ fontSize: '0.67rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {item.permission}
                    </code>
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={previewLoading}
                onClick={() => void handleRebuildArtifacts()}
                className="btn btn-primary btn-sm"
              >
                {previewLoading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
                <span>Atualizar Prévia &amp; Artefatos Android</span>
              </button>
              <button
                type="button"
                disabled={downloadingZip}
                onClick={() => void handleDownloadAndroidZip()}
                className="btn btn-secondary btn-sm"
              >
                <Download size={14} />
                <span>Baixar .zip atualizado</span>
              </button>
            </div>
          </section>

          {/* Prévia Interativa em Moldura Android */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 size={13} color="var(--success-color)" />
              <span>Prévia interativa do app empacotado no APK</span>
            </div>
            <div
              style={{
                width: '100%',
                maxWidth: '400px',
                borderRadius: '34px',
                padding: '12px',
                background: 'linear-gradient(180deg, #1b2230 0%, #0d1119 100%)',
                border: '2px solid rgba(255, 255, 255, 0.12)',
                boxShadow: '0 24px 60px rgba(0, 0, 0, 0.55)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 14px 10px',
                  fontSize: '0.7rem',
                  color: '#94a3b8',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <span>09:41</span>
                <div style={{ width: '62px', height: '6px', borderRadius: '999px', backgroundColor: 'rgba(255,255,255,0.16)' }} />
                <span>Android 15</span>
              </div>
              <iframe
                title={`Prévia Android de ${appName}`}
                srcDoc={previewHtml}
                sandbox="allow-scripts"
                style={{
                  width: '100%',
                  height: '620px',
                  border: 'none',
                  borderRadius: '22px',
                  backgroundColor: '#0b0d12',
                  display: 'block',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ABA 3: EXPLORADOR DOS ARQUIVOS NATIVOS ANDROID */}
      {activeTab === 'files' && (
        <section
          className="jarvis-settings-card"
          style={{
            padding: '20px',
            display: 'grid',
            gridTemplateColumns: 'minmax(240px, 310px) minmax(0, 1fr)',
            gap: '16px',
            alignItems: 'start',
          }}
        >
          <div className="jarvis-settings-subcard" style={{ padding: '10px', gap: '4px' }}>
            <div
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                color: 'var(--text-muted)',
                padding: '4px 8px 6px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <FolderOpen size={13} />
              <span>{packageId.replace(/\./g, '-')}-android/</span>
            </div>
            {files.map((file) => {
              const selected = activeFile?.path === file.path;
              const slashIdx = file.path.lastIndexOf('/');
              const fileName = slashIdx >= 0 ? file.path.slice(slashIdx + 1) : file.path;
              const dirPath = slashIdx >= 0 ? file.path.slice(0, slashIdx) : '';
              return (
                <button
                  key={file.path}
                  type="button"
                  title={file.path}
                  onClick={() => setSelectedFilePath(file.path)}
                  className={selected ? 'btn btn-primary btn-sm btn-start' : 'btn btn-ghost btn-sm btn-start'}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.74rem',
                    width: '100%',
                    height: 'auto',
                    padding: '7px 10px',
                    justifyContent: 'flex-start',
                    alignItems: 'flex-start',
                  }}
                >
                  <FileCode2 size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, textAlign: 'left' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                      {fileName}
                    </span>
                    {dirPath && (
                      <span
                        style={{
                          fontSize: '0.64rem',
                          opacity: selected ? 0.85 : 0.58,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {dirPath}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {activeFile && (
            <div className="jarvis-settings-subcard" style={{ padding: 0, overflow: 'hidden', minWidth: 0 }}>
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-elevated)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {activeFile.path}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {activeFile.description}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopy(activeFile.content, `file-${activeFile.path}`)}
                  className="btn btn-secondary btn-sm"
                >
                  {copiedKey === `file-${activeFile.path}` ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copiedKey === `file-${activeFile.path}` ? 'Copiado' : 'Copiar arquivo'}</span>
                </button>
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: '16px',
                  maxHeight: '540px',
                  overflow: 'auto',
                  fontSize: '0.77rem',
                  lineHeight: 1.55,
                  fontFamily: 'var(--font-mono)',
                  color: '#e2e8f0',
                  backgroundColor: '#090c12',
                }}
              >
                <code>{activeFile.content}</code>
              </pre>
            </div>
          )}
        </section>
      )}

      {/* ABA 4: GUIA COMPLETO APK, AAB E PLAY STORE */}
      {activeTab === 'guide' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
            gap: '16px',
          }}
        >
          {[
            {
              id: 'g1',
              badge: 'Passo 1 · Pré-requisitos',
              title: 'Instale Node 20+, JDK 17 e Android Studio',
              desc: 'Extraia o arquivo .zip baixado em uma pasta no seu PC e instale as dependências do Capacitor 6 + plugins nativos.',
              cmds: ['npm install', 'npm run android:init'],
            },
            {
              id: 'g2',
              badge: 'Passo 2 · Testar no Celular',
              title: 'Abra no Android Studio (SDK 34/35)',
              desc: 'O comando abre o projeto com todas as permissões, Share Intent do WhatsApp e o Widget de voz Kotlin já aplicados.',
              cmds: ['npm run android:open'],
            },
            {
              id: 'g3',
              badge: 'Passo 3 · APK Instalável Direto',
              title: 'Gere o APK para instalar sem Play Store',
              desc: 'Compila o instalador .apk pronto para transferir ao seu aparelho Android ou baixar pela sua rede.',
              cmds: ['npm run android:apk'],
            },
            {
              id: 'g4',
              badge: 'Passo 4 · Google Play Store (.aab)',
              title: 'Crie a chave de assinatura e gere o AAB',
              desc: 'Gere seu cofre upload-keystore.jks fora do repositório Git e compile o Android App Bundle oficial.',
              cmds: [
                'keytool -genkey -v -keystore upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias jarvis-release',
                'npm run android:aab',
              ],
            },
          ].map((step) => (
            <div
              key={step.id}
              className="jarvis-settings-card"
              style={{ padding: '18px', justifyContent: 'space-between', gap: '12px' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-light)', textTransform: 'uppercase' }}>
                  {step.badge}
                </span>
                <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {step.title}
                </h3>
                <p style={{ margin: 0, fontSize: '0.81rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {step.desc}
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {step.cmds.map((cmd) => {
                  const key = `${step.id}-${cmd}`;
                  return (
                    <div
                      key={key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        backgroundColor: '#090c12',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <Terminal size={13} color="var(--accent-light)" style={{ flexShrink: 0 }} />
                        <code
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.75rem',
                            color: '#f8fafc',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {cmd}
                        </code>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleCopy(cmd, key)}
                        className="btn btn-ghost btn-icon-sm"
                        title="Copiar comando"
                        aria-label={`Copiar ${cmd}`}
                      >
                        {copiedKey === key ? <Check size={13} color="var(--success-color)" /> : <Copy size={13} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
