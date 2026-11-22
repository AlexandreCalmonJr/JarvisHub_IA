import React, { useState, useEffect } from 'react';
import { API_BASE } from '../../services/api/client';
import {
  extractColorPalette,
  auditWcagAccessibility,
  fetchComponentBoilerplate,
} from '../../api';
import {
  CheckCircle,
  AlertTriangle,
  Copy,
  Check,
  Sparkles,
} from 'lucide-react';
import { getSeverityLabel } from '../../types';
import { PageHeader } from '../../shared/layout/PageHeader';

const COMPONENT_TEMPLATES = [
  { id: 'navbar', label: 'Barra de Navegação' },
  { id: 'feature_card', label: 'Card de Recursos' },
  { id: 'stats_grid', label: 'Grid de Estatísticas' },
];

export const DesignStudioView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'palette' | 'wcag' | 'components'>('components');
  const [canUseDesignTools, setCanUseDesignTools] = useState(false);
  const [roleLoaded, setRoleLoaded] = useState(false);

  // Paleta de Cores
  const [primaryHex, setPrimaryHex] = useState('#3b82f6');
  const [paletteName, setPaletteName] = useState('jarvis');
  const [paletteData, setPaletteData] = useState<any | null>(null);
  const [paletteLoading, setPaletteLoading] = useState(false);
  const [paletteError, setPaletteError] = useState<string | null>(null);
  const [copiedCss, setCopiedCss] = useState(false);

  // Acessibilidade WCAG
  const [markupInput, setMarkupInput] = useState(
    '<nav>\n  <img src="/logo.png" />\n  <button></button>\n  <input type="text" />\n  <a href="#">clique aqui</a>\n</nav>'
  );
  const [wcagResult, setWcagResult] = useState<any | null>(null);
  const [wcagLoading, setWcagLoading] = useState(false);
  const [wcagError, setWcagError] = useState<string | null>(null);

  // Componentes
  const [selectedCompType, setSelectedCompType] = useState('navbar');
  const [componentCode, setComponentCode] = useState<string | null>(null);
  const [componentLoading, setComponentLoading] = useState(false);
  const [componentError, setComponentError] = useState<string | null>(null);
  const [copiedComp, setCopiedComp] = useState(false);

  const loadPalette = async (hex: string, name: string) => {
    setPaletteLoading(true);
    setPaletteError(null);
    setPaletteData(null);
    try {
      const data = await extractColorPalette(hex, name);
      setPaletteData(data);
    } catch (e: any) {
      setPaletteError(e?.message || 'Falha ao gerar paleta de cores.');
    } finally {
      setPaletteLoading(false);
    }
  };

  const loadComponent = async (compType: string) => {
    setComponentLoading(true);
    setComponentError(null);
    setComponentCode(null);
    try {
      const data = await fetchComponentBoilerplate(compType);
      setComponentCode(data.code);
    } catch (e: any) {
      setComponentError(e?.message || 'Falha ao carregar componente.');
    } finally {
      setComponentLoading(false);
    }
  };

  useEffect(() => {
    if (!canUseDesignTools) return;
    const timer = window.setTimeout(() => loadPalette(primaryHex, paletteName), 300);
    return () => window.clearTimeout(timer);
  }, [primaryHex, paletteName, canUseDesignTools]);

  useEffect(() => {
    loadComponent(selectedCompType);
  }, [selectedCompType]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/auth/me`, { credentials: 'include' })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((principal) => {
        if (cancelled) return;
        const allowed =
          principal?.kind === 'human' &&
          (principal?.role === 'admin' || principal?.role === 'developer');
        setCanUseDesignTools(allowed);
        setActiveSubTab(allowed ? 'palette' : 'components');
        setRoleLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setCanUseDesignTools(false);
          setActiveSubTab('components');
          setRoleLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAuditWcag = async () => {
    if (!canUseDesignTools) return;
    setWcagLoading(true);
    setWcagError(null);
    setWcagResult(null);
    try {
      const res = await auditWcagAccessibility(markupInput);
      setWcagResult(res);
    } catch (err: any) {
      setWcagError(err?.message || 'Falha ao auditar acessibilidade.');
    } finally {
      setWcagLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
      {!roleLoaded && (
        <div role="status" className="jarvis-callout jarvis-callout--info">
          A verificar permissões do Design Studio…
        </div>
      )}

      <PageHeader
        title="Design-to-Code & Acessibilidade"
        subtitle="Gerador de tokens visuais, paletas harmônicas, auditor WCAG 2.1 e boilerplates em React/Tailwind."
        icon={<Sparkles size={16} />}
        actions={
          <div className="jarvis-segmented" role="tablist" aria-label="Ferramentas do Design Studio">
            {canUseDesignTools && (
              <button
                type="button"
                role="tab"
                aria-selected={activeSubTab === 'palette'}
                onClick={() => setActiveSubTab('palette')}
                className={`jarvis-segmented-btn ${activeSubTab === 'palette' ? 'is-active' : ''}`}
              >
                Paleta de Cores
              </button>
            )}
            {canUseDesignTools && (
              <button
                type="button"
                role="tab"
                aria-selected={activeSubTab === 'wcag'}
                onClick={() => setActiveSubTab('wcag')}
                className={`jarvis-segmented-btn ${activeSubTab === 'wcag' ? 'is-active' : ''}`}
              >
                Acessibilidade (WCAG)
              </button>
            )}
            <button
              type="button"
              role="tab"
              aria-selected={activeSubTab === 'components'}
              onClick={() => setActiveSubTab('components')}
              className={`jarvis-segmented-btn ${activeSubTab === 'components' ? 'is-active' : ''}`}
            >
              Componentes Prontos
            </button>
          </div>
        }
      />

      {/* ABA 1: PALETA DE CORES */}
      {canUseDesignTools && activeSubTab === 'palette' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div
            className="jarvis-settings-card"
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: '16px',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <label htmlFor="design-hex-input" className="user-profile-field-label">
                Cor Primária
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="color"
                  aria-label="Seletor visual de cor primária"
                  value={primaryHex}
                  onChange={(e) => setPrimaryHex(e.target.value)}
                  className="jarvis-input"
                  style={{ width: '42px', height: '38px', padding: '3px', cursor: 'pointer' }}
                />
                <input
                  id="design-hex-input"
                  type="text"
                  value={primaryHex}
                  onChange={(e) => setPrimaryHex(e.target.value)}
                  className="jarvis-input"
                  style={{ fontFamily: 'var(--font-mono)', width: '112px' }}
                />
              </div>
            </div>

            <div>
              <label htmlFor="design-palette-name" className="user-profile-field-label">
                Nome da Paleta
              </label>
              <input
                id="design-palette-name"
                type="text"
                value={paletteName}
                onChange={(e) => setPaletteName(e.target.value)}
                className="jarvis-input"
                style={{ width: '140px' }}
              />
            </div>

            {paletteLoading && (
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', paddingBottom: '9px' }}>
                Gerando paleta...
              </span>
            )}

            {paletteData && (
              <div style={{ marginLeft: 'auto' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (!navigator.clipboard?.writeText) return;
                    navigator.clipboard
                      .writeText(paletteData.css_variables)
                      .then(() => {
                        setCopiedCss(true);
                        window.setTimeout(() => setCopiedCss(false), 2000);
                      })
                      .catch(() => setPaletteError('Não foi possível copiar as variáveis CSS.'));
                  }}
                  className={`btn btn-sm ${copiedCss ? 'btn-success' : 'btn-primary'}`}
                >
                  {copiedCss ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedCss ? 'Variáveis Copiadas' : 'Copiar Variáveis CSS (:root)'}</span>
                </button>
              </div>
            )}
          </div>

          {paletteError && (
            <div role="alert" className="jarvis-error-banner">
              {paletteError}
            </div>
          )}

          {/* Amostras da Escala 50 a 900 */}
          {paletteData?.shades && typeof paletteData.shades === 'object' && (
            <div className="jarvis-settings-card" style={{ gap: '14px' }}>
              <h3 style={{ fontSize: '0.96rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                Escala Harmônica de Tons (50 a 900)
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))', gap: '10px' }}>
                {Object.entries(paletteData.shades).map(([shade, hexVal]: [string, any]) => (
                  <div
                    key={shade}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      backgroundColor: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ width: '100%', height: '54px', backgroundColor: hexVal }} />
                    <div style={{ padding: '8px 4px', textAlign: 'center' }}>
                      <div className="jarvis-tabular" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {shade}
                      </div>
                      <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                        {hexVal}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ABA 2: AUDITORIA WCAG 2.1 */}
      {canUseDesignTools && activeSubTab === 'wcag' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div className="jarvis-settings-card" style={{ gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <label
                htmlFor="wcag-markup-textarea"
                style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)' }}
              >
                Cole o código HTML ou JSX para Auditoria de Acessibilidade
              </label>
              <button
                type="button"
                onClick={handleAuditWcag}
                disabled={wcagLoading}
                className="btn btn-primary btn-sm"
              >
                <Sparkles size={14} />
                <span>{wcagLoading ? 'Auditando...' : 'Auditar Acessibilidade (WCAG)'}</span>
              </button>
            </div>

            <textarea
              id="wcag-markup-textarea"
              rows={6}
              value={markupInput}
              onChange={(e) => setMarkupInput(e.target.value)}
              className="jarvis-textarea"
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}
            />
          </div>

          {wcagError && (
            <div role="alert" className="jarvis-error-banner">
              {wcagError}
            </div>
          )}

          {wcagResult && (
            <div className="jarvis-settings-card" style={{ gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {wcagResult.score >= 80 ? (
                    <CheckCircle size={20} color="var(--success-color)" />
                  ) : (
                    <AlertTriangle size={20} color="var(--danger-color)" />
                  )}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                      {wcagResult.verdict}
                    </div>
                    <div className="jarvis-tabular" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      Total de não-conformidades: {wcagResult.total_issues}
                    </div>
                  </div>
                </div>

                <span
                  className="jarvis-tabular"
                  style={{
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    color: wcagResult.score >= 80 ? 'var(--success-color)' : 'var(--danger-color)',
                  }}
                >
                  Score WCAG: {wcagResult.score}/100
                </span>
              </div>

              {wcagResult.findings && wcagResult.findings.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {wcagResult.findings.map((f: any, idx: number) => (
                    <div
                      key={idx}
                      className="jarvis-settings-subcard"
                      style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.84rem' }}>
                          Linha {f.line} —{' '}
                          <code style={{ color: 'var(--accent-light)', fontFamily: 'var(--font-mono)' }}>{f.rule}</code>
                        </span>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            color: 'var(--warning-color)',
                          }}
                        >
                          {getSeverityLabel(f.severity)}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{f.description}</div>
                      <code
                        style={{
                          fontSize: '0.75rem',
                          backgroundColor: 'var(--bg-primary)',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          color: 'var(--danger-color)',
                          fontFamily: 'var(--font-mono)',
                          border: '1px solid var(--border-color)',
                          overflowX: 'auto',
                        }}
                      >
                        {f.snippet}
                      </code>
                      <div style={{ fontSize: '0.78rem', color: 'var(--success-color)' }}>
                        Correção: {f.remediation}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ABA 3: COMPONENTES PRONTOS */}
      {activeSubTab === 'components' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div className="jarvis-segmented" role="tablist" aria-label="Tipo de componente pronto">
              {COMPONENT_TEMPLATES.map((comp) => (
                <button
                  key={comp.id}
                  type="button"
                  role="tab"
                  aria-selected={selectedCompType === comp.id}
                  onClick={() => setSelectedCompType(comp.id)}
                  className={`jarvis-segmented-btn ${selectedCompType === comp.id ? 'is-active' : ''}`}
                >
                  {comp.label}
                </button>
              ))}
            </div>

            {componentCode && (
              <button
                type="button"
                onClick={() => {
                  if (!navigator.clipboard?.writeText) return;
                  navigator.clipboard
                    .writeText(componentCode)
                    .then(() => {
                      setCopiedComp(true);
                      window.setTimeout(() => setCopiedComp(false), 2000);
                    })
                    .catch(() => setComponentError('Não foi possível copiar o componente.'));
                }}
                className={`btn btn-sm ${copiedComp ? 'btn-success' : 'btn-secondary'}`}
              >
                {copiedComp ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedComp ? 'Copiado' : 'Copiar Componente'}</span>
              </button>
            )}
          </div>

          {componentLoading && (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Carregando componente...</div>
          )}
          {componentError && (
            <div role="alert" className="jarvis-error-banner">
              {componentError}
            </div>
          )}

          {componentCode && (
            <pre
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '18px 20px',
                fontSize: '0.8rem',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                overflowX: 'auto',
                maxHeight: '420px',
                margin: 0,
              }}
            >
              {componentCode}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
