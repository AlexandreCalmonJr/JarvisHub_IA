import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowRightLeft,
  BookOpen,
  Check,
  CheckCircle2,
  Cloud,
  Code2,
  Copy,
  Cpu,
  Database,
  Download,
  FileCode2,
  FolderOpen,
  HardDrive,
  Layers,
  Loader2,
  Plug,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Trash2,
  Upload,
  Wifi,
} from 'lucide-react';
import { useAssistantIdentity } from '../../context/AssistantIdentityContext';
import { notify } from '../../shared/common/Toast';
import {
  buildDualModeServerArtifacts,
  DEFAULT_DEPLOYMENT_OPTIONS,
  SERVER_LANGUAGE_COMPARISON,
  UNIFIED_API_ROUTE_MAP,
  UNIFIED_SCHEMA_TABLES,
  type BrainConnectionProfile,
  type BrainDeploymentOptions,
  type BrainMode,
  type GeneratedServerArtifact,
} from '../../services/brainArchitectureEngine';
import {
  activateBrainProfileApi,
  addBrainProfileApi,
  createSqliteBackupApi,
  downloadDualModeBundleZipApi,
  exportBrainPackApi,
  fetchBrainInfoApi,
  fetchBrainProfilesApi,
  fetchBrainSchemaApi,
  importBrainPackApi,
  pingBrainProfileApi,
  previewDualModeBundleApi,
  removeBrainProfileApi,
  type BrainInfoResponse,
  type BrainSchemaResponse,
} from '../../services/api/brainServer';

import { BrainMemoryPanel } from './BrainMemoryPanel';
import { BrainPythonLanesPanel } from './BrainPythonLanesPanel';
import { BrainMcpPanel } from './BrainMcpPanel';

type BrainHubTab =
  | 'multi_brain'
  | 'memory_hybrid'
  | 'python_lanes'
  | 'mcp_gateway'
  | 'dual_mode'
  | 'files'
  | 'api_map';

const MODE_BADGE_MAP: Record<BrainMode, { label: string; color: string; bg: string }> = {
  local_sqlite: {
    label: 'Local · SQLite (Sem Docker)',
    color: '#6ee7b7',
    bg: 'rgba(16, 185, 129, 0.14)',
  },
  docker_postgres: {
    label: 'Docker · PostgreSQL + pgvector',
    color: '#93c5fd',
    bg: 'rgba(59, 130, 246, 0.16)',
  },
  cloud: {
    label: 'Remoto · HTTPS Seguro',
    color: '#fdba74',
    bg: 'rgba(249, 115, 22, 0.16)',
  },
};

const METHOD_COLORS: Record<string, { color: string; bg: string }> = {
  GET: { color: '#6ee7b7', bg: 'rgba(16, 185, 129, 0.14)' },
  POST: { color: '#fdba74', bg: 'rgba(249, 115, 22, 0.16)' },
  PUT: { color: '#93c5fd', bg: 'rgba(59, 130, 246, 0.16)' },
  DELETE: { color: '#fca5a5', bg: 'rgba(239, 68, 68, 0.16)' },
};

export const BrainServerHubView: React.FC = () => {
  const { assistantName } = useAssistantIdentity();
  const [activeTab, setActiveTab] = useState<BrainHubTab>('multi_brain');

  // Estado Multi-Cérebros
  const [brainInfo, setBrainInfo] = useState<BrainInfoResponse | null>(null);
  const [profiles, setProfiles] = useState<BrainConnectionProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>('brain_local_primary');
  const [loadingBrains, setLoadingBrains] = useState<boolean>(true);
  const [busyProfileId, setBusyProfileId] = useState<string | null>(null);

  // Formulário Novo Cérebro
  const [newName, setNewName] = useState<string>('');
  const [newUrl, setNewUrl] = useState<string>('');
  const [newMode, setNewMode] = useState<BrainMode>('docker_postgres');
  const [newDescription, setNewDescription] = useState<string>('');
  const [addingBrain, setAddingBrain] = useState<boolean>(false);

  // Migração .jarvis-pack & Backup SQLite
  const [exportingPack, setExportingPack] = useState<boolean>(false);
  const [importingPack, setImportingPack] = useState<boolean>(false);
  const [creatingBackup, setCreatingBackup] = useState<boolean>(false);
  const [schemaInfo, setSchemaInfo] = useState<BrainSchemaResponse | null>(null);
  const packInputRef = useRef<HTMLInputElement | null>(null);

  // Configurador Dual-Mode & Arquivos do Servidor
  const [deployOpts, setDeployOpts] = useState<BrainDeploymentOptions>({
    ...DEFAULT_DEPLOYMENT_OPTIONS,
    assistantName: assistantName || 'JARVIS',
  });
  const [serverFiles, setServerFiles] = useState<GeneratedServerArtifact[]>(() =>
    buildDualModeServerArtifacts(DEFAULT_DEPLOYMENT_OPTIONS)
  );
  const [selectedFilePath, setSelectedFilePath] = useState<string>('docker-compose.yml');
  const [zipSizeBytes, setZipSizeBytes] = useState<number>(0);
  const [downloadingZip, setDownloadingZip] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Filtro da Aba Mapa da API
  const [apiSearch, setApiSearch] = useState<string>('');

  const loadAllBrainState = async () => {
    setLoadingBrains(true);
    try {
      const [info, profs, schema] = await Promise.all([
        fetchBrainInfoApi(),
        fetchBrainProfilesApi(),
        fetchBrainSchemaApi().catch(() => null),
      ]);
      setBrainInfo(info);
      setProfiles(profs.profiles);
      setActiveProfileId(profs.activeProfileId);
      if (schema) setSchemaInfo(schema);
    } catch (err: any) {
      notify(err?.message || 'Não foi possível carregar os Cérebros conectados.', 'error');
    } finally {
      setLoadingBrains(false);
    }
  };

  useEffect(() => {
    void loadAllBrainState();
  }, []);

  useEffect(() => {
    const generated = buildDualModeServerArtifacts(deployOpts);
    setServerFiles(generated);
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const preview = await previewDualModeBundleApi(deployOpts);
        if (!cancelled) {
          setServerFiles(preview.files);
          setZipSizeBytes(preview.zip_size_bytes);
        }
      } catch {
        // Fallback local já está populado
      }
    }, 240);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [deployOpts]);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) || profiles[0] || null,
    [profiles, activeProfileId]
  );

  const activeFile = useMemo(
    () => serverFiles.find((f) => f.path === selectedFilePath) || serverFiles[0] || null,
    [serverFiles, selectedFilePath]
  );

  const filteredApiRoutes = useMemo(() => {
    const q = apiSearch.trim().toLowerCase();
    if (!q) return UNIFIED_API_ROUTE_MAP;
    return UNIFIED_API_ROUTE_MAP.filter(
      (r) =>
        r.path.toLowerCase().includes(q) ||
        r.summary.toLowerCase().includes(q) ||
        r.group.toLowerCase().includes(q) ||
        r.method.toLowerCase().includes(q)
    );
  }, [apiSearch]);

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      notify('Copiado para a área de transferência.', 'success');
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1800);
    } catch {
      notify('Não foi possível copiar automaticamente.', 'error');
    }
  };

  const handleActivateProfile = async (profile: BrainConnectionProfile) => {
    setBusyProfileId(profile.id);
    try {
      const res = await activateBrainProfileApi(profile.id);
      setProfiles(res.profiles);
      setActiveProfileId(res.activeProfileId);
      window.dispatchEvent(
        new CustomEvent('jarvis:brain-switched', {
          detail: { id: res.active.id, name: res.active.name, mode: res.active.mode },
        })
      );
      const info = await fetchBrainInfoApi();
      setBrainInfo(info);
      notify(`Conectado ao Cérebro "${res.active.name}" com sucesso!`, 'success');
    } catch (err: any) {
      notify(err?.message || 'Falha ao alternar o Cérebro.', 'error');
    } finally {
      setBusyProfileId(null);
    }
  };

  const handlePingProfile = async (profile: BrainConnectionProfile) => {
    setBusyProfileId(profile.id);
    try {
      const res = await pingBrainProfileApi(profile.id);
      setProfiles(res.profiles);
      notify(res.detail, res.profile.status === 'online' ? 'success' : 'info');
    } catch (err: any) {
      notify(err?.message || 'Não foi possível testar a conexão.', 'error');
    } finally {
      setBusyProfileId(null);
    }
  };

  const handleRemoveProfile = async (profile: BrainConnectionProfile) => {
    setBusyProfileId(profile.id);
    try {
      const res = await removeBrainProfileApi(profile.id);
      setProfiles(res.profiles);
      setActiveProfileId(res.activeProfileId);
      notify(`Cérebro "${profile.name}" removido da lista.`, 'info');
    } catch (err: any) {
      notify(err?.message || 'Não foi possível remover este Cérebro.', 'error');
    } finally {
      setBusyProfileId(null);
    }
  };

  const handleAddProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newUrl.trim()) {
      notify('Informe o nome amigável e o endereço do servidor do Cérebro.', 'error');
      return;
    }
    setAddingBrain(true);
    try {
      const res = await addBrainProfileApi({
        name: newName.trim(),
        baseUrl: newUrl.trim(),
        mode: newMode,
        description: newDescription.trim() || undefined,
      });
      setProfiles(res.profiles);
      setActiveProfileId(res.activeProfileId);
      setNewName('');
      setNewUrl('');
      setNewDescription('');
      notify(`Cérebro "${res.created.name}" adicionado ao seu gerenciador!`, 'success');
    } catch (err: any) {
      notify(err?.message || 'Não foi possível cadastrar este Cérebro.', 'error');
    } finally {
      setAddingBrain(false);
    }
  };

  const handleExportPack = async () => {
    setExportingPack(true);
    try {
      const pack = await exportBrainPackApi();
      const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jarvis-brain-pack-${new Date().toISOString().slice(0, 10)}.jarvis-pack.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      notify(
        `Pacote exportado (${pack.agents.length} agentes, ${pack.skills.length} habilidades, ${pack.workflows.length} fluxos e ${pack.knowledge.length} documentos).`,
        'success'
      );
    } catch (err: any) {
      notify(err?.message || 'Falha ao exportar pacote do Cérebro.', 'error');
    } finally {
      setExportingPack(false);
    }
  };

  const handleImportPackFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingPack(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await importBrainPackApi(parsed);
      notify(res.message, 'success');
      await loadAllBrainState();
    } catch (err: any) {
      notify(err?.message || 'Arquivo .jarvis-pack inválido ou corrompido.', 'error');
    } finally {
      setImportingPack(false);
      if (packInputRef.current) {
        packInputRef.current.value = '';
      }
    }
  };

  const handleCreateSqliteBackup = async () => {
    setCreatingBackup(true);
    try {
      const res = await createSqliteBackupApi();
      notify(res.message, 'success');
      await loadAllBrainState();
    } catch (err: any) {
      notify(err?.message || 'Não foi possível criar o backup SQLite.', 'error');
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleDownloadBundleZip = async () => {
    setDownloadingZip(true);
    try {
      await downloadDualModeBundleZipApi(deployOpts);
      notify('Pacote completo do Servidor Dual-Mode (.zip) baixado com sucesso!', 'success');
    } catch (err: any) {
      notify(err?.message || 'Falha ao baixar pacote do servidor.', 'error');
    } finally {
      setDownloadingZip(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1320px', margin: '0 auto' }}>
      {/* Hero Header Horizontal */}
      <section
        className="jarvis-settings-card"
        style={{
          padding: '24px 26px',
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '18px',
          background:
            'radial-gradient(circle at top left, rgba(249, 115, 22, 0.14), rgba(15, 19, 28, 0.94) 60%)',
          borderColor: 'rgba(249, 115, 22, 0.28)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', flex: '1 1 460px', minWidth: 0 }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #f97316 0%, #c2410c 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 10px 26px rgba(249, 115, 22, 0.35)',
            }}
          >
            <Server size={24} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: '1.32rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Cérebro Poliglota &amp; Servidor (Node 22 + Python 3.11 + Go + SQLite Híbrido)
            </h1>
            <p style={{ margin: '6px 0 0', fontSize: '0.86rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              Rode <strong>local-first em SQLite WAL + FTS5 + vetores</strong> com memória editável em Markdown (<code>SOUL.md</code> / <code>MEMORY.md</code>),{' '}
              <strong>Worker Python 3.11 ao vivo</strong>, filas seriais por sessão, <strong>Gateway MCP nativo</strong> e{' '}
              <strong>Serviço Go (Gateway + Crawler)</strong> no pacote Docker/VPS.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', flexShrink: 0 }}>
          <button
            type="button"
            disabled={downloadingZip}
            onClick={() => void handleDownloadBundleZip()}
            className="btn btn-primary"
          >
            {downloadingZip ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
            <span>{downloadingZip ? 'Empacotando...' : 'Baixar Stack Poliglota (.zip)'}</span>
          </button>
          <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {serverFiles.length} arquivos reais · {zipSizeBytes > 0 ? `${(zipSizeBytes / 1024).toFixed(1)} KB` : 'Node + Python + Go'} · API /api/v1
          </span>
        </div>
      </section>

      {/* Tabs */}
      <div role="tablist" aria-label="Seções de Cérebros e Servidor" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {[
          { id: 'multi_brain' as const, label: `Meus Cérebros (${profiles.length})`, icon: ArrowRightLeft },
          { id: 'memory_hybrid' as const, label: 'Memória & Markdown', icon: BookOpen },
          { id: 'python_lanes' as const, label: 'Worker Python & Filas', icon: Cpu },
          { id: 'mcp_gateway' as const, label: 'Gateway MCP', icon: Plug },
          { id: 'dual_mode' as const, label: 'Local vs. Docker Poliglota', icon: Layers },
          { id: 'files' as const, label: `Arquivos do Servidor (${serverFiles.length})`, icon: Code2 },
          { id: 'api_map' as const, label: 'Mapa da API (/api/v1) & Banco', icon: Database },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={isActive ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* NOVAS ABAS POLIGLOTAS: MEMÓRIA MARKDOWN/HÍBRIDA, WORKER PYTHON/FILAS & GATEWAY MCP */}
      {activeTab === 'memory_hybrid' && (
        <BrainMemoryPanel onMutated={() => void loadAllBrainState()} />
      )}

      {activeTab === 'python_lanes' && (
        <BrainPythonLanesPanel onWorkspaceChanged={() => void loadAllBrainState()} />
      )}

      {activeTab === 'mcp_gateway' && (
        <BrainMcpPanel onMutated={() => void loadAllBrainState()} />
      )}

      {/* ABA 1: GERENCIADOR MULTI-CÉREBROS + MIGRAÇÃO .jarvis-pack */}
      {activeTab === 'multi_brain' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Resumo do Cérebro Ativo */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '12px',
            }}
          >
            <div className="jarvis-settings-card" style={{ padding: '16px', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.73rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                <Activity size={14} color="#6ee7b7" />
                <span>Cérebro Conectado Agora</span>
              </div>
              <div style={{ fontSize: '0.96rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {activeProfile?.name || brainInfo?.name || 'Esta Máquina · Local'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                {activeProfile?.baseUrl || 'http://localhost:3000'}
              </div>
            </div>

            <div className="jarvis-settings-card" style={{ padding: '16px', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.73rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                <Database size={14} color="var(--accent-light)" />
                <span>Motor de Banco &amp; Vetores</span>
              </div>
              <div style={{ fontSize: '0.96rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {brainInfo?.database_engine || activeProfile?.databaseEngine || 'SQLite WAL (node:sqlite)'}
              </div>
              <div
                style={{
                  fontSize: '0.73rem',
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={brainInfo?.storage_path || '~/JARVIS-Brain/brain.db'}
              >
                {brainInfo?.journal_mode ? `${brainInfo.journal_mode.toUpperCase()} ativo` : 'WAL ativo'}
                {brainInfo?.db_size_bytes ? ` · ${(brainInfo.db_size_bytes / 1024).toFixed(1)} KB em disco` : ''}
                {typeof brainInfo?.backups_count === 'number' ? ` · ${brainInfo.backups_count} backup(s)` : ''}
              </div>
            </div>

            <div className="jarvis-settings-card" style={{ padding: '16px', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.73rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                <Cpu size={14} color="#93c5fd" />
                <span>Memória Sincronizada</span>
              </div>
              <div style={{ fontSize: '0.96rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {brainInfo ? `${brainInfo.counts.agents} agentes · ${brainInfo.counts.skills} skills` : 'Carregando...'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {brainInfo
                  ? `${brainInfo.counts.workflows} fluxos · ${brainInfo.counts.knowledge} docs · ${brainInfo.counts.paired_devices} celular(es)`
                  : 'Sincronizado em tempo real'}
              </div>
            </div>

            <div className="jarvis-settings-card" style={{ padding: '16px', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.73rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                <Radio size={14} color="#c084fc" />
                <span>Descoberta Local (mDNS)</span>
              </div>
              <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                {brainInfo?.mdns_service || '_jarvis-brain._tcp.local'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                App Android encontra seu PC ou Docker no Wi-Fi automaticamente
              </div>
            </div>
          </div>

          {/* Grid Principal: Lista de Cérebros (Esq) + Adicionar & Migrar (Dir) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
              gap: '18px',
              alignItems: 'start',
            }}
          >
            {/* Lista de Cérebros Registrados */}
            <section className="jarvis-settings-card" style={{ padding: '22px', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Cérebros Cadastrados (Troca em 1 Clique)
                  </h2>
                  <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Alterne entre seu banco local sem Docker, um servidor Docker em casa ou uma instância remota HTTPS.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadAllBrainState()}
                  className="btn btn-secondary btn-sm"
                  disabled={loadingBrains}
                >
                  <RefreshCw size={13} className={loadingBrains ? 'spin' : ''} />
                  <span>Atualizar</span>
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {profiles.map((profile) => {
                  const isCurrent = profile.id === activeProfileId;
                  const modeMeta = MODE_BADGE_MAP[profile.mode];
                  const isBusy = busyProfileId === profile.id;

                  return (
                    <div
                      key={profile.id}
                      className="jarvis-settings-subcard"
                      style={{
                        padding: '14px',
                        gap: '10px',
                        borderColor: isCurrent ? 'rgba(249, 115, 22, 0.55)' : 'var(--border-color)',
                        backgroundColor: isCurrent ? 'rgba(249, 115, 22, 0.06)' : 'var(--bg-primary)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                            <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{profile.name}</strong>
                            {isCurrent && (
                              <span
                                style={{
                                  fontSize: '0.66rem',
                                  fontWeight: 700,
                                  padding: '2px 7px',
                                  borderRadius: '6px',
                                  backgroundColor: 'rgba(16, 185, 129, 0.16)',
                                  color: '#6ee7b7',
                                }}
                              >
                                Ativo agora
                              </span>
                            )}
                            <span
                              style={{
                                fontSize: '0.66rem',
                                fontWeight: 600,
                                padding: '2px 7px',
                                borderRadius: '6px',
                                backgroundColor: modeMeta.bg,
                                color: modeMeta.color,
                              }}
                            >
                              {modeMeta.label}
                            </span>
                          </div>
                          <div
                            style={{
                              marginTop: '4px',
                              fontSize: '0.75rem',
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--text-muted)',
                            }}
                          >
                            {profile.baseUrl}
                            {profile.latencyMs !== null ? ` · ${profile.latencyMs} ms` : ''}
                          </div>
                          <p style={{ margin: '6px 0 0', fontSize: '0.77rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                            {profile.description}
                          </p>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px', paddingTop: '4px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontSize: '0.72rem',
                            color: profile.status === 'online' ? '#6ee7b7' : 'var(--text-muted)',
                          }}
                        >
                          <Wifi size={13} />
                          <span>
                            {profile.status === 'online'
                              ? 'Respondendo na rede'
                              : 'Aguardando servidor iniciar'}
                          </span>
                        </span>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {!isCurrent && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleActivateProfile(profile)}
                              className="btn btn-primary btn-sm"
                            >
                              <CheckCircle2 size={13} />
                              <span>Conectar</span>
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handlePingProfile(profile)}
                            className="btn btn-secondary btn-sm"
                          >
                            {isBusy ? <Loader2 size={13} className="spin" /> : <Activity size={13} />}
                            <span>Testar</span>
                          </button>
                          {!profile.isLocalCurrent && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleRemoveProfile(profile)}
                              className="btn btn-danger-ghost btn-sm"
                              aria-label={`Remover ${profile.name}`}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Coluna Direita: Conectar Novo Cérebro + Portabilidade .jarvis-pack */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <form onSubmit={handleAddProfile} className="jarvis-settings-card" style={{ padding: '22px', gap: '12px' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Conectar Novo Cérebro (PC, Docker ou VPS)
                  </h2>
                  <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Subiu o JARVIS em um Docker na sua máquina, Mini PC ou servidor? Adicione abaixo para alternar quando quiser.
                  </p>
                </div>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                  <span>Nome amigável</span>
                  <input
                    type="text"
                    className="jarvis-input"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Ex.: Meu Docker no Escritório"
                    aria-label="Nome amigável do novo Cérebro"
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                  <span>Endereço do servidor (LAN/mDNS ou HTTPS)</span>
                  <input
                    type="text"
                    className="jarvis-input"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="Ex.: http://192.168.1.90:3000 ou https://jarvis.meudominio.com"
                    aria-label="Endereço URL do novo Cérebro"
                  />
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                    <span>Tipo de Cérebro</span>
                    <select
                      className="jarvis-input"
                      value={newMode}
                      onChange={(e) => setNewMode(e.target.value as BrainMode)}
                      aria-label="Tipo de Cérebro"
                    >
                      <option value="docker_postgres">Docker (PostgreSQL + Redis)</option>
                      <option value="local_sqlite">Local Sem Docker (SQLite)</option>
                      <option value="cloud">Servidor Remoto (HTTPS)</option>
                    </select>
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                    <span>Nota opcional</span>
                    <input
                      type="text"
                      className="jarvis-input"
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      placeholder="Ex.: Com GPU RTX para Ollama"
                      aria-label="Descrição do novo Cérebro"
                    />
                  </label>
                </div>

                <button type="submit" disabled={addingBrain} className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }}>
                  {addingBrain ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                  <span>Adicionar Cérebro</span>
                </button>
              </form>

              {/* Portabilidade e Migração .jarvis-pack */}
              <section className="jarvis-settings-card" style={{ padding: '22px', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <ShieldCheck size={18} color="#6ee7b7" />
                  <div>
                    <h2 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Migração &amp; Backup Portátil (.jarvis-pack)
                    </h2>
                    <p style={{ margin: '2px 0 0', fontSize: '0.79rem', color: 'var(--text-secondary)' }}>
                      Evoluiu do modo Local (SQLite) para Docker (PostgreSQL)? Leve todos os seus agentes, habilidades, fluxos e documentos sem perder nada — chaves de API nunca são exportadas.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', paddingTop: '4px' }}>
                  <button
                    type="button"
                    disabled={creatingBackup}
                    onClick={() => void handleCreateSqliteBackup()}
                    className="btn btn-primary btn-sm"
                  >
                    {creatingBackup ? <Loader2 size={14} className="spin" /> : <HardDrive size={14} />}
                    <span>{creatingBackup ? 'Salvando...' : 'Criar Backup SQLite (.db)'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={exportingPack}
                    onClick={() => void handleExportPack()}
                    className="btn btn-secondary btn-sm"
                  >
                    {exportingPack ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
                    <span>Exportar .jarvis-pack.json</span>
                  </button>

                  <button
                    type="button"
                    disabled={importingPack}
                    onClick={() => packInputRef.current?.click()}
                    className="btn btn-secondary btn-sm"
                  >
                    {importingPack ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
                    <span>Importar .jarvis-pack.json</span>
                  </button>
                  <input
                    ref={packInputRef}
                    type="file"
                    accept=".json,.jarvis-pack.json"
                    onChange={(e) => void handleImportPackFile(e)}
                    style={{ display: 'none' }}
                  />
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* ABA 2: MODO LOCAL SEM DOCKER VS. DOCKER + ESCOLHA DA LINGUAGEM */}
      {activeTab === 'dual_mode' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Comparativo 2 Colunas: Sem Docker vs Com Docker */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '16px' }}>
            <section
              className="jarvis-settings-card"
              style={{
                padding: '22px',
                gap: '12px',
                borderColor: deployOpts.mode === 'local_sqlite' ? 'rgba(16, 185, 129, 0.5)' : 'var(--border-color)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <HardDrive size={20} color="#6ee7b7" />
                  <h2 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Modo Local Direto (Sem Docker)
                  </h2>
                </div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6ee7b7' }}>USUÁRIO COMUM</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                Instala direto no seu computador sem precisar saber o que é Docker. Salva tudo em uma única pasta fácil de fazer backup.
              </p>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                <li><strong>Banco embarcado:</strong> SQLite em modo WAL + busca vetorial <code>sqlite-vec</code>.</li>
                <li><strong>Pasta única:</strong> <code>~/JARVIS-Brain/brain.db</code> + planilhas e mídias geradas.</li>
                <li><strong>IA automática:</strong> Gemini na nuvem + detecção automática de Ollama local se instalado.</li>
                <li><strong>1 comando:</strong> <code>./scripts/start-local-brain.sh</code></li>
              </ul>
              <button
                type="button"
                onClick={() => setDeployOpts((prev) => ({ ...prev, mode: 'local_sqlite' }))}
                className={deployOpts.mode === 'local_sqlite' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                style={{ alignSelf: 'flex-start', marginTop: '4px' }}
              >
                {deployOpts.mode === 'local_sqlite' ? <Check size={14} /> : null}
                <span>Selecionar Padrão Local (SQLite)</span>
              </button>
            </section>

            <section
              className="jarvis-settings-card"
              style={{
                padding: '22px',
                gap: '12px',
                borderColor: deployOpts.mode === 'docker_postgres' ? 'rgba(249, 115, 22, 0.55)' : 'var(--border-color)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Cloud size={20} color="var(--accent-light)" />
                  <h2 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Modo Docker Completo (Compose)
                  </h2>
                </div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-light)' }}>USUÁRIO AVANÇADO</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                Sobe todo o ecossistema isolado com <code>docker compose up -d</code> no seu PC, Mini PC, NAS ou VPS.
              </p>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                <li><strong>Banco escalável:</strong> PostgreSQL 16 + <code>pgvector</code> para milhões de trechos RAG.</li>
                <li><strong>Filas &amp; Agendador:</strong> Redis 7 para vídeos, GitHub import e Fluxos Cron.</li>
                <li><strong>Perfis opcionais:</strong> <code>--profile local-ai</code> (Ollama) e <code>--profile remote</code> (Caddy HTTPS).</li>
                <li><strong>Zero configuração manual:</strong> QR Code pronto para parear o App Android.</li>
              </ul>
              <button
                type="button"
                onClick={() => setDeployOpts((prev) => ({ ...prev, mode: 'docker_postgres' }))}
                className={deployOpts.mode === 'docker_postgres' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                style={{ alignSelf: 'flex-start', marginTop: '4px' }}
              >
                {deployOpts.mode === 'docker_postgres' ? <Check size={14} /> : null}
                <span>Selecionar Padrão Docker (PostgreSQL)</span>
              </button>
            </section>
          </div>

          {/* Personalizador do Pacote Dual-Mode */}
          <section className="jarvis-settings-card" style={{ padding: '22px', gap: '14px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Personalizar Pacote do Servidor (.zip)
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  As alterações abaixo atualizam instantaneamente o <code>docker-compose.yml</code>, <code>.env.example</code> e o script local na aba Arquivos.
                </p>
              </div>
              <button
                type="button"
                disabled={downloadingZip}
                onClick={() => void handleDownloadBundleZip()}
                className="btn btn-primary btn-sm"
              >
                <Download size={14} />
                <span>Baixar Pacote Personalizado (.zip)</span>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                <span>Nome deste Cérebro</span>
                <input
                  type="text"
                  className="jarvis-input"
                  value={deployOpts.brainName}
                  onChange={(e) => setDeployOpts((prev) => ({ ...prev, brainName: e.target.value }))}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                <span>Porta HTTP da API</span>
                <input
                  type="number"
                  className="jarvis-input"
                  value={deployOpts.port}
                  onChange={(e) => setDeployOpts((prev) => ({ ...prev, port: Number(e.target.value) || 3000 }))}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                <span>Nome do Banco PostgreSQL</span>
                <input
                  type="text"
                  className="jarvis-input"
                  value={deployOpts.postgresDb}
                  onChange={(e) => setDeployOpts((prev) => ({ ...prev, postgresDb: e.target.value }))}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                <span>Pasta do SQLite Local</span>
                <input
                  type="text"
                  className="jarvis-input"
                  value={deployOpts.dataDir}
                  onChange={(e) => setDeployOpts((prev) => ({ ...prev, dataDir: e.target.value }))}
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
              {[
                {
                  key: 'enableOllama' as const,
                  title: 'Perfil Ollama Local (--profile local-ai)',
                  desc: 'Inclui container Ollama para rodar modelos privados 100% offline com CPU ou GPU.',
                },
                {
                  key: 'enableRemoteGateway' as const,
                  title: 'Gateway Caddy HTTPS (--profile remote)',
                  desc: 'Adiciona proxy reverso HTTPS automático para conectar seu App Android de fora de casa.',
                },
                {
                  key: 'enablePythonWorker' as const,
                  title: 'Worker Python 3.11 (--profile python-worker)',
                  desc: 'Chunking Markdown, busca híbrida FTS5 + vetores (RRF) e extração de fatos Hermes.',
                },
                {
                  key: 'enableGoGateway' as const,
                  title: 'Serviço Go Gateway + Crawler (--profile go-gateway)',
                  desc: 'Binário Go (~12 MB) de alta concorrência: Reverse Proxy, Rate Limit e Crawler goroutines.',
                },
              ].map((opt) => {
                const enabled = deployOpts[opt.key];
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setDeployOpts((prev) => ({ ...prev, [opt.key]: !prev[opt.key] }))}
                    style={{
                      textAlign: 'left',
                      padding: '12px',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      border: enabled ? '1px solid rgba(249, 115, 22, 0.5)' : '1px solid var(--border-color)',
                      backgroundColor: enabled ? 'rgba(249, 115, 22, 0.08)' : 'var(--bg-primary)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>{opt.title}</span>
                      <span style={{ fontSize: '0.66rem', fontWeight: 700, color: enabled ? '#6ee7b7' : 'var(--text-muted)' }}>
                        {enabled ? 'INCLUÍDO' : 'OPCIONAL'}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Por que TypeScript + Node.js 22 LTS? */}
          <section className="jarvis-settings-card" style={{ padding: '22px', gap: '14px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Melhor Linguagem para o Servidor (&quot;Cérebro&quot;): Decisão Arquitetural
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Comparativo objetivo entre TypeScript/Node.js 22, Python/FastAPI e Go para sustentar Web + Android em modo Local e Docker.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
              {SERVER_LANGUAGE_COMPARISON.map((row) => (
                <div
                  key={row.stack}
                  className="jarvis-settings-subcard"
                  style={{
                    padding: '15px',
                    gap: '8px',
                    borderColor: row.isPrimary ? 'rgba(249, 115, 22, 0.5)' : 'var(--border-color)',
                    backgroundColor: row.isPrimary ? 'rgba(249, 115, 22, 0.06)' : 'var(--bg-primary)',
                  }}
                >
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: row.isPrimary ? 'var(--accent-light)' : 'var(--text-muted)', textTransform: 'uppercase' }}>
                    {row.recommendedRole}
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>{row.stack}</div>
                  <ul style={{ margin: '2px 0 0', paddingLeft: '16px', fontSize: '0.77rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {row.strengths.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: '8px' }}>
                    <strong>Trade-off:</strong> {row.tradeoffs}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ABA 3: EXPLORADOR DOS ARQUIVOS DO SERVIDOR DUAL-MODE */}
      {activeTab === 'files' && (
        <section
          className="jarvis-settings-card"
          style={{
            padding: '20px',
            display: 'grid',
            gridTemplateColumns: 'minmax(240px, 300px) minmax(0, 1fr)',
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
              <span>jarvis-brain-server/</span>
            </div>
            {serverFiles.map((file) => {
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
                  onClick={() => void handleCopy(activeFile.content, `srv-${activeFile.path}`)}
                  className="btn btn-secondary btn-sm"
                >
                  {copiedKey === `srv-${activeFile.path}` ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copiedKey === `srv-${activeFile.path}` ? 'Copiado' : 'Copiar arquivo'}</span>
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

      {/* ABA 4: MAPA COMPLETO DA API /api/v1 & MODELAGEM UNIFICADA */}
      {activeTab === 'api_map' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Rotas da API */}
          <section className="jarvis-settings-card" style={{ padding: '22px', gap: '14px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Contrato Unificado da API REST &amp; SSE (/api/v1)
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  As mesmas rotas atendem o Hub Web, Desktop e o App Mobile Android — tanto no modo Local (SQLite) quanto em Docker (PostgreSQL).
                </p>
              </div>
              <div style={{ position: 'relative', width: '260px' }}>
                <Search
                  size={14}
                  color="var(--text-muted)"
                  style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
                />
                <input
                  type="text"
                  className="jarvis-input"
                  value={apiSearch}
                  onChange={(e) => setApiSearch(e.target.value)}
                  placeholder="Filtrar rota (ex.: brain, excel, devices)..."
                  style={{ paddingLeft: '32px' }}
                  aria-label="Filtrar rotas da API"
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {filteredApiRoutes.map((route) => {
                const mc = METHOD_COLORS[route.method] || METHOD_COLORS.GET;
                return (
                  <div
                    key={`${route.method}-${route.path}`}
                    className="jarvis-settings-subcard"
                    style={{
                      padding: '10px 14px',
                      display: 'flex',
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 380px', minWidth: 0 }}>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.68rem',
                          fontWeight: 800,
                          padding: '2px 7px',
                          borderRadius: '5px',
                          color: mc.color,
                          backgroundColor: mc.bg,
                          minWidth: '52px',
                          textAlign: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {route.method}
                      </span>
                      <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                        {route.path}
                      </code>
                      <span style={{ fontSize: '0.77rem', color: 'var(--text-secondary)' }}>— {route.summary}</span>
                    </div>
                    <span style={{ fontSize: '0.69rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {route.group} · {route.auth}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Modelagem Unificada SQLite + PostgreSQL */}
          <section className="jarvis-settings-card" style={{ padding: '22px', gap: '14px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Modelagem de Dados Unificada (SQLite WAL &amp; PostgreSQL 16 + pgvector)
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Banco ativo no modo <code>local_sqlite</code> ({schemaInfo?.tables?.length || 12} tabelas em disco · esquema v{schemaInfo?.schema_version || '1.0.0'}).
                </p>
              </div>
              {schemaInfo && (
                <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: '#6ee7b7' }}>
                  {schemaInfo.journal_mode.toUpperCase()} · {(schemaInfo.db_size_bytes / 1024).toFixed(1)} KB
                </span>
              )}
            </div>
            {schemaInfo?.tables && schemaInfo.tables.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: '8px' }}>
                {schemaInfo.tables.map((tbl) => (
                  <div
                    key={tbl.table}
                    className="jarvis-settings-subcard"
                    style={{
                      padding: '8px 12px',
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--text-primary)' }}>
                      {tbl.table}
                    </code>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-light)' }}>
                      {tbl.rows} reg.
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '10px' }}>
              {UNIFIED_SCHEMA_TABLES.map((table) => (
                <div key={table.name} className="jarvis-settings-subcard" style={{ padding: '12px 14px', gap: '4px' }}>
                  <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent-light)' }}>
                    {table.name}
                  </code>
                  <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>{table.role}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
