import React, { useState, useEffect, useMemo } from 'react';
import {
  Cpu,
  HardDrive,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import { fetchResources } from '../../services/api/system';

interface DailyUsagePoint {
  day: string;
  cost: number;
  tokens: number;
}

export const UsageAnalyticsView: React.FC = () => {
  const [selectedAgent, setSelectedAgent] = useState('Todos os agentes');
  const [selectedMetric, setSelectedMetric] = useState('Custo');
  const [selectedPeriod, setSelectedPeriod] = useState('30 dias');
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const [metricDropdownOpen, setMetricDropdownOpen] = useState(false);
  const [periodDropdownOpen, setPeriodDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cpuUsage, setCpuUsage] = useState(31);
  const [ramUsage, setRamUsage] = useState(33);
  const [expandedProvider, setExpandedProvider] = useState<string | null>('opencode');

  // Consulta métricas reais de hardware
  const loadHardwareMetrics = async () => {
    setLoading(true);
    try {
      const resources = await fetchResources();
      if (typeof resources.cpu_percent === 'number') setCpuUsage(Math.round(resources.cpu_percent));
      if (typeof resources.ram_percent === 'number') setRamUsage(Math.round(resources.ram_percent));
    } catch (e) {
      console.warn('Falha ao obter telemetria de hardware:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHardwareMetrics();
    const interval = setInterval(loadHardwareMetrics, 30000);
    return () => clearInterval(interval);
  }, []);

  // Dados dos 30 dias para a curva suave SVG
  const chartData: DailyUsagePoint[] = useMemo(() => {
    const points: DailyUsagePoint[] = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayLabel = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
      // Curva simulada com pico nos últimos 3 dias
      const cost = i < 3 ? (3 - i) * 0.04 : 0.0;
      const tokens = i < 3 ? (3 - i) * 4200 : 150;
      points.push({ day: dayLabel, cost, tokens });
    }
    return points;
  }, []);

  // Provedores Conectados & Detalhamento
  const providers = [
    {
      id: 'opencode',
      name: 'OpenCode CLI',
      icon: '💻',
      tokens: '12,42 mil',
      cost: 'US$ 0,00',
      type: 'Local Engine / CLI',
      subtext: 'qwen2.5-coder:7b integrado localmente',
      details: {
        cacheReads: '12,42 mil',
        cachedInput: '0',
        uncachedInput: '11,92 mil',
        output: '499 tokens',
      },
    },
    {
      id: 'ollama',
      name: 'Ollama Local Daemon',
      icon: '🤖',
      tokens: '48,15 mil',
      cost: 'US$ 0,00',
      type: 'Inference Local (GPU/CPU)',
      subtext: 'Zero custos de API externa',
      details: {
        cacheReads: '48,15 mil',
        cachedInput: '8,20 mil',
        uncachedInput: '39,95 mil',
        output: '2,10 mil tokens',
      },
    },
    {
      id: 'cloud_models',
      name: 'Provedores de Nuvem (Anthropic / OpenAI)',
      icon: '☁️',
      tokens: '0 tokens',
      cost: 'US$ 0,00',
      type: 'Nuvem sob demanda',
      subtext: 'Nenhuma chamada externa tarifada neste período',
      details: {
        cacheReads: '0',
        cachedInput: '0',
        uncachedInput: '0',
        output: '0',
      },
    },
  ];

  return (
    <div
      style={{
        maxWidth: '920px',
        margin: '0 auto',
        padding: '24px 20px 48px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        color: '#f4f4f5',
      }}
    >
      {/* Top Header com Estilo OpenBot */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <button
              type="button"
              onClick={() => window.history.back()}
              className="btn btn-ghost"
              style={{ padding: '4px 6px', color: '#9ca3af' }}
              title="Voltar"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => window.history.forward()}
              className="btn btn-ghost"
              style={{ padding: '4px 6px', color: '#9ca3af' }}
              title="Avançar"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div>
            <h1 className="claude-serif-title" style={{ fontSize: '1.45rem', fontWeight: 600, margin: 0, color: '#f5f5f5' }}>
              Uso e Custos
            </h1>
            <p style={{ fontSize: '0.80rem', color: '#888888', marginTop: '2px' }}>
              Telemetria de tokens de contexto, custos de API e métricas de hardware da máquina local.
            </p>
          </div>
        </div>

        {/* Barra de Filtros e Status do Hardware (Estilo OpenBot Image 5) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Pílula CPU */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '5px 10px',
              borderRadius: '999px',
              fontSize: '12px',
              color: '#d4d4d4',
            }}
          >
            <Cpu size={14} color="#38bdf8" />
            <span style={{ fontWeight: 600 }}>{cpuUsage}%</span>
            <span style={{ color: '#71717a' }}>CPU</span>
          </div>

          {/* Pílula RAM */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '5px 10px',
              borderRadius: '999px',
              fontSize: '12px',
              color: '#d4d4d4',
            }}
          >
            <HardDrive size={14} color="#c084fc" />
            <span style={{ fontWeight: 600 }}>{ramUsage}%</span>
            <span style={{ color: '#71717a' }}>RAM</span>
          </div>

          {/* Dropdown Filtro Agentes */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
              className="btn btn-ghost"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                color: '#d4d4d4',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                padding: '5px 12px',
                borderRadius: '999px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <span>{selectedAgent}</span>
              <ChevronDown size={12} color="#71717a" />
            </button>

            {agentDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '36px',
                  right: 0,
                  width: '180px',
                  backgroundColor: '#18181b',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '10px',
                  padding: '4px',
                  zIndex: 50,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                }}
              >
                {['Todos os agentes', 'Telegram Orchestrator', 'QA Tester', 'Copy Editor', 'Bug Fixer', 'Security Auditor'].map((ag) => (
                  <button
                    key={ag}
                    type="button"
                    onClick={() => {
                      setSelectedAgent(ag);
                      setAgentDropdownOpen(false);
                    }}
                    className="btn btn-ghost"
                    style={{ width: '100%', justifyContent: 'flex-start', padding: '6px 10px', fontSize: '12px' }}
                  >
                    {ag}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Dropdown Métrica */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setMetricDropdownOpen(!metricDropdownOpen)}
              className="btn btn-ghost"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                color: '#d4d4d4',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                padding: '5px 12px',
                borderRadius: '999px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <span>{selectedMetric}</span>
              <ChevronDown size={12} color="#71717a" />
            </button>

            {metricDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '36px',
                  right: 0,
                  width: '140px',
                  backgroundColor: '#18181b',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '10px',
                  padding: '4px',
                  zIndex: 50,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                }}
              >
                {['Custo', 'Tokens', 'Latência'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setSelectedMetric(m);
                      setMetricDropdownOpen(false);
                    }}
                    className="btn btn-ghost"
                    style={{ width: '100%', justifyContent: 'flex-start', padding: '6px 10px', fontSize: '12px' }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Dropdown Período */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setPeriodDropdownOpen(!periodDropdownOpen)}
              className="btn btn-ghost"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                color: '#d4d4d4',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                padding: '5px 12px',
                borderRadius: '999px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <span>{selectedPeriod}</span>
              <ChevronDown size={12} color="#71717a" />
            </button>

            {periodDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '36px',
                  right: 0,
                  width: '140px',
                  backgroundColor: '#18181b',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '10px',
                  padding: '4px',
                  zIndex: 50,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                }}
              >
                {['7 dias', '30 dias', '90 dias', 'Este ano'].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setSelectedPeriod(p);
                      setPeriodDropdownOpen(false);
                    }}
                    className="btn btn-ghost"
                    style={{ width: '100%', justifyContent: 'flex-start', padding: '6px 10px', fontSize: '12px' }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Botão de Atualizar */}
          <button
            type="button"
            onClick={loadHardwareMetrics}
            disabled={loading}
            className="btn btn-ghost"
            style={{
              padding: '6px',
              borderRadius: '50%',
              color: '#a1a1aa',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
            }}
            title="Atualizar telemetria"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Métrica Principal (US$ 0,00 · 2 sessões · Estimativa de API · USD) */}
      <div style={{ marginTop: '8px' }}>
        <div style={{ fontSize: '2.5rem', fontWeight: 600, color: '#f5f5f5', letterSpacing: '-0.03em' }}>
          US$ 0,00
        </div>
        <div style={{ fontSize: '13px', color: '#71717a', marginTop: '2px' }}>
          2 sessões · Estimativa de API · USD
        </div>
      </div>

      {/* Gráfico Temporal Interativo dos 30 dias (SVG Curva Suave) */}
      <div
        style={{
          width: '100%',
          height: '180px',
          position: 'relative',
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <svg
          style={{ width: '100%', height: '110px', overflow: 'visible' }}
          viewBox="0 0 800 100"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="usageGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Linhas de Grade de Fundo */}
          <line x1="0" y1="20" x2="800" y2="20" stroke="rgba(255,255,255,0.04)" strokeDasharray="4 4" />
          <line x1="0" y1="60" x2="800" y2="60" stroke="rgba(255,255,255,0.04)" strokeDasharray="4 4" />
          <line x1="0" y1="95" x2="800" y2="95" stroke="rgba(255,255,255,0.08)" />

          {/* Área com Gradiente */}
          <path
            d="M 0 95 L 0 95 C 200 95, 400 95, 600 95 C 650 95, 700 80, 750 40 L 800 30 L 800 95 Z"
            fill="url(#usageGradient)"
          />

          {/* Curva Suave Principal */}
          <path
            d="M 0 95 C 200 95, 400 95, 600 95 C 650 95, 700 80, 750 40 L 800 30"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2.5"
          />

          {/* Ponto Final Ativo */}
          <circle cx="800" cy="30" r="4.5" fill="#38bdf8" stroke="#0c0c0e" strokeWidth="2" />
        </svg>

        {/* Eixo de Datas Inferior */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#52525b', padding: '0 4px' }}>
          <span>{chartData[0]?.day}</span>
          <span>{chartData[10]?.day}</span>
          <span>{chartData[20]?.day}</span>
          <span>Hoje</span>
        </div>
      </div>

      {/* Detalhamento Expansível de Provedores */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#a1a1aa', marginBottom: '4px' }}>
          Detalhamento por Provedor
        </div>

        {providers.map((p) => {
          const isExpanded = expandedProvider === p.id;

          return (
            <div
              key={p.id}
              style={{
                backgroundColor: '#141417',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                overflow: 'hidden',
                transition: 'all 0.2s ease',
              }}
            >
              <div
                onClick={() => setExpandedProvider(isExpanded ? null : p.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <ChevronRight
                    size={14}
                    color="#71717a"
                    style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}
                  />
                  <span style={{ fontSize: '15px' }}>{p.icon}</span>
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#f4f4f5' }}>{p.name}</span>
                    <span style={{ fontSize: '12px', color: '#71717a', marginLeft: '8px' }}>({p.tokens})</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <span style={{ fontSize: '13px', color: '#a1a1aa' }}>{p.cost}</span>
                  <span style={{ fontSize: '11px', color: '#34d399', backgroundColor: 'rgba(52, 211, 153, 0.12)', padding: '2px 8px', borderRadius: '999px' }}>
                    {p.type}
                  </span>
                </div>
              </div>

              {isExpanded && (
                <div
                  style={{
                    padding: '12px 20px 16px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                    backgroundColor: 'rgba(0, 0, 0, 0.2)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <p style={{ margin: 0, fontSize: '12px', color: '#71717a' }}>{p.subtext}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginTop: '4px' }}>
                    <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: '8px 12px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '11px', color: '#71717a' }}>Leituras de cache</div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#e4e4e7', marginTop: '2px' }}>{p.details.cacheReads}</div>
                    </div>
                    <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: '8px 12px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '11px', color: '#71717a' }}>Entrada em cache</div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#e4e4e7', marginTop: '2px' }}>{p.details.cachedInput}</div>
                    </div>
                    <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: '8px 12px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '11px', color: '#71717a' }}>Entrada sem cache</div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#e4e4e7', marginTop: '2px' }}>{p.details.uncachedInput}</div>
                    </div>
                    <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: '8px 12px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '11px', color: '#71717a' }}>Saída gerada</div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#e4e4e7', marginTop: '2px' }}>{p.details.output}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Grid de Totais de Tokens (Estilo OpenBot Image 5) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#a1a1aa' }}>
          Totais de Tokens (Últimos 30 dias)
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '12px',
          }}
        >
          <div
            style={{
              backgroundColor: '#141417',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '14px',
            }}
          >
            <div style={{ fontSize: '11px', color: '#71717a', lineHeight: 1.3 }}>Tokens sem leitura de cache</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f4f4f5', marginTop: '6px' }}>12,42 mil</div>
          </div>

          <div
            style={{
              backgroundColor: '#141417',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '14px',
            }}
          >
            <div style={{ fontSize: '11px', color: '#71717a', lineHeight: 1.3 }}>Tokens com leituras de cache</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f4f4f5', marginTop: '6px' }}>12,42 mil</div>
          </div>

          <div
            style={{
              backgroundColor: '#141417',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '14px',
            }}
          >
            <div style={{ fontSize: '11px', color: '#71717a', lineHeight: 1.3 }}>Entrada em cache</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f4f4f5', marginTop: '6px' }}>0</div>
          </div>

          <div
            style={{
              backgroundColor: '#141417',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '14px',
            }}
          >
            <div style={{ fontSize: '11px', color: '#71717a', lineHeight: 1.3 }}>Entrada sem cache</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f4f4f5', marginTop: '6px' }}>11,92 mil</div>
          </div>

          <div
            style={{
              backgroundColor: '#141417',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '14px',
            }}
          >
            <div style={{ fontSize: '11px', color: '#71717a', lineHeight: 1.3 }}>Saída gerada</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#f4f4f5', marginTop: '6px' }}>499 tokens</div>
          </div>
        </div>
      </div>
    </div>
  );
};
