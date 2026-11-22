import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppWindow,
  Smartphone,
  Monitor,
  Layers,
  Download,
  Code2,
  BookOpen,
  Play,
  Trash2,
  Copy,
  Check,
  Sparkles,
  Loader2,
  AlertCircle,
  RotateCcw,
  FileCode2,
  FolderOpen,
  CheckCircle2,
  Terminal,
} from 'lucide-react';
import {
  APP_BUILDER_PRESETS,
  AppPresetId,
  AppPresetInfo,
  AppTargetPlatform,
} from '../../services/appBuilderEngine';
import {
  ScaffoldedAppResult,
  deleteGeneratedAppApi,
  downloadAppZip,
  fetchGeneratedApps,
  scaffoldAppApi,
} from '../../services/api/appBuilder';
import { notify } from '../../shared/common/Toast';

type WorkspaceInnerTab = 'preview' | 'files' | 'guide';
type PreviewViewport = 'mobile' | 'desktop';

const ACCENT_SWATCHES = [
  { hex: '#f97316', label: 'Laranja JARVIS' },
  { hex: '#10b981', label: 'Esmeralda' },
  { hex: '#38bdf8', label: 'Azul Celeste' },
  { hex: '#a855f7', label: 'Violeta' },
  { hex: '#f43f5e', label: 'Coral' },
];

function formatKb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const kb = bytes / 1024;
  return kb >= 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(1)} KB`;
}

function platformLabel(platform: AppTargetPlatform): string {
  if (platform === 'android') return 'Android (.apk / .aab)';
  if (platform === 'windows') return 'Windows (.exe)';
  return 'Android (.apk) + Windows (.exe)';
}

export const AppBuilderView: React.FC = () => {
  const [presets, setPresets] = useState<AppPresetInfo[]>(APP_BUILDER_PRESETS);
  const [apps, setApps] = useState<ScaffoldedAppResult[]>([]);
  const [activeAppId, setActiveAppId] = useState<string | null>(null);

  const [targetPlatform, setTargetPlatform] = useState<AppTargetPlatform>('both');
  const [customName, setCustomName] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [accentColor, setAccentColor] = useState('#f97316');
  const [useAi, setUseAi] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [generatingPresetId, setGeneratingPresetId] = useState<AppPresetId | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [innerTab, setInnerTab] = useState<WorkspaceInnerTab>('preview');
  const [previewViewport, setPreviewViewport] = useState<PreviewViewport>('mobile');
  const [iframeKey, setIframeKey] = useState(0);
  const [selectedFilePath, setSelectedFilePath] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const studioSectionRef = useRef<HTMLElement | null>(null);

  const scrollToStudio = () => {
    requestAnimationFrame(() => {
      studioSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const activeApp = useMemo(
    () => apps.find((item) => item.blueprint.id === activeAppId) || apps[0] || null,
    [apps, activeAppId]
  );

  useEffect(() => {
    let cancelled = false;
    fetchGeneratedApps()
      .then((data) => {
        if (cancelled) return;
        if (data.presets?.length) setPresets(data.presets);
        const list = data.items || [];
        setApps(list);
        if (list.length > 0) {
          setActiveAppId((prev) => prev || list[0].blueprint.id);
        }
      })
      .catch(() => {
        // Mantém os modelos locais acessíveis mesmo se o catálogo remoto ainda estiver vazio
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeApp) return;
    if (activeApp.blueprint.platform === 'windows') {
      setPreviewViewport('desktop');
    } else if (activeApp.blueprint.platform === 'android') {
      setPreviewViewport('mobile');
    }
    if (!selectedFilePath || !activeApp.files.some((f) => f.path === selectedFilePath)) {
      setSelectedFilePath(activeApp.files[0]?.path || '');
    }
  }, [activeApp?.blueprint.id]);

  const activeFile = useMemo(() => {
    if (!activeApp) return null;
    return activeApp.files.find((f) => f.path === selectedFilePath) || activeApp.files[0] || null;
  }, [activeApp, selectedFilePath]);

  const handleCopyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      notify('Copiado para a área de transferência.', 'success');
      setTimeout(() => setCopiedKey((curr) => (curr === key ? null : curr)), 1800);
    } catch {
      notify('Não foi possível copiar automaticamente.', 'warning');
    }
  };

  const handleGeneratePreset = async (preset: AppPresetInfo) => {
    setErrorMsg(null);
    setGenerating(true);
    setGeneratingPresetId(preset.id);
    try {
      const result = await scaffoldAppApi({
        presetId: preset.id,
        platform: targetPlatform,
        accentColor: preset.accentColor,
        useAi: false,
      });
      setApps((prev) => [result, ...prev.filter((a) => a.blueprint.id !== result.blueprint.id)]);
      setActiveAppId(result.blueprint.id);
      setSelectedFilePath(result.files[0]?.path || '');
      setInnerTab('preview');
      setPreviewViewport(targetPlatform === 'windows' ? 'desktop' : 'mobile');
      setIframeKey((k) => k + 1);
      notify(`Aplicativo "${result.blueprint.name}" pronto para teste e download (.zip)!`, 'success');
      scrollToStudio();
    } catch (err: any) {
      const msg = err?.message || 'Erro ao gerar aplicativo.';
      setErrorMsg(msg);
      notify(msg, 'error');
    } finally {
      setGenerating(false);
      setGeneratingPresetId(null);
    }
  };

  const handleGenerateCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim() && !customPrompt.trim()) {
      setErrorMsg('Informe o nome ou descreva a ideia do aplicativo que deseja criar.');
      return;
    }
    setErrorMsg(null);
    setGenerating(true);
    setGeneratingPresetId(null);
    try {
      const result = await scaffoldAppApi({
        name: customName.trim() || undefined,
        prompt: customPrompt.trim() || customName.trim(),
        platform: targetPlatform,
        accentColor,
        useAi,
      });
      setApps((prev) => [result, ...prev.filter((a) => a.blueprint.id !== result.blueprint.id)]);
      setActiveAppId(result.blueprint.id);
      setSelectedFilePath(result.files[0]?.path || '');
      setInnerTab('preview');
      setPreviewViewport(targetPlatform === 'windows' ? 'desktop' : 'mobile');
      setIframeKey((k) => k + 1);
      notify(`Aplicativo "${result.blueprint.name}" montado com sucesso!`, 'success');
      scrollToStudio();
    } catch (err: any) {
      const msg = err?.message || 'Não foi possível criar o aplicativo.';
      setErrorMsg(msg);
      notify(msg, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadZip = async (appItem: ScaffoldedAppResult) => {
    setDownloadingId(appItem.blueprint.id);
    try {
      const filename = `${appItem.blueprint.slug}-${appItem.blueprint.platform}.zip`;
      await downloadAppZip(appItem.blueprint.id, filename);
      notify(`Download iniciado: ${filename}`, 'success');
    } catch (err: any) {
      notify(err?.message || 'Falha ao baixar o arquivo .zip.', 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDeleteApp = async (id: string) => {
    try {
      await deleteGeneratedAppApi(id);
      setApps((prev) => {
        const next = prev.filter((item) => item.blueprint.id !== id);
        if (activeAppId === id) {
          setActiveAppId(next[0]?.blueprint.id || null);
        }
        return next;
      });
      notify('Projeto removido da lista.', 'info');
    } catch (err: any) {
      notify(err?.message || 'Erro ao remover projeto.', 'error');
    }
  };

  const buildSteps = useMemo(() => {
    if (!activeApp) return [];
    const p = activeApp.blueprint.platform;
    const steps: Array<{
      id: string;
      badge: string;
      title: string;
      description: string;
      commands: string[];
    }> = [
      {
        id: 'step-install',
        badge: 'Passo 1 · Base',
        title: 'Descompacte o .zip e instale os pacotes',
        description:
          'Extraia o arquivo baixado em uma pasta no seu computador (ex.: C:\\Apps\\' +
          activeApp.blueprint.slug +
          '), abra o Terminal nessa pasta e rode o comando abaixo (requer Node.js 20+).',
        commands: ['npm install'],
      },
    ];

    if (p === 'android' || p === 'both') {
      steps.push({
        id: 'step-android-init',
        badge: 'Passo 2 · Android (.apk / .aab)',
        title: 'Crie o projeto nativo Android com Capacitor 6',
        description:
          'Este comando gera a pasta android/ configurada com o ID ' +
          activeApp.blueprint.packageId +
          ' e copia toda a interface offline para dentro do pacote mobile.',
        commands: ['npm run android:init', 'npm run android:sync'],
      });
      steps.push({
        id: 'step-android-apk',
        badge: 'Passo 3 · Compilar APK / AAB',
        title: 'Abra no Android Studio e exporte o instalador',
        description:
          'O comando abre o Android Studio pronto. No menu superior clique em Build > Build Bundle(s) / APK(s) > Build APK(s) para instalar no celular ou Generate Signed App Bundle (.aab) para a Play Store.',
        commands: ['npm run android:open'],
      });
    }

    if (p === 'windows' || p === 'both') {
      steps.push({
        id: 'step-win-dev',
        badge: p === 'both' ? 'Passo 4 · Testar no Windows' : 'Passo 2 · Testar no Windows',
        title: 'Execute a janela desktop nativa (Electron)',
        description:
          'Abra seu aplicativo como programa de desktop no Windows com janela nativa, armazenamento local e isolamento de segurança (contextIsolation).',
        commands: ['npm run win:dev'],
      });
      steps.push({
        id: 'step-win-exe',
        badge: p === 'both' ? 'Passo 5 · Instalador .exe' : 'Passo 3 · Instalador .exe',
        title: 'Gere o instalador Windows (.exe) com 1 comando',
        description:
          'O electron-builder cria o instalador NSIS completo na pasta dist-win/ pronto para enviar ou instalar em qualquer PC Windows 10/11.',
        commands: ['npm run win:exe'],
      });
    }

    return steps;
  }, [activeApp]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', paddingBottom: '36px' }}>
      {/* Cabeçalho Principal + Seletor de Plataforma */}
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
            'linear-gradient(135deg, rgba(249, 115, 22, 0.08) 0%, rgba(15, 19, 28, 0.96) 55%, rgba(15, 19, 28, 1) 100%)',
          borderColor: 'rgba(249, 115, 22, 0.24)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', flex: '1 1 420px', maxWidth: '640px' }}>
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
            <AppWindow size={22} />
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
              Construtor de Apps — Android &amp; Windows
            </h1>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: '0.88rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
              }}
            >
              Escolha um modelo pronto ou descreva seu aplicativo em português. Teste ao vivo na prévia
              interativa e baixe o projeto completo em <strong>.zip</strong> pronto para gerar{' '}
              <strong>.apk (Android)</strong> e <strong>.exe (Windows)</strong>.
            </p>
          </div>
        </div>

        {/* Seletor de Plataforma Alvo */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Plataforma de saída
          </span>
          <div
            role="group"
            aria-label="Selecionar plataforma do aplicativo"
            style={{
              display: 'inline-flex',
              padding: '4px',
              borderRadius: '10px',
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              gap: '4px',
            }}
          >
            {(
              [
                { id: 'both', label: 'Android + Windows', icon: Layers },
                { id: 'android', label: 'Android (.apk)', icon: Smartphone },
                { id: 'windows', label: 'Windows (.exe)', icon: Monitor },
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              const active = targetPlatform === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTargetPlatform(opt.id)}
                  aria-pressed={active}
                  className={active ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                  style={{ gap: '6px', whiteSpace: 'nowrap' }}
                >
                  <Icon size={14} />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Modelos Prontos (1 Clique) */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Comece em 1 clique com modelos prontos
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Aplicativos completos, funcionais offline e prontos para compilar em {platformLabel(targetPlatform)}.
            </p>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '14px',
          }}
        >
          {presets.map((preset) => {
            const isBusy = generating && generatingPresetId === preset.id;
            return (
              <div
                key={preset.id}
                className="jarvis-settings-subcard"
                style={{
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '14px',
                  borderColor: 'var(--border-color)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '999px',
                        backgroundColor: preset.accentColor,
                        flexShrink: 0,
                      }}
                    />
                    <h3
                      style={{
                        margin: 0,
                        fontSize: '0.92rem',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {preset.name}
                    </h3>
                  </div>

                  <p
                    style={{
                      margin: 0,
                      fontSize: '0.8rem',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.48,
                    }}
                  >
                    {preset.description}
                  </p>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '2px' }}>
                    {preset.highlights.map((tag) => (
                      <span
                        key={tag}
                        style={{
                          fontSize: '0.7rem',
                          color: 'var(--text-muted)',
                          backgroundColor: 'var(--bg-primary)',
                          border: '1px solid var(--border-subtle)',
                          padding: '2px 7px',
                          borderRadius: '6px',
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={generating}
                  onClick={() => void handleGeneratePreset(preset)}
                  className="btn btn-secondary btn-sm btn-block"
                  style={{ justifyContent: 'center' }}
                >
                  {isBusy ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
                  <span>{isBusy ? 'Montando projeto...' : 'Gerar aplicativo'}</span>
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Criador Personalizado */}
      <section className="jarvis-settings-card" style={{ padding: '20px 22px' }}>
        <form onSubmit={handleGenerateCustom} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Ou descreva seu próprio aplicativo
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Informe o nome e o que o app precisa controlar. Você pode testar tudo antes de baixar o código.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Cor tema:</span>
              {ACCENT_SWATCHES.map((swatch) => {
                const selected = accentColor === swatch.hex;
                return (
                  <button
                    key={swatch.hex}
                    type="button"
                    title={swatch.label}
                    aria-label={`Cor ${swatch.label}`}
                    aria-pressed={selected}
                    onClick={() => setAccentColor(swatch.hex)}
                    style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '999px',
                      backgroundColor: swatch.hex,
                      border: selected ? '2px solid #ffffff' : '2px solid transparent',
                      boxShadow: selected ? `0 0 0 2px ${swatch.hex}` : 'none',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  />
                );
              })}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label
                htmlFor="app-builder-name"
                style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}
              >
                Nome do aplicativo
              </label>
              <input
                id="app-builder-name"
                type="text"
                className="jarvis-input"
                placeholder="Ex.: Controle da Barbearia, Minhas Despesas..."
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label
                htmlFor="app-builder-prompt"
                style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}
              >
                O que o aplicativo deve fazer?
              </label>
              <input
                id="app-builder-prompt"
                type="text"
                className="jarvis-input"
                placeholder="Ex.: Registrar clientes, serviço, horário e valor cobrado com soma automática"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
              />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
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
                checked={useAi}
                onChange={(e) => setUseAi(e.target.checked)}
                style={{ accentColor: '#f97316' }}
              />
              <Sparkles size={14} color="var(--accent-light)" />
              <span>Estruturar campos sob medida com IA (Gemini)</span>
            </label>

            <button
              type="submit"
              disabled={generating}
              className="btn btn-primary"
              style={{ minWidth: '185px', justifyContent: 'center' }}
            >
              {generating && !generatingPresetId ? (
                <>
                  <Loader2 size={15} className="spin" />
                  <span>Gerando projeto...</span>
                </>
              ) : (
                <>
                  <AppWindow size={15} />
                  <span>Criar Aplicativo</span>
                </>
              )}
            </button>
          </div>

          {errorMsg && (
            <div
              role="alert"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#fca5a5',
                fontSize: '0.82rem',
              }}
            >
              <AlertCircle size={15} />
              <span>{errorMsg}</span>
            </div>
          )}
        </form>
      </section>

      {/* Estúdio do Projeto Ativo (Prévia Interativa + Arquivos + Guia) */}
      {activeApp && (
        <section
          ref={studioSectionRef}
          className="jarvis-settings-card"
          style={{
            padding: '0',
            overflow: 'hidden',
            borderColor: 'rgba(249, 115, 22, 0.28)',
          }}
        >
          {/* Barra Superior do Projeto */}
          <div
            style={{
              padding: '18px 22px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '14px',
              backgroundColor: 'var(--bg-elevated)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 420px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '999px',
                    backgroundColor: activeApp.blueprint.accentColor,
                  }}
                />
                <h2
                  style={{
                    margin: 0,
                    fontSize: '1.08rem',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                  }}
                >
                  {activeApp.blueprint.name}
                </h2>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--accent-light)',
                    backgroundColor: 'var(--accent-soft)',
                    border: '1px solid var(--border-accent)',
                    padding: '2px 8px',
                    borderRadius: '6px',
                  }}
                >
                  {activeApp.blueprint.packageId}
                </span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--text-secondary)',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    padding: '2px 8px',
                    borderRadius: '6px',
                  }}
                >
                  {platformLabel(activeApp.blueprint.platform)}
                </span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {activeApp.files.length} arquivos · {formatKb(activeApp.zip_size_bytes)}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {activeApp.blueprint.tagline}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <button
                type="button"
                disabled={downloadingId === activeApp.blueprint.id}
                onClick={() => void handleDownloadZip(activeApp)}
                className="btn btn-primary btn-sm"
              >
                {downloadingId === activeApp.blueprint.id ? (
                  <Loader2 size={14} className="spin" />
                ) : (
                  <Download size={14} />
                )}
                <span>Baixar Projeto Completo (.zip)</span>
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteApp(activeApp.blueprint.id)}
                className="btn btn-danger-ghost btn-icon-sm"
                title="Remover projeto da lista"
                aria-label="Remover projeto"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>

          {/* Navegação Interna (Prévia / Arquivos / Guia) */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '10px 22px',
              borderBottom: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-secondary)',
            }}
          >
            <div style={{ display: 'inline-flex', gap: '6px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setInnerTab('preview')}
                className={innerTab === 'preview' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              >
                <Play size={14} />
                <span>Prévia Interativa</span>
              </button>
              <button
                type="button"
                onClick={() => setInnerTab('files')}
                className={innerTab === 'files' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              >
                <Code2 size={14} />
                <span>Arquivos do Projeto ({activeApp.files.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setInnerTab('guide')}
                className={innerTab === 'guide' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              >
                <BookOpen size={14} />
                <span>Guia Passo a Passo (.apk / .exe)</span>
              </button>
            </div>

            {innerTab === 'preview' && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setPreviewViewport('mobile')}
                  className={previewViewport === 'mobile' ? 'btn btn-secondary btn-sm' : 'btn btn-ghost btn-sm'}
                  aria-pressed={previewViewport === 'mobile'}
                >
                  <Smartphone size={14} />
                  <span>Celular Android</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewViewport('desktop')}
                  className={previewViewport === 'desktop' ? 'btn btn-secondary btn-sm' : 'btn btn-ghost btn-sm'}
                  aria-pressed={previewViewport === 'desktop'}
                >
                  <Monitor size={14} />
                  <span>Janela Windows</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIframeKey((k) => k + 1)}
                  className="btn btn-ghost btn-icon-sm"
                  title="Recarregar prévia interativa"
                  aria-label="Recarregar prévia"
                >
                  <RotateCcw size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Conteúdo da Aba Ativa */}
          <div style={{ padding: '22px' }}>
            {innerTab === 'preview' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    fontSize: '0.78rem',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <CheckCircle2 size={14} color="var(--success-color)" />
                  <span>
                    Aplicativo real rodando em sandbox: adicione novos registros, filtre, conclua itens ou
                    exporte CSV diretamente na prévia abaixo.
                  </span>
                </div>

                {previewViewport === 'mobile' ? (
                  <div
                    style={{
                      width: '100%',
                      maxWidth: '412px',
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
                      <div
                        style={{
                          width: '64px',
                          height: '6px',
                          borderRadius: '999px',
                          backgroundColor: 'rgba(255, 255, 255, 0.16)',
                        }}
                      />
                      <span>Android · 5G</span>
                    </div>
                    <iframe
                      key={`mobile-${activeApp.blueprint.id}-${iframeKey}`}
                      title={`Prévia Android de ${activeApp.blueprint.name}`}
                      srcDoc={activeApp.preview_html}
                      sandbox="allow-scripts allow-downloads"
                      style={{
                        width: '100%',
                        height: '650px',
                        border: 'none',
                        borderRadius: '22px',
                        backgroundColor: '#0b0e14',
                        display: 'block',
                      }}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      width: '100%',
                      borderRadius: '14px',
                      overflow: 'hidden',
                      border: '1px solid rgba(255, 255, 255, 0.14)',
                      backgroundColor: '#111622',
                      boxShadow: '0 22px 54px rgba(0, 0, 0, 0.5)',
                    }}
                  >
                    <div
                      style={{
                        height: '36px',
                        padding: '0 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: '#161c2a',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                        fontSize: '0.76rem',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Monitor size={13} color={activeApp.blueprint.accentColor} />
                        <span style={{ fontWeight: 600 }}>{activeApp.blueprint.name} — Windows Desktop</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-muted)' }}>
                        <span>—</span>
                        <span>□</span>
                        <span>×</span>
                      </div>
                    </div>
                    <iframe
                      key={`desktop-${activeApp.blueprint.id}-${iframeKey}`}
                      title={`Prévia Windows de ${activeApp.blueprint.name}`}
                      srcDoc={activeApp.preview_html}
                      sandbox="allow-scripts allow-downloads"
                      style={{
                        width: '100%',
                        height: '620px',
                        border: 'none',
                        backgroundColor: '#0b0e14',
                        display: 'block',
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {innerTab === 'files' && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(220px, 260px) minmax(0, 1fr)',
                  gap: '16px',
                  alignItems: 'start',
                }}
              >
                <div
                  className="jarvis-settings-subcard"
                  style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}
                >
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
                    <span>{activeApp.blueprint.slug}/</span>
                  </div>
                  {activeApp.files.map((file) => {
                    const selected = activeFile?.path === file.path;
                    return (
                      <button
                        key={file.path}
                        type="button"
                        onClick={() => setSelectedFilePath(file.path)}
                        className={selected ? 'btn btn-primary btn-sm btn-start' : 'btn btn-ghost btn-sm btn-start'}
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.75rem',
                          justifyContent: 'flex-start',
                          width: '100%',
                        }}
                      >
                        <FileCode2 size={13} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {file.path}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {activeFile && (
                  <div
                    className="jarvis-settings-subcard"
                    style={{ padding: '0', overflow: 'hidden', minWidth: 0 }}
                  >
                    <div
                      style={{
                        padding: '10px 14px',
                        borderBottom: '1px solid var(--border-color)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                        backgroundColor: 'var(--bg-elevated)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                          }}
                        >
                          {activeFile.path}
                        </span>
                        <span
                          style={{
                            fontSize: '0.68rem',
                            textTransform: 'uppercase',
                            color: 'var(--text-muted)',
                            backgroundColor: 'var(--bg-primary)',
                            border: '1px solid var(--border-subtle)',
                            padding: '1px 6px',
                            borderRadius: '5px',
                          }}
                        >
                          {activeFile.language}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleCopyText(activeFile.content, `file-${activeFile.path}`)}
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
                        maxHeight: '520px',
                        overflow: 'auto',
                        fontSize: '0.78rem',
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
              </div>
            )}

            {innerTab === 'guide' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                    gap: '14px',
                  }}
                >
                  {buildSteps.map((step) => (
                    <div
                      key={step.id}
                      className="jarvis-settings-subcard"
                      style={{
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            color: 'var(--accent-light)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                          }}
                        >
                          {step.badge}
                        </span>
                        <h3 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {step.title}
                        </h3>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                          {step.description}
                        </p>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {step.commands.map((cmd) => {
                          const cmdKey = `${step.id}-${cmd}`;
                          return (
                            <div
                              key={cmdKey}
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
                                <Terminal size={13} color="var(--accent-light)" />
                                <code
                                  style={{
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: '0.78rem',
                                    color: '#f8fafc',
                                  }}
                                >
                                  {cmd}
                                </code>
                              </div>
                              <button
                                type="button"
                                onClick={() => void handleCopyText(cmd, cmdKey)}
                                className="btn btn-ghost btn-icon-sm"
                                title="Copiar comando"
                                aria-label={`Copiar ${cmd}`}
                              >
                                {copiedKey === cmdKey ? (
                                  <Check size={13} color="var(--success-color)" />
                                ) : (
                                  <Copy size={13} />
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Lista de Projetos Gerados Recentes */}
      {apps.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Projetos gerados recentes ({apps.length})
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '12px',
            }}
          >
            {apps.map((item) => {
              const isSelected = activeApp?.blueprint.id === item.blueprint.id;
              return (
                <div
                  key={item.blueprint.id}
                  onClick={() => {
                    setActiveAppId(item.blueprint.id);
                    setSelectedFilePath(item.files[0]?.path || '');
                  }}
                  className="jarvis-settings-subcard"
                  style={{
                    padding: '14px',
                    cursor: 'pointer',
                    borderColor: isSelected ? 'var(--accent-color)' : 'var(--border-color)',
                    backgroundColor: isSelected ? 'rgba(249, 115, 22, 0.06)' : undefined,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <span
                        style={{
                          width: '9px',
                          height: '9px',
                          borderRadius: '999px',
                          backgroundColor: item.blueprint.accentColor,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: '0.86rem',
                          color: 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.blueprint.name}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-muted)',
                        flexShrink: 0,
                      }}
                    >
                      {formatKb(item.zip_size_bytes)}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {platformLabel(item.blueprint.platform)} · {item.files.length} arquivos
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDownloadZip(item);
                      }}
                      className="btn btn-secondary btn-sm"
                      style={{ flex: 1, justifyContent: 'center' }}
                    >
                      <Download size={13} />
                      <span>Baixar .zip</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDeleteApp(item.blueprint.id);
                      }}
                      className="btn btn-danger-ghost btn-icon-sm"
                      title="Remover"
                      aria-label={`Remover ${item.blueprint.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
