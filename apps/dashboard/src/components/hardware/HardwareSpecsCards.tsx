import React from 'react';
import { Cpu, HardDrive, Monitor } from 'lucide-react';

interface HardwareSpecsCardsProps {
  cpu: any;
  ram: any;
  gpu: any;
}

export const HardwareSpecsCards: React.FC<HardwareSpecsCardsProps> = ({ cpu, ram, gpu }) => {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '16px' }}>
      {/* CPU */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Cpu size={20} color="#38bdf8" />
            <span style={{ fontSize: '0.90rem', fontWeight: 600 }}>Processador (CPU)</span>
          </div>
          <span className="badge badge-info">{cpu.logical_cores || 8} Threads</span>
        </div>
        <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
          {cpu.name || 'Intel Core'}
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
          {cpu.physical_cores} Núcleos Físicos | {cpu.logical_cores} Threads | {cpu.max_clock_mhz ? `${(cpu.max_clock_mhz / 1000).toFixed(1)} GHz` : 'Multithread'}
        </div>
        <div style={{ marginBottom: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>Carga Instantânea</span>
          <span style={{ fontWeight: 600, color: '#38bdf8' }}>{cpu.current_load_percent}%</span>
        </div>
        <div style={{ height: '6px', borderRadius: '3px', backgroundColor: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, cpu.current_load_percent || 10)}%`, height: '100%', backgroundColor: '#38bdf8', transition: 'width 0.3s' }} />
        </div>
      </div>

      {/* Memória RAM */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <HardDrive size={20} color="#34d399" />
            <span style={{ fontSize: '0.90rem', fontWeight: 600 }}>Memória RAM</span>
          </div>
          <span className="badge badge-success">{ram.total_gb} GB Total</span>
        </div>
        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
          {ram.available_gb} GB Livres
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
          {ram.used_gb} GB em uso ({ram.percent}% ocupado)
        </div>
        <div style={{ marginBottom: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>Capacidade de Carga</span>
          <span style={{ fontWeight: 600, color: '#34d399' }}>Suficiente para múltiplos LLMs</span>
        </div>
        <div style={{ height: '6px', borderRadius: '3px', backgroundColor: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
          <div style={{ width: `${ram.percent || 30}%`, height: '100%', backgroundColor: '#34d399', transition: 'width 0.3s' }} />
        </div>
      </div>

      {/* Placa de Vídeo (GPU) */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Monitor size={20} color="#fbbf24" />
            <span style={{ fontSize: '0.90rem', fontWeight: 600 }}>Acelerador Gráfico (GPU)</span>
          </div>
          <span className="badge badge-warning">
            {gpu.has_dedicated_gpu ? 'GPU Dedicada' : 'Gráficos Integrados'}
          </span>
        </div>
        <div style={{ fontSize: '0.92rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
          {gpu.primary_name || 'Intel UHD Graphics'}
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4, marginTop: '8px' }}>
          {gpu.is_cpu_only_inference ? (
            <span style={{ color: '#fbbf24' }}>
              ⚠️ Sem GPU dedicada NVIDIA CUDA. A inferência é calculada na CPU via AVX2. Modelos 3B são os mais recomendados.
            </span>
          ) : (
            <span style={{ color: '#34d399' }}>
              ✓ Aceleração por GPU disponível para modelos locais pesados.
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
