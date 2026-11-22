import React, { useCallback, useEffect, useState } from 'react';
import {
  GitBranch,
  Layers,
  Cpu,
  Plus,
  RefreshCw,
  Check,
  Trash2,
  Download,
  Search,
  BookOpen,
  ShieldCheck,
  Palette,
} from 'lucide-react';
import {
  fetchIntegrationsHub,
  saveIntegrationConnector,
  inspectGitHubRepo,
  importGitHubSkillPack,
  syncFigmaTokens,
  createContextSet,
  updateContextSetAgents,
  deleteContextSet,
} from '../../services/api/integrations';
import type {
  ContextSetRecord,
  FigmaDesignTokenPack,
  IntegrationConnectorRecord,
  IntegrationProviderId,
} from '../../services/integrationsCatalog';
import { PageHeader } from '../../shared/layout/PageHeader';
import { Modal } from '../../shared/common/Modal';
import { ConfirmDialog } from '../../shared/common/ConfirmDialog';
import { notify } from '../../shared/common/Toast';

const AGENT_ACCESS_LIST = [
  { role: '*', label: 'Todos os agentes' },
  { role: 'frontend_mobile_developer', label: 'Neo (Frontend)' },
  { role: 'ux_ui_designer', label: 'Vega (UX/UI)' },
  { role: 'software_architect', label: 'Atlas (Arquiteto)' },
  { role: 'sentinel_security', label: 'Kira (Segurança)' },
  { role: 'backend_developer', label: 'Backend Dev' },
  { role: 'code_reviewer', label: 'Lia (Revisão & QA)' },
];

const SOURCE_TYPE_LABELS: Record<ContextSetRecord['source_type'], string> = {
  markdown: 'Markdown',
  pdf: 'PDF',
  github: 'GitHub',
  figma: 'Figma',
  docs: 'Documentação',
};

interface IntegrationsHubPanelProps {
  onSkillImported?: () => void;
}

export const IntegrationsHubPanel: React.FC<IntegrationsHubPanelProps> = ({ onSkillImported }) => {
  const [connectors, setConnectors] = useState<IntegrationConnectorRecord[]>([]);
  const [contextSets, setContextSets] = useState<ContextSetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // GitHub live inspector
  const [githubRepoInput, setGithubRepoInput] = useState('vercel/next.js');
  const [githubTokenInput, setGithubTokenInput] = useState('');
  const [githubInspecting, setGithubInspecting] = useState(false);
  const [githubImporting, setGithubImporting] = useState(false);
  const [githubInspection, setGithubInspection] = useState<any | null>(null);

  // Figma live sync
  const [figmaUrlInput, setFigmaUrlInput] = useState('https://www.figma.com/design/JARVIS2026UI/Jarvis-Design-System');
  const [figmaTokenInput, setFigmaTokenInput] = useState('');
  const [figmaSyncing, setFigmaSyncing] = useState(false);
  const [figmaPack, setFigmaPack] = useState<FigmaDesignTokenPack | null>(null);

  // Hugging Face toggle
  const [savingProvider, setSavingProvider] = useState<IntegrationProviderId | null>(null);

  // Create Context Set modal
  const [showContextModal, setShowContextModal] = useState(false);
  const [csName, setCsName] = useState('');
  const [csDesc, setCsDesc] = useState('');
  const [csSourceType, setCsSourceType] = useState<ContextSetRecord['source_type']>('markdown');
  const [csSourceRef, setCsSourceRef] = useState('');
  const [csContent, setCsContent] = useState('');
  const [csAllowedAgents, setCsAllowedAgents] = useState<string[]>(['frontend_mobile_developer', 'ux_ui_designer']);
  const [csSaving, setCsSaving] = useState(false);

  // Delete Context Set
  const [pendingDeleteCs, setPendingDeleteCs] = useState<ContextSetRecord | null>(null);
  const [deletingCs, setDeletingCs] = useState(false);

  const loadHub = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchIntegrationsHub();
      setConnectors(data.connectors || []);
      setContextSets(data.context_sets || []);
      const gh = data.connectors?.find((c) => c.id === 'github');
      if (gh?.target_ref) setGithubRepoInput(gh.target_ref);
      const fg = data.connectors?.find((c) => c.id === 'figma');
      if (fg?.target_ref) setFigmaUrlInput(fg.target_ref);
      if (fg?.metadata && (fg.metadata as any).last_pack) {
        setFigmaPack((fg.metadata as any).last_pack as FigmaDesignTokenPack);
      }
      setError(null);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar integrações.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHub();
  }, [loadHub]);

  const githubConnector = connectors.find((c) => c.id === 'github');
  const figmaConnector = connectors.find((c) => c.id === 'figma');
  const hfConnector = connectors.find((c) => c.id === 'huggingface');

  const handleInspectGitHub = async () => {
    if (!githubRepoInput.trim()) {
      notify('Informe um repositório GitHub (ex.: owner/repo ou URL).', 'error');
      return;
    }
    setGithubInspecting(true);
    try {
      if (githubTokenInput.trim()) {
        await saveIntegrationConnector('github', {
          connected: true,
          token: githubTokenInput.trim(),
          target_ref: githubRepoInput.trim(),
        });
        setGithubTokenInput('');
      }
      const res = await inspectGitHubRepo(githubRepoInput.trim());
      setGithubInspection(res);
      notify(`Repositório ${res.full_name} inspecionado com sucesso.`, 'success');
      await loadHub();
    } catch (err: any) {
      notify(err?.message || 'Não foi possível inspecionar o repositório.', 'error');
    } finally {
      setGithubInspecting(false);
    }
  };

  const handleImportGitHubSkill = async () => {
    if (!githubRepoInput.trim()) return;
    setGithubImporting(true);
    try {
      const res = await importGitHubSkillPack({
        repo: githubRepoInput.trim(),
        allowed_agents: githubConnector?.allowed_agents || ['software_architect', 'frontend_mobile_developer', 'sentinel_security'],
        as_context_set: true,
      });
      setGithubInspection(res.inspection);
      notify(
        `Pacote '${res.skill?.name || githubRepoInput}' importado como Skill + Context Set.`,
        'success'
      );
      onSkillImported?.();
      await loadHub();
    } catch (err: any) {
      notify(err?.message || 'Falha ao importar pacote do GitHub.', 'error');
    } finally {
      setGithubImporting(false);
    }
  };

  const handleSyncFigma = async () => {
    if (!figmaUrlInput.trim()) {
      notify('Informe a URL ou File Key do arquivo Figma.', 'error');
      return;
    }
    setFigmaSyncing(true);
    try {
      const res = await syncFigmaTokens({
        file_url: figmaUrlInput.trim(),
        token: figmaTokenInput.trim() || undefined,
        allowed_agents: figmaConnector?.allowed_agents || ['ux_ui_designer', 'frontend_mobile_developer'],
      });
      setFigmaPack(res.pack);
      setFigmaTokenInput('');
      notify(
        `Tokens de '${res.pack.file_name}' sincronizados (${res.pack.colors.length} cores, ${res.pack.typography.length} estilos) e anexados como Context Set.`,
        'success'
      );
      await loadHub();
    } catch (err: any) {
      notify(err?.message || 'Falha ao sincronizar Figma.', 'error');
    } finally {
      setFigmaSyncing(false);
    }
  };

  const handleToggleHuggingFace = async () => {
    if (!hfConnector) return;
    setSavingProvider('huggingface');
    try {
      const next = !hfConnector.connected;
      await saveIntegrationConnector('huggingface', { connected: next });
      notify(
        next ? 'Hugging Face conectado ao catálogo de modelos e datasets.' : 'Hugging Face desconectado.',
        'info'
      );
      await loadHub();
    } catch (err: any) {
      notify(err?.message || 'Erro ao atualizar Hugging Face.', 'error');
    } finally {
      setSavingProvider(null);
    }
  };

  const handleToggleConnectorAgent = async (connector: IntegrationConnectorRecord, role: string) => {
    const current = connector.allowed_agents || [];
    let next: string[];
    if (role === '*') {
      next = current.includes('*') ? ['frontend_mobile_developer'] : ['*'];
    } else {
      const withoutStar = current.filter((r) => r !== '*');
      next = withoutStar.includes(role)
        ? withoutStar.filter((r) => r !== role)
        : [...withoutStar, role];
    }
    setSavingProvider(connector.id);
    try {
      await saveIntegrationConnector(connector.id, { allowed_agents: next });
      await loadHub();
    } catch (err: any) {
      notify(err?.message || 'Erro ao atualizar acesso de agentes.', 'error');
    } finally {
      setSavingProvider(null);
    }
  };

  const handleToggleContextSetAgent = async (cs: ContextSetRecord, role: string) => {
    const current = cs.allowed_agents || [];
    let next: string[];
    if (role === '*') {
      next = current.includes('*') ? ['frontend_mobile_developer'] : ['*'];
    } else {
      const withoutStar = current.filter((r) => r !== '*');
      next = withoutStar.includes(role)
        ? withoutStar.filter((r) => r !== role)
        : [...withoutStar, role];
    }
    try {
      const updated = await updateContextSetAgents(cs.id, next);
      setContextSets((prev) => prev.map((item) => (item.id === cs.id ? updated : item)));
      notify(`Permissões de '${cs.name}' atualizadas.`, 'success');
    } catch (err: any) {
      notify(err?.message || 'Erro ao atualizar agentes do Context Set.', 'error');
    }
  };

  const handleCreateContextSet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csName.trim() || !csContent.trim()) {
      notify('Preencha o nome e o conteúdo do Context Set.', 'error');
      return;
    }
    setCsSaving(true);
    try {
      await createContextSet({
        name: csName.trim(),
        description: csDesc.trim() || 'Conjunto de contexto personalizado para injeção em prompts.',
        source_type: csSourceType,
        source_ref: csSourceRef.trim() || 'manual',
        content: csContent.trim(),
        allowed_agents: csAllowedAgents.length > 0 ? csAllowedAgents : ['*'],
      });
      notify(`Context Set '${csName.trim()}' criado e pronto para os agentes autorizados.`, 'success');
      setShowContextModal(false);
      setCsName('');
      setCsDesc('');
      setCsSourceRef('');
      setCsContent('');
      await loadHub();
    } catch (err: any) {
      notify(err?.message || 'Erro ao criar Context Set.', 'error');
    } finally {
      setCsSaving(false);
    }
  };

  const confirmDeleteContextSet = async () => {
    if (!pendingDeleteCs) return;
    setDeletingCs(true);
    try {
      await deleteContextSet(pendingDeleteCs.id);
      notify(`Context Set '${pendingDeleteCs.name}' removido.`, 'success');
      setPendingDeleteCs(null);
      await loadHub();
    } catch (err: any) {
      notify(err?.message || 'Erro ao remover Context Set.', 'error');
    } finally {
      setDeletingCs(false);
    }
  };

  const connectedCount = connectors.filter((c) => c.connected).length;

  return (
    <div
      data-testid="integrations-hub-panel"
      style={{ maxWidth: '1040px', width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}
    >
      <PageHeader
        title="Integrações Reais & Context Sets"
        subtitle="Conecte GitHub, Figma e Hugging Face com controle granular de quais agentes especialistas podem ler cada fonte."
        meta={[
          <span key="conn" className="jarvis-tabular">{connectedCount}/{connectors.length} conectores ativos</span>,
          <span key="sets" className="jarvis-tabular">{contextSets.length} Context Sets</span>,
        ]}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setShowContextModal(true)}
              className="btn btn-primary btn-sm"
              style={{ whiteSpace: 'nowrap' }}
            >
              <Plus size={14} />
              <span>Novo Context Set</span>
            </button>
            <button
              type="button"
              onClick={loadHub}
              className="btn btn-ghost btn-icon"
              aria-label="Atualizar integrações"
              title="Atualizar integrações"
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
            </button>
          </div>
        }
      />

      {error && (
        <div role="alert" className="jarvis-callout jarvis-callout--danger">
          {error}
        </div>
      )}

      {/* Real Connectors Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '14px',
          alignItems: 'stretch',
        }}
      >
        {/* Connector 1: GitHub */}
        <section
          data-testid="connector-card-github"
          style={{
            padding: '18px',
            borderRadius: '12px',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <GitBranch size={18} color="var(--accent-color)" />
              <div>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  GitHub
                </h3>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {githubConnector?.connected ? 'Conectado' : 'Pronto para inspeção pública'}
                  {githubConnector?.masked_token ? ` · Token ${githubConnector.masked_token}` : ''}
                </div>
              </div>
            </div>
          </div>

          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Inspecione repositórios reais, leia arquivos <code>SKILL.md</code> e importe direto para a loja de habilidades e Context Sets.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label htmlFor="gh-repo-input" style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              Repositório (owner/repo ou URL)
            </label>
            <input
              id="gh-repo-input"
              type="text"
              value={githubRepoInput}
              onChange={(e) => setGithubRepoInput(e.target.value)}
              placeholder="ex.: anthropics/skills ou vercel/next.js"
              className="jarvis-input"
            />
            <input
              type="password"
              value={githubTokenInput}
              onChange={(e) => setGithubTokenInput(e.target.value)}
              placeholder="Personal Access Token opcional (repos privados)"
              aria-label="Token opcional do GitHub"
              className="jarvis-input"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={githubInspecting}
              onClick={handleInspectGitHub}
              className="btn btn-secondary btn-sm"
              style={{ whiteSpace: 'nowrap' }}
            >
              <Search size={13} />
              <span>{githubInspecting ? 'Inspecionando...' : 'Inspecionar Repo'}</span>
            </button>
            <button
              type="button"
              disabled={githubImporting}
              onClick={handleImportGitHubSkill}
              className="btn btn-primary btn-sm"
              style={{ whiteSpace: 'nowrap' }}
            >
              <Download size={13} />
              <span>{githubImporting ? 'Importando...' : 'Importar SKILL.md'}</span>
            </button>
          </div>

          {githubInspection && (
            <div
              data-testid="github-inspection-result"
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-subtle)',
                fontSize: '0.76rem',
                color: 'var(--text-secondary)',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {githubInspection.full_name} · {githubInspection.language || 'Multi-stack'}
              </div>
              <div>{githubInspection.description}</div>
              <div className="jarvis-tabular" style={{ color: 'var(--text-muted)' }}>
                {githubInspection.stars ?? 0} estrelas · {githubInspection.has_skill_md ? 'SKILL.md detectado' : 'README pronto para destilação'}
              </div>
            </div>
          )}

          {githubConnector && (
            <div style={{ marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Agentes com leitura autorizada:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {AGENT_ACCESS_LIST.slice(1, 6).map((ag) => {
                  const enabled =
                    githubConnector.allowed_agents.includes('*') ||
                    githubConnector.allowed_agents.includes(ag.role);
                  return (
                    <button
                      key={ag.role}
                      type="button"
                      disabled={savingProvider === 'github'}
                      onClick={() => handleToggleConnectorAgent(githubConnector, ag.role)}
                      className={`btn btn-xs ${enabled ? 'btn-secondary' : 'btn-ghost'}`}
                      style={{
                        border: enabled ? '1px solid var(--border-accent)' : '1px solid var(--border-subtle)',
                        color: enabled ? 'var(--text-primary)' : 'var(--text-muted)',
                      }}
                    >
                      {enabled && <Check size={11} color="var(--accent-color)" />}
                      <span>{ag.label.split(' ')[0]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Connector 2: Figma */}
        <section
          data-testid="connector-card-figma"
          style={{
            padding: '18px',
            borderRadius: '12px',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Palette size={18} color="var(--accent-color)" />
              <div>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Figma Design Tokens
                </h3>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {figmaConnector?.connected ? 'Sincronizado' : 'Pronto para sincronizar'}
                  {figmaConnector?.masked_token ? ` · Token ${figmaConnector.masked_token}` : ''}
                </div>
              </div>
            </div>
          </div>

          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Extraia cores, tipografia e componentes de arquivos Figma direto para o Context Set de <strong>Vega</strong> (UX/UI) e <strong>Neo</strong> (Front-End).
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label htmlFor="figma-url-input" style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              URL ou File Key do Figma
            </label>
            <input
              id="figma-url-input"
              type="text"
              value={figmaUrlInput}
              onChange={(e) => setFigmaUrlInput(e.target.value)}
              placeholder="https://www.figma.com/design/..."
              className="jarvis-input"
            />
            <input
              type="password"
              value={figmaTokenInput}
              onChange={(e) => setFigmaTokenInput(e.target.value)}
              placeholder="Figma Personal Token opcional (API ao vivo)"
              aria-label="Token opcional do Figma"
              className="jarvis-input"
            />
          </div>

          <div>
            <button
              type="button"
              data-testid="sync-figma-btn"
              disabled={figmaSyncing}
              onClick={handleSyncFigma}
              className="btn btn-primary btn-sm"
              style={{ whiteSpace: 'nowrap' }}
            >
              <Layers size={13} />
              <span>{figmaSyncing ? 'Sincronizando...' : 'Sincronizar Tokens'}</span>
            </button>
          </div>

          {figmaPack && (
            <div
              data-testid="figma-tokens-preview"
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {figmaPack.file_name} · <span className="jarvis-tabular">{figmaPack.components_count} componentes</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {figmaPack.colors.map((c) => (
                  <div
                    key={`${c.name}-${c.hex}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}
                  >
                    <span
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '3px',
                        backgroundColor: c.hex,
                        border: '1px solid rgba(255,255,255,0.2)',
                        display: 'inline-block',
                      }}
                    />
                    <span className="jarvis-tabular">{c.hex}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {figmaConnector && (
            <div style={{ marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Agentes com leitura autorizada:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {AGENT_ACCESS_LIST.slice(1, 5).map((ag) => {
                  const enabled =
                    figmaConnector.allowed_agents.includes('*') ||
                    figmaConnector.allowed_agents.includes(ag.role);
                  return (
                    <button
                      key={ag.role}
                      type="button"
                      disabled={savingProvider === 'figma'}
                      onClick={() => handleToggleConnectorAgent(figmaConnector, ag.role)}
                      className={`btn btn-xs ${enabled ? 'btn-secondary' : 'btn-ghost'}`}
                      style={{
                        border: enabled ? '1px solid var(--border-accent)' : '1px solid var(--border-subtle)',
                        color: enabled ? 'var(--text-primary)' : 'var(--text-muted)',
                      }}
                    >
                      {enabled && <Check size={11} color="var(--accent-color)" />}
                      <span>{ag.label.split(' ')[0]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Connector 3: Hugging Face */}
        <section
          data-testid="connector-card-huggingface"
          style={{
            padding: '18px',
            borderRadius: '12px',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Cpu size={18} color="var(--accent-color)" />
              <div>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Hugging Face Hub
                </h3>
                <div style={{ fontSize: '0.75rem', color: hfConnector?.connected ? '#4ade80' : 'var(--text-muted)' }}>
                  {hfConnector?.connected ? 'Conectado ao catálogo' : 'Desconectado'}
                </div>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={Boolean(hfConnector?.connected)}
              disabled={savingProvider === 'huggingface'}
              onClick={handleToggleHuggingFace}
              className={`btn btn-xs ${hfConnector?.connected ? 'btn-secondary' : 'btn-primary'}`}
            >
              {hfConnector?.connected ? 'Desconectar' : 'Conectar'}
            </button>
          </div>

          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Sincronizado automaticamente com o painel de Modelos & Motores Locais para importar modelos GGUF (Qwen, DeepSeek, Llama) e datasets abertos.
          </p>

          <div
            style={{
              padding: '10px 12px',
              borderRadius: '8px',
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.76rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
            }}
          >
            {hfConnector?.last_sync_summary || 'Modelos recomendados prontos para execução local via Ollama / vLLM.'}
          </div>

          {hfConnector && (
            <div style={{ marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Agentes com acesso ao Hub:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {AGENT_ACCESS_LIST.slice(0, 4).map((ag) => {
                  const enabled =
                    hfConnector.allowed_agents.includes('*')
                      ? ag.role === '*'
                      : hfConnector.allowed_agents.includes(ag.role);
                  return (
                    <button
                      key={ag.role}
                      type="button"
                      disabled={savingProvider === 'huggingface'}
                      onClick={() => handleToggleConnectorAgent(hfConnector, ag.role)}
                      className={`btn btn-xs ${enabled ? 'btn-secondary' : 'btn-ghost'}`}
                      style={{
                        border: enabled ? '1px solid var(--border-accent)' : '1px solid var(--border-subtle)',
                        color: enabled ? 'var(--text-primary)' : 'var(--text-muted)',
                      }}
                    >
                      {enabled && <Check size={11} color="var(--accent-color)" />}
                      <span>{ag.label.split(' ')[0]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Context Sets Management Table / List */}
      <section
        aria-label="Context Sets anexáveis"
        style={{
          borderRadius: '12px',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BookOpen size={16} color="var(--accent-color)" />
            <div>
              <h3 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Context Sets Anexáveis por Agente
              </h3>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                Pacotes de contexto injetados automaticamente no raciocínio apenas dos agentes especialistas autorizados.
              </div>
            </div>
          </div>

          <span className="jarvis-tabular" style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
            {contextSets.length} pacotes ativos
          </span>
        </div>

        {contextSets.length === 0 ? (
          <div style={{ padding: '28px', textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Nenhum Context Set cadastrado. Crie um pacote ou sincronize Figma / GitHub acima.
          </div>
        ) : (
          <div data-testid="context-sets-list">
            {contextSets.map((cs, idx) => (
              <div
                key={cs.id}
                data-testid={`context-set-row-${cs.id}`}
                style={{
                  padding: '16px 20px',
                  borderTop: idx === 0 ? 'none' : '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: '1 1 320px' }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {cs.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {SOURCE_TYPE_LABELS[cs.source_type]} · {cs.source_ref} ·{' '}
                      <span className="jarvis-tabular">~{cs.token_estimate} tokens</span>
                    </div>
                    <p style={{ margin: '6px 0 0 0', fontSize: '0.81rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {cs.description}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPendingDeleteCs(cs)}
                    className="btn btn-ghost btn-xs"
                    style={{ color: 'var(--danger-color, #f87171)' }}
                    aria-label={`Remover Context Set '${cs.name}'`}
                  >
                    <Trash2 size={13} />
                    <span>Remover</span>
                  </button>
                </div>

                {/* Granular per-agent permissions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                    <ShieldCheck size={12} color="var(--accent-light)" />
                    <span>Acesso por agente:</span>
                  </span>

                  {AGENT_ACCESS_LIST.map((ag) => {
                    const active =
                      ag.role === '*'
                        ? cs.allowed_agents.includes('*')
                        : !cs.allowed_agents.includes('*') && cs.allowed_agents.includes(ag.role);
                    return (
                      <button
                        key={ag.role}
                        type="button"
                        onClick={() => handleToggleContextSetAgent(cs, ag.role)}
                        aria-pressed={active}
                        className={`btn btn-xs ${active ? 'btn-secondary' : 'btn-ghost'}`}
                        style={{
                          border: active ? '1px solid var(--border-accent)' : '1px solid var(--border-subtle)',
                          color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                        }}
                      >
                        {active && <Check size={11} color="var(--accent-color)" />}
                        <span>{ag.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Modal: Create Context Set */}
      <Modal
        isOpen={showContextModal}
        onClose={() => setShowContextModal(false)}
        title="Novo Context Set"
        subtitle="Crie um pacote de regras, documentação ou especificações anexável aos agentes escolhidos."
        icon={<BookOpen size={18} />}
        maxWidth="md"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" onClick={() => setShowContextModal(false)} className="btn btn-secondary btn-sm">
              Cancelar
            </button>
            <button type="submit" form="create-context-set-form" disabled={csSaving} className="btn btn-primary btn-sm">
              <Check size={14} />
              <span>{csSaving ? 'Salvando...' : 'Criar Context Set'}</span>
            </button>
          </div>
        }
      >
        <form id="create-context-set-form" onSubmit={handleCreateContextSet} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label htmlFor="cs-name" className="user-profile-field-label">
              Nome do Pacote *
            </label>
            <input
              id="cs-name"
              type="text"
              value={csName}
              onChange={(e) => setCsName(e.target.value)}
              placeholder="Ex.: Guia de API REST e Padrões TypeScript"
              className="jarvis-input"
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            <div>
              <label htmlFor="cs-source-type" className="user-profile-field-label">
                Tipo de Fonte
              </label>
              <select
                id="cs-source-type"
                value={csSourceType}
                onChange={(e) => setCsSourceType(e.target.value as ContextSetRecord['source_type'])}
                className="jarvis-input"
              >
                <option value="markdown">Markdown</option>
                <option value="docs">Documentação</option>
                <option value="pdf">Resumo de PDF</option>
                <option value="github">GitHub</option>
                <option value="figma">Figma</option>
              </select>
            </div>
            <div>
              <label htmlFor="cs-source-ref" className="user-profile-field-label">
                Referência / Origem
              </label>
              <input
                id="cs-source-ref"
                type="text"
                value={csSourceRef}
                onChange={(e) => setCsSourceRef(e.target.value)}
                placeholder="ex.: docs/arquitetura.md"
                className="jarvis-input"
              />
            </div>
          </div>

          <div>
            <label htmlFor="cs-desc" className="user-profile-field-label">
              Descrição curta
            </label>
            <input
              id="cs-desc"
              type="text"
              value={csDesc}
              onChange={(e) => setCsDesc(e.target.value)}
              placeholder="Para que os agentes devem usar este contexto"
              className="jarvis-input"
            />
          </div>

          <div>
            <label htmlFor="cs-content" className="user-profile-field-label">
              Conteúdo / Diretrizes (Markdown ou texto) *
            </label>
            <textarea
              id="cs-content"
              rows={5}
              value={csContent}
              onChange={(e) => setCsContent(e.target.value)}
              placeholder="Cole aqui diretrizes, contratos de API, tokens ou resumo de PDF..."
              className="jarvis-input"
              style={{ resize: 'vertical', minHeight: '110px' }}
              required
            />
          </div>

          <div>
            <div className="user-profile-field-label">Agentes autorizados</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {AGENT_ACCESS_LIST.map((ag) => {
                const selected = csAllowedAgents.includes(ag.role);
                return (
                  <button
                    key={ag.role}
                    type="button"
                    onClick={() => {
                      if (ag.role === '*') {
                        setCsAllowedAgents(selected ? ['frontend_mobile_developer'] : ['*']);
                      } else {
                        const clean = csAllowedAgents.filter((r) => r !== '*');
                        setCsAllowedAgents(
                          clean.includes(ag.role)
                            ? clean.filter((r) => r !== ag.role)
                            : [...clean, ag.role]
                        );
                      }
                    }}
                    className={`btn btn-xs ${selected ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    {ag.label}
                  </button>
                );
              })}
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(pendingDeleteCs)}
        title="Remover Context Set"
        description={
          pendingDeleteCs ? (
            <>
              Deseja remover <strong>{pendingDeleteCs.name}</strong>? Os agentes deixarão de receber este contexto automaticamente.
            </>
          ) : null
        }
        confirmLabel="Remover"
        tone="danger"
        isLoading={deletingCs}
        onConfirm={confirmDeleteContextSet}
        onCancel={() => setPendingDeleteCs(null)}
      />
    </div>
  );
};
