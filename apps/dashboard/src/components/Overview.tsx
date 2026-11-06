import React from 'react';
import { SystemHealth, ApprovalRequestItem } from '../types';
import { ShieldCheck, Cpu, HardDrive, Clock } from 'lucide-react';

interface OverviewProps {
  health: SystemHealth | null;
  approvals: ApprovalRequestItem[];
}

export const Overview: React.FC<OverviewProps> = ({ health, approvals }) => {
  const pendingCount = approvals.filter(a => a.status === 'pending').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Visão Geral do Hub</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
          Estado do notebook, runtime de IA local e integridade de políticas em tempo real.
        </p>
      </div>

      {/* Cards de Métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        <div style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '20px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Estado Global</span>
            <ShieldCheck size={20} color="var(--success-color)" />
          </div>
          <div style={{ marginTop: '12px', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>
              {health?.status === 'healthy' ? 'Operacional' : 'Degradado'}
            </span>
            <span className="badge badge-success">Local-First</span>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '8px', display: 'block' }}>
            Windows 10 • Intel i5 8th Gen • 32GB RAM
          </span>
        </div>

        <div style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '20px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Fila de Inferência</span>
            <Cpu size={20} color="var(--accent-color)" />
          </div>
          <div style={{ marginTop: '12px', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>
              {health?.components.inference_queue.active || 0} Ativa
            </span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              ({health?.components.inference_queue.waiting || 0} em espera)
            </span>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '8px', display: 'block' }}>
            Limite estrito: 1 concorrência (proteção de CPU)
          </span>
        </div>

        <div style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '20px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Aprovações Pendentes</span>
            <Clock size={20} color={pendingCount > 0 ? 'var(--warning-color)' : 'var(--text-secondary)'} />
          </div>
          <div style={{ marginTop: '12px', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>{pendingCount}</span>
            {pendingCount > 0 && <span className="badge badge-warning">Ação Necessária</span>}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '8px', display: 'block' }}>
            Operações críticas pausadas aguardando humano
          </span>
        </div>

        <div style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '20px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Segurança & Políticas</span>
            <HardDrive size={20} color="var(--success-color)" />
          </div>
          <div style={{ marginTop: '12px', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>Ativo</span>
            <span className="badge badge-info">Zero Bypass</span>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '8px', display: 'block' }}>
            Path Traversal Guard • Redaction • Kill Switch
          </span>
        </div>
      </div>

      {/* Modelos Disponíveis */}
      <div style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        padding: '24px',
      }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '16px' }}>
          Runtime de IA Local (Ollama)
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            backgroundColor: 'var(--bg-tertiary)',
            borderRadius: '8px',
          }}>
            <div>
              <span style={{ fontWeight: 600 }}>llama3.2:3b</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: '12px' }}>
                2.0 GB • Q4_K_M • Benchmark medido: 10.3 t/s na CPU
              </span>
            </div>
            <span className="badge badge-success">Padrão Master & Triagem</span>
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            backgroundColor: 'var(--bg-tertiary)',
            borderRadius: '8px',
          }}>
            <div>
              <span style={{ fontWeight: 600 }}>qwen2.5-coder:7b</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: '12px' }}>
                4.7 GB • Q4_K_M • Coder & Code Reviewer
              </span>
            </div>
            <span className="badge badge-info">Sob Demanda (Código)</span>
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            backgroundColor: 'var(--bg-tertiary)',
            borderRadius: '8px',
          }}>
            <div>
              <span style={{ fontWeight: 600 }}>qwen2.5:7b</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: '12px' }}>
                4.7 GB • Q4_K_M • Raciocínio & Modelagem de Ameaças
              </span>
            </div>
            <span className="badge badge-info">Sob Demanda (Segurança/BI)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
