import React from 'react';
import { Cpu, HardDrive, Monitor, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface HardwareSpecsCardsProps {
  cpu: any;
  ram: any;
  gpu: any;
}

export const HardwareSpecsCards: React.FC<HardwareSpecsCardsProps> = ({ cpu, ram, gpu }) => {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '12px' }}>
      {/* CPU */}
      <section className="jarvis-settings-card" style={{ gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Cpu size={17} color="var(--accent-light)" />
            <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Processador (CPU)
            </span>
          </div>
          <span
            className="jarvis-tabular"
            style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--accent-light)', fontFamily: 'var(--font-mono)' }}
          >
            {cpu.logical_cores || 8} threads
          </span>
        </div>

        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          {cpu.name || 'Intel Core'}
        </div>

        <div className="jarvis-tabular" style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
          {cpu.physical_cores} núcleos físicos · {cpu.logical_cores} threads ·{' '}
          {cpu.max_clock_mhz ? `${(cpu.max_clock_mhz / 1000).toFixed(1)} GHz` : 'Multithread'}
        </div>

        <div>
          <div
            className="jarvis-tabular"
            style={{ marginBottom: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}
          >
            <span style={{ color: 'var(--text-muted)' }}>Carga instantânea</span>
            <span style={{ fontWeight: 600, color: 'var(--accent-light)', fontFamily: 'var(--font-mono)' }}>
              {cpu.current_load_percent}%
            </span>
          </div>
          <div
            style={{
              height: '6px',
              borderRadius: 99,
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-subtle)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.min(100, cpu.current_load_percent || 10)}%`,
                height: '100%',
                backgroundColor: 'var(--accent-color)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      </section>

      {/* Memória RAM */}
      <section className="jarvis-settings-card" style={{ gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <HardDrive size={17} color="#4ade80" />
            <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Memória RAM
            </span>
          </div>
          <span
            className="jarvis-tabular"
            style={{ fontSize: '0.74rem', fontWeight: 600, color: '#4ade80', fontFamily: 'var(--font-mono)' }}
          >
            {ram.total_gb} GB total
          </span>
        </div>

        <div
          className="jarvis-tabular"
          style={{ fontSize: '1.18rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
        >
          {ram.available_gb} GB livres
        </div>

        <div className="jarvis-tabular" style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
          {ram.used_gb} GB em uso ({ram.percent}% ocupado)
        </div>

        <div>
          <div style={{ marginBottom: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', gap: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>Capacidade de carga</span>
            <span style={{ fontWeight: 600, color: '#4ade80' }}>Suficiente para múltiplos LLMs</span>
          </div>
          <div
            style={{
              height: '6px',
              borderRadius: 99,
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-subtle)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${ram.percent || 30}%`,
                height: '100%',
                backgroundColor: '#4ade80',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      </section>

      {/* Placa de Vídeo (GPU) */}
      <section className="jarvis-settings-card" style={{ gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Monitor size={17} color="#fbbf24" />
            <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Acelerador Gráfico (GPU)
            </span>
          </div>
          <span style={{ fontSize: '0.74rem', fontWeight: 600, color: gpu.has_dedicated_gpu ? '#4ade80' : '#fbbf24' }}>
            {gpu.has_dedicated_gpu ? 'GPU Dedicada' : 'Integrados'}
          </span>
        </div>

        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          {gpu.primary_name || 'Intel UHD Graphics'}
        </div>

        <div style={{ fontSize: '0.78rem', lineHeight: 1.5, marginTop: 'auto' }}>
          {gpu.is_cpu_only_inference ? (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', color: '#fbbf24' }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>
                Sem GPU dedicada NVIDIA CUDA. A inferência é calculada na CPU via AVX2. Modelos 3B são os mais recomendados.
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', color: '#4ade80' }}>
              <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>Aceleração por GPU disponível para modelos locais pesados.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
