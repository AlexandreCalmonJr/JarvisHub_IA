import React, { useState, useEffect } from 'react';
import {
  extractColorPalette,
  auditWcagAccessibility,
  fetchComponentBoilerplate,
} from '../api';
import {
  CheckCircle,
  AlertTriangle,
  Copy,
  Check,
  Sparkles,
} from 'lucide-react';

export const DesignStudioView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'palette' | 'wcag' | 'components'>('palette');

  // Paleta de Cores
  const [primaryHex, setPrimaryHex] = useState('#d97757');
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
    const timer = window.setTimeout(() => loadPalette(primaryHex, paletteName), 300);
    return () => window.clearTimeout(timer);
  }, [primaryHex, paletteName]);

  useEffect(() => {
    loadComponent(selectedCompType);
  }, [selectedCompType]);

  const handleAuditWcag = async () => {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2
            className="claude-serif-title"
            style={{
              fontSize: '1.6rem',
              fontWeight: 500,
              margin: 0,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
            }}
          >
            Design-to-Code & Acessibilidade
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
            Gerador de tokens visuais, paletas harmônicas, auditor WCAG 2.1 e boilerplates em React/Tailwind.
          </p>
        </div>

        {/* Sub-abas em Pílulas */}
        <div style={{ display: 'flex', gap: '6px', backgroundColor: 'var(--bg-tertiary)', padding: '4px', borderRadius: '9999px', border: '1px solid var(--border-color)' }}>
          <button
            onClick={() => setActiveSubTab('palette')}
            className={`btn ${activeSubTab === 'palette' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.82rem', padding: '6px 16px', borderRadius: '9999px' }}
          >
            Paleta de Cores
          </button>
          <button
            onClick={() => setActiveSubTab('wcag')}
            className={`btn ${activeSubTab === 'wcag' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.82rem', padding: '6px 16px', borderRadius: '9999px' }}
          >
            Acessibilidade (WCAG)
          </button>
          <button
            onClick={() => setActiveSubTab('components')}
            className={`btn ${activeSubTab === 'components' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: '0.82rem', padding: '6px 16px', borderRadius: '9999px' }}
          >
            Componentes Prontos
          </button>
        </div>
      </div>

      {/* ABA 1: PALETA DE CORES */}
      {activeSubTab === 'palette' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Seletor de Cor Primária */}
          <div
            className="glass-card"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: '14px',
              padding: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="color"
                value={primaryHex}
                onChange={(e) => {
                  setPrimaryHex(e.target.value);
                }}
                style={{ width: '42px', height: '42px', borderRadius: '8px', border: 'none', cursor: 'pointer', backgroundColor: 'transparent' }}
              />
              <input
                type="text"
                value={primaryHex}
                onChange={(e) => {
                  setPrimaryHex(e.target.value);
                }}
                style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 12px', fontSize: '0.85rem', fontFamily: 'var(--font-mono)', width: '100px' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Nome da Paleta:</label>
              <input
                type="text"
                value={paletteName}
                onChange={(e) => {
                  setPaletteName(e.target.value);
                }}
                style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 12px', fontSize: '0.85rem', width: '120px' }}
              />
            </div>

            {paletteLoading && <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Gerando paleta...</span>}
            {paletteError && <div role="alert" style={{ color: '#f87171', fontSize: '0.82rem' }}>{paletteError}</div>}
            {paletteData && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(paletteData.css_variables);
                  setCopiedCss(true);
                  setTimeout(() => setCopiedCss(false), 2000);
                }}
                className="btn btn-primary"
                style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', borderRadius: '8px' }}
              >
                {copiedCss ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
                Copiar Variáveis CSS (:root)
              </button>
            )}
          </div>

          {/* Amostras da Escala 50 a 900 */}
          {paletteData && (
            <div
              className="glass-card"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '14px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              <h3 className="claude-serif-title" style={{ fontSize: '1.15rem', fontWeight: 500, margin: 0 }}>
                Escala Harmônica de Tons (50 a 900)
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: '10px' }}>
                {Object.entries(paletteData.shades).map(([shade, hexVal]: [string, any]) => (
                  <div
                    key={shade}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <div style={{ width: '100%', height: '54px', backgroundColor: hexVal }} />
                    <div style={{ padding: '8px 4px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>{shade}</div>
                      <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{hexVal}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ABA 2: AUDITORIA WCAG 2.1 */}
      {activeSubTab === 'wcag' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div
            className="glass-card"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: '14px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="claude-serif-title" style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                Cole o código HTML ou JSX para Auditoria de Acessibilidade
              </label>
              <button
                onClick={handleAuditWcag}
                disabled={wcagLoading}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', borderRadius: '8px' }}
              >
                <Sparkles size={14} />
                {wcagLoading ? 'Auditando...' : 'Auditar Acessibilidade (WCAG)'}
              </button>
            </div>

            <textarea
              rows={6}
              value={markupInput}
              onChange={(e) => setMarkupInput(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '12px',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.82rem',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          {wcagError && <div role="alert" style={{ color: '#f87171', fontSize: '0.82rem' }}>{wcagError}</div>}

          {/* Resultado WCAG */}
          {wcagResult && (
            <div
              className="glass-card"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '14px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {wcagResult.score >= 80 ? <CheckCircle size={22} color="#34d399" /> : <AlertTriangle size={22} color="#f87171" />}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{wcagResult.verdict}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      Total de Não-Conformidades: {wcagResult.total_issues}
                    </div>
                  </div>
                </div>

                <span className={`badge ${wcagResult.score >= 80 ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.85rem' }}>
                  Score WCAG: {wcagResult.score}/100
                </span>
              </div>

              {/* Lista de Não Conformidades */}
              {wcagResult.findings && wcagResult.findings.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                  {wcagResult.findings.map((f: any, idx: number) => (
                    <div
                      key={idx}
                      style={{
                        padding: '12px 14px',
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                          Linha {f.line} — <code style={{ color: 'var(--accent-color)' }}>{f.rule}</code>
                        </span>
                        <span className="badge badge-warning">{f.severity}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{f.description}</div>
                      <code style={{ fontSize: '0.75rem', backgroundColor: '#161514', padding: '6px 8px', borderRadius: '4px', color: '#fca5a5', fontFamily: 'var(--font-mono)', border: '1px solid var(--border-color)' }}>
                        {f.snippet}
                      </code>
                      <div style={{ fontSize: '0.78rem', color: '#34d399' }}>Correção: {f.remediation}</div>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {[
              { id: 'navbar', label: 'Barra de Navegação' },
              { id: 'feature_card', label: 'Card de Recursos' },
              { id: 'stats_grid', label: 'Grid de Estatísticas' },
            ].map((comp) => (
              <button
                key={comp.id}
                onClick={() => {
                  setSelectedCompType(comp.id);

                }}
                className={`btn ${selectedCompType === comp.id ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '0.82rem', borderRadius: '8px' }}
              >
                {comp.label}
              </button>
            ))}
            {componentCode && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(componentCode);
                  setCopiedComp(true);
                  setTimeout(() => setCopiedComp(false), 2000);
                }}
                className="btn btn-ghost"
                style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}
              >
                {copiedComp ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
                Copiar Componente
              </button>
            )}
          </div>
          {componentLoading && <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Carregando componente...</div>}
          {componentError && <div role="alert" style={{ color: '#f87171', fontSize: '0.82rem' }}>{componentError}</div>}

          {componentCode && (
            <pre
              style={{
                backgroundColor: '#161514',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '20px',
                fontSize: '0.82rem',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                overflowX: 'auto',
                maxHeight: '400px',
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
