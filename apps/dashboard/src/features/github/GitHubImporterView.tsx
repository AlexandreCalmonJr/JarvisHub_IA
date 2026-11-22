import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  GitBranch,
  Search,
  Sparkles,
  ShieldCheck,
  Star,
  GitFork,
  ExternalLink,
  Layers,
  Bot,
  Database,
  CheckCircle2,
  Folder,
  FileCode2,
  Loader2,
  AlertCircle,
  ArrowRight,
  Terminal,
  Package,
  Clock,
} from 'lucide-react';
import {
  CURATED_GITHUB_EXAMPLES,
  CuratedGitHubExample,
  GitHubIncorporationMode,
  GitHubRepoInspection,
} from '../../services/githubImporterEngine';
import {
  fetchGitHubHistoryApi,
  incorporateGitHubRepoApi,
  inspectGitHubRepoApi,
} from '../../services/api/githubImporter';
import { fetchAgents } from '../../api';
import { AgentInfo, getAgentLabel } from '../../types';
import { notify } from '../../shared/common/Toast';

interface GitHubImporterViewProps {
  onNavigate?: (tab: string) => void;
}

const MODE_LABELS: Record<GitHubIncorporationMode, string> = {
  skill: 'Habilidade',
  agent: 'Agente',
  knowledge: 'Conhecimento',
};

export const GitHubImporterView: React.FC<GitHubImporterViewProps> = ({ onNavigate }) => {
  const [examples, setExamples] = useState<CuratedGitHubExample[]>(CURATED_GITHUB_EXAMPLES);
  const [history, setHistory] = useState<GitHubRepoInspection[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);

  const [repoUrl, setRepoUrl] = useState('');
  const [useAi, setUseAi] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [activeInspectionId, setActiveInspectionId] = useState<string | null>(null);
  const [selectedSkillAgents, setSelectedSkillAgents] = useState<string[]>(['jarvis_master']);
  const [customSkillName, setCustomSkillName] = useState('');
  const [customAgentName, setCustomAgentName] = useState('');
  const [incorporatingMode, setIncorporatingMode] = useState<GitHubIncorporationMode | null>(null);
  const [lastResultMessage, setLastResultMessage] = useState<{
    mode: GitHubIncorporationMode;
    text: string;
  } | null>(null);

  const reportSectionRef = useRef<HTMLElement | null>(null);

  const activeInspection = useMemo(
    () => history.find((item) => item.id === activeInspectionId) || history[0] || null,
    [history, activeInspectionId]
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchGitHubHistoryApi().catch(() => ({ examples: CURATED_GITHUB_EXAMPLES, items: [] })),
      fetchAgents().catch(() => []),
    ]).then(([ghData, agentsData]) => {
      if (cancelled) return;
      if (ghData.examples?.length) setExamples(ghData.examples);
      setHistory(ghData.items || []);
      if (ghData.items?.length) {
        setActiveInspectionId((prev) => prev || ghData.items[0].id);
      }
      setAgents(agentsData);
      if (agentsData.length > 0) {
        setSelectedSkillAgents((prev) => {
          const valid = prev.filter((r) => agentsData.some((a) => a.role === r));
          return valid.length > 0 ? valid : [agentsData[0].role];
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeInspection) return;
    setCustomSkillName(activeInspection.suggestedSkillName);
    setCustomAgentName(activeInspection.suggestedAgentName);
    setLastResultMessage(null);
  }, [activeInspection?.id]);

  const scrollToReport = () => {
    requestAnimationFrame(() => {
      reportSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const runInspection = async (urlToInspect: string) => {
    const clean = urlToInspect.trim();
    if (!clean) {
      setErrorMsg('Cole o link de um repositório público do GitHub (ex.: https://github.com/usuario/projeto).');
      return;
    }
    setErrorMsg(null);
    setInspecting(true);
    setLastResultMessage(null);
    try {
      const inspection = await inspectGitHubRepoApi({ url: clean, useAi });
      setHistory((prev) => [inspection, ...prev.filter((item) => item.id !== inspection.id)]);
      setActiveInspectionId(inspection.id);
      notify(`Repositório "${inspection.fullName}" analisado com segurança (somente leitura).`, 'success');
      scrollToReport();
    } catch (err: any) {
      const msg = err?.message || 'Não foi possível ler este repositório do GitHub.';
      setErrorMsg(msg);
      notify(msg, 'error');
    } finally {
      setInspecting(false);
    }
  };

  const handleInspectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runInspection(repoUrl);
  };

  const toggleAgentForSkill = (role: string) => {
    setSelectedSkillAgents((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleIncorporate = async (mode: GitHubIncorporationMode) => {
    if (!activeInspection) return;
    setIncorporatingMode(mode);
    setErrorMsg(null);
    try {
      const res = await incorporateGitHubRepoApi({
        inspectionId: activeInspection.id,
        mode,
        approvedByUser: true,
        customName:
          mode === 'skill'
            ? customSkillName.trim() || undefined
            : mode === 'agent'
              ? customAgentName.trim() || undefined
              : undefined,
        assignedAgents: mode === 'skill' ? selectedSkillAgents : undefined,
      });

      setHistory((prev) =>
        prev.map((item) => (item.id === res.inspection.id ? res.inspection : item))
      );
      setLastResultMessage({ mode, text: res.message });
      notify(res.message, 'success');

      if (mode === 'agent' || mode === 'skill') {
        window.dispatchEvent(new CustomEvent('jarvis:agents-updated'));
      }
    } catch (err: any) {
      const msg = err?.message || 'Não foi possível concluir a incorporação.';
      setErrorMsg(msg);
      notify(msg, 'error');
    } finally {
      setIncorporatingMode(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', paddingBottom: '36px' }}>
      {/* Hero Header */}
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
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', flex: '1 1 420px', maxWidth: '680px' }}>
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
            <GitBranch size={22} />
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
              Importador de Repositórios do GitHub
            </h1>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: '0.88rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
              }}
            >
              Cole o link de qualquer repositório público do GitHub. O JARVIS lê a estrutura e a documentação em
              português e permite incorporar com 1 clique como <strong>Habilidade</strong>,{' '}
              <strong>Novo Agente</strong> ou <strong>Base de Conhecimento</strong>.
            </p>
          </div>
        </div>

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            borderRadius: '10px',
            backgroundColor: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.28)',
            color: '#6ee7b7',
            fontSize: '0.78rem',
            fontWeight: 600,
          }}
        >
          <ShieldCheck size={16} />
          <span>Análise somente leitura · aprovação obrigatória</span>
        </div>
      </section>

      {/* Formulário de Leitura do Repositório */}
      <section className="jarvis-settings-card" style={{ padding: '20px 22px' }}>
        <form onSubmit={handleInspectSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label
              htmlFor="github-repo-url"
              style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}
            >
              Link ou nome do repositório público no GitHub
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ position: 'relative', flex: '1 1 340px' }}>
                <Search
                  size={15}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  id="github-repo-url"
                  type="text"
                  className="jarvis-input"
                  style={{ paddingLeft: '36px', width: '100%' }}
                  placeholder="https://github.com/usuario/projeto ou usuario/projeto"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={inspecting}
                className="btn btn-primary"
                style={{ minWidth: '195px', justifyContent: 'center' }}
              >
                {inspecting ? (
                  <>
                    <Loader2 size={15} className="spin" />
                    <span>Analisando repositório...</span>
                  </>
                ) : (
                  <>
                    <GitBranch size={15} />
                    <span>Ler e Analisar</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Exemplos rápidos + opção Gemini */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                Testar com 1 clique:
              </span>
              {examples.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  disabled={inspecting}
                  onClick={() => {
                    setRepoUrl(ex.url);
                    void runInspection(ex.url);
                  }}
                  className="btn btn-secondary btn-xs"
                  title={ex.hint}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.73rem' }}
                >
                  {ex.label}
                </button>
              ))}
            </div>

            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.79rem',
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
              <span>Enriquecer resumo com IA (Gemini)</span>
            </label>
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

      {/* Relatório da Análise + Painel de Incorporação */}
      {activeInspection && (
        <section
          ref={reportSectionRef}
          className="jarvis-settings-card"
          style={{
            padding: '0',
            overflow: 'hidden',
            borderColor: 'rgba(249, 115, 22, 0.28)',
          }}
        >
          {/* Cabeçalho do Repositório Analisado */}
          <div
            style={{
              padding: '18px 22px',
              borderBottom: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-elevated)',
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: '1 1 420px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {activeInspection.fullName}
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
                  {activeInspection.primaryLanguage}
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
                  {activeInspection.license}
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.75rem',
                    color: '#fbbf24',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <Star size={13} />
                  {activeInspection.stars.toLocaleString('pt-BR')}
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  <GitFork size={13} />
                  {activeInspection.forks.toLocaleString('pt-BR')}
                </span>
              </div>

              {activeInspection.incorporatedModes.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  {activeInspection.incorporatedModes.map((m) => (
                    <span
                      key={m}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '0.71rem',
                        fontWeight: 600,
                        color: '#6ee7b7',
                        backgroundColor: 'rgba(16, 185, 129, 0.12)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        padding: '2px 8px',
                        borderRadius: '6px',
                      }}
                    >
                      <CheckCircle2 size={12} />
                      <span>Incorporado como {MODE_LABELS[m]}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <a
              href={activeInspection.canonicalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm"
              style={{ textDecoration: 'none' }}
            >
              <ExternalLink size={14} />
              <span>Abrir no GitHub</span>
            </a>
          </div>

          {/* Corpo da Análise */}
          <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Resumo + Como turbina o JARVIS */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '14px',
              }}
            >
              <div className="jarvis-settings-subcard" style={{ padding: '16px', gap: '6px' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-light)', textTransform: 'uppercase' }}>
                  O que este projeto faz
                </div>
                <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-primary)', lineHeight: 1.55 }}>
                  {activeInspection.summaryPtBr}
                </p>
              </div>
              <div className="jarvis-settings-subcard" style={{ padding: '16px', gap: '6px' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase' }}>
                  Como pode turbinar o JARVIS
                </div>
                <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  {activeInspection.howItBoostsJarvis}
                </p>
              </div>
            </div>

            {/* Capacidades Detectadas + Estrutura de Arquivos */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '14px',
              }}
            >
              <div className="jarvis-settings-subcard" style={{ padding: '16px', gap: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Funções e capacidades detectadas ({activeInspection.detectedCapabilities.length})
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {activeInspection.detectedCapabilities.map((cap) => (
                    <div
                      key={cap.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '8px',
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {cap.title}
                      </div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: 1.45 }}>
                        {cap.description}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="jarvis-settings-subcard" style={{ padding: '16px', gap: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Estrutura inspecionada (raiz)
                </h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {activeInspection.filesPreview.slice(0, 18).map((file) => (
                    <span
                      key={file.path}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '0.73rem',
                        fontFamily: 'var(--font-mono)',
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border-subtle)',
                        color: file.type === 'dir' ? 'var(--accent-light)' : 'var(--text-secondary)',
                      }}
                    >
                      {file.type === 'dir' ? <Folder size={12} /> : <FileCode2 size={12} />}
                      <span>{file.name}</span>
                    </span>
                  ))}
                </div>

                {activeInspection.detectedScripts.length > 0 && (
                  <div style={{ marginTop: '4px' }}>
                    <div style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Terminal size={12} />
                      <span>Scripts encontrados no package.json:</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                      {activeInspection.detectedScripts.map((script) => (
                        <code
                          key={script}
                          style={{
                            fontSize: '0.71rem',
                            padding: '2px 7px',
                            borderRadius: '5px',
                            backgroundColor: '#090c12',
                            border: '1px solid var(--border-color)',
                            color: '#e2e8f0',
                          }}
                        >
                          {script}
                        </code>
                      ))}
                    </div>
                  </div>
                )}

                {activeInspection.topDependencies.length > 0 && (
                  <div style={{ marginTop: '2px' }}>
                    <div style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Package size={12} />
                      <span>Principais dependências:</span>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', lineHeight: 1.5 }}>
                      {activeInspection.topDependencies.slice(0, 10).join(' · ')}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Banner de Sucesso após Incorporação com Atalho */}
            {lastResultMessage && (
              <div
                role="status"
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.32)',
                  color: '#a7f3d0',
                  fontSize: '0.83rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={16} />
                  <span>{lastResultMessage.text}</span>
                </div>
                {onNavigate && (
                  <button
                    type="button"
                    onClick={() =>
                      onNavigate(
                        lastResultMessage.mode === 'skill'
                          ? 'skills'
                          : lastResultMessage.mode === 'agent'
                            ? 'agents'
                            : 'knowledge'
                      )
                    }
                    className="btn btn-secondary btn-xs"
                  >
                    <span>
                      Abrir em{' '}
                      {lastResultMessage.mode === 'skill'
                        ? 'Habilidades'
                        : lastResultMessage.mode === 'agent'
                          ? 'Meus Agentes'
                          : 'Base de Conhecimento'}
                    </span>
                    <ArrowRight size={13} />
                  </button>
                )}
              </div>
            )}

            {/* 3 Opções de Incorporação com Aprovação Explícita */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Incorporar ao JARVIS (escolha como deseja usar)
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.79rem', color: 'var(--text-muted)' }}>
                  Nenhuma alteração é aplicada automaticamente — clique abaixo para aprovar e incorporar o modo desejado.
                </p>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '14px',
                }}
              >
                {/* Card 1: Habilidade */}
                <div
                  className="jarvis-settings-subcard"
                  style={{
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Layers size={16} color="var(--accent-light)" />
                      <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                        1. Incorporar como Habilidade
                      </strong>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.48 }}>
                      Transforma os recursos e instruções deste repositório em uma Habilidade vinculada aos agentes escolhidos.
                    </p>
                    <input
                      type="text"
                      className="jarvis-input"
                      aria-label="Nome da habilidade"
                      value={customSkillName}
                      onChange={(e) => setCustomSkillName(e.target.value)}
                      placeholder="Nome da habilidade"
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                        Vincular aos agentes ({selectedSkillAgents.length} selecionado(s)):
                      </span>
                      <div
                        style={{
                          maxHeight: '112px',
                          overflowY: 'auto',
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '5px',
                          padding: '6px',
                          borderRadius: '8px',
                          backgroundColor: 'var(--bg-primary)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        {agents.slice(0, 12).map((ag) => {
                          const checked = selectedSkillAgents.includes(ag.role);
                          return (
                            <button
                              key={ag.role}
                              type="button"
                              onClick={() => toggleAgentForSkill(ag.role)}
                              className={checked ? 'btn btn-primary btn-xs' : 'btn btn-ghost btn-xs'}
                              aria-pressed={checked}
                              style={{ fontSize: '0.71rem' }}
                            >
                              {ag.proper_name || getAgentLabel(ag.role)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={incorporatingMode !== null}
                    onClick={() => void handleIncorporate('skill')}
                    className="btn btn-primary btn-sm btn-block"
                    style={{ justifyContent: 'center' }}
                  >
                    {incorporatingMode === 'skill' ? (
                      <Loader2 size={14} className="spin" />
                    ) : (
                      <Layers size={14} />
                    )}
                    <span>Aprovar e Criar Habilidade</span>
                  </button>
                </div>

                {/* Card 2: Novo Agente */}
                <div
                  className="jarvis-settings-subcard"
                  style={{
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Bot size={16} color="#38bdf8" />
                      <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                        2. Incorporar como Novo Agente
                      </strong>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.48 }}>
                      Cria um especialista dedicado pronto no painel lateral direito (AgentDock) e no Chat com a documentação deste projeto.
                    </p>
                    <input
                      type="text"
                      className="jarvis-input"
                      aria-label="Nome do especialista"
                      value={customAgentName}
                      onChange={(e) => setCustomAgentName(e.target.value)}
                      placeholder="Nome do especialista"
                    />
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      Atalho no chat:{' '}
                      <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                        {activeInspection.suggestedAgentHandle}
                      </strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={incorporatingMode !== null}
                    onClick={() => void handleIncorporate('agent')}
                    className="btn btn-secondary btn-sm btn-block"
                    style={{ justifyContent: 'center' }}
                  >
                    {incorporatingMode === 'agent' ? (
                      <Loader2 size={14} className="spin" />
                    ) : (
                      <Bot size={14} />
                    )}
                    <span>Aprovar e Criar Agente</span>
                  </button>
                </div>

                {/* Card 3: Base de Conhecimento */}
                <div
                  className="jarvis-settings-subcard"
                  style={{
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Database size={16} color="#10b981" />
                      <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                        3. Salvar na Base de Conhecimento
                      </strong>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.48 }}>
                      Indexa o resumo técnico, arquitetura, scripts e trecho do README no Cofre de Conhecimento para qualquer agente consultar.
                    </p>
                    <div
                      style={{
                        fontSize: '0.74rem',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-muted)',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      github-{activeInspection.owner}-{activeInspection.repo}.md
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={incorporatingMode !== null}
                    onClick={() => void handleIncorporate('knowledge')}
                    className="btn btn-secondary btn-sm btn-block"
                    style={{ justifyContent: 'center' }}
                  >
                    {incorporatingMode === 'knowledge' ? (
                      <Loader2 size={14} className="spin" />
                    ) : (
                      <Database size={14} />
                    )}
                    <span>Aprovar e Indexar Conhecimento</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Histórico de Repositórios Analisados */}
      {history.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Repositórios analisados recentemente ({history.length})
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '12px',
            }}
          >
            {history.map((item) => {
              const selected = activeInspection?.id === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => setActiveInspectionId(item.id)}
                  className="jarvis-settings-subcard"
                  style={{
                    padding: '14px',
                    cursor: 'pointer',
                    borderColor: selected ? 'var(--accent-color)' : 'var(--border-color)',
                    backgroundColor: selected ? 'rgba(249, 115, 22, 0.06)' : undefined,
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <strong
                      style={{
                        fontSize: '0.86rem',
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.fullName}
                    </strong>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {item.primaryLanguage}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    {item.incorporatedModes.length === 0 ? (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={11} /> Somente analisado
                      </span>
                    ) : (
                      item.incorporatedModes.map((m) => (
                        <span
                          key={m}
                          style={{
                            fontSize: '0.68rem',
                            color: '#6ee7b7',
                            backgroundColor: 'rgba(16, 185, 129, 0.12)',
                            padding: '1px 6px',
                            borderRadius: '5px',
                          }}
                        >
                          {MODE_LABELS[m]}
                        </span>
                      ))
                    )}
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
