import React from 'react';
import { SystemHealth, ApprovalRequestItem } from '../types';

interface OverviewProps {
  health: SystemHealth | null;
  approvals: ApprovalRequestItem[];
}

export const Overview: React.FC<OverviewProps> = ({ health, approvals }) => {
  const pendingCount = approvals.filter((a) => a.status === 'pending').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', maxWidth: '1280px', margin: '0 auto' }}>
      {/* Editorial Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 className="claude-serif-title" style={{ fontSize: '1.6rem', fontWeight: 500, letterSpacing: '-0.02em', margin: 0 }}>
            Visão Geral
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '3px' }}>
            Telemetria de hardware local e status do sistema em tempo real
          </p>
        </div>

        <div className="claude-pill-badge">
          <span>Sistema Confinado · 127.0.0.1</span>
        </div>
      </div>

      {/* Grid de Cards de Métricas Principais */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
          gap: '16px',
        }}
      >
        <div className="glass-card" style={{ padding: '20px', borderRadius: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.80rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Estado Global</span>
          </div>
          <div style={{ marginTop: '12px', display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {health?.status === 'healthy' ? 'Operacional' : 'Degradado'}
            </span>
            <span className="badge" style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)', color: 'var(--text-secondary)' }}>Local-First</span>
          </div>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '8px', display: 'block' }}>
            Windows 10 • Intel i5 • 32GB RAM
          </span>
        </div>

        <div className="glass-card" style={{ padding: '20px', borderRadius: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.80rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Fila de Inferência</span>
          </div>
          <div style={{ marginTop: '12px', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '1.4rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {health?.components.inference_queue.active || 0} Ativa
            </span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.80rem' }}>
              ({health?.components.inference_queue.waiting || 0} em espera)
            </span>
          </div>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '8px', display: 'block' }}>
            Controle de saturação de CPU local
          </span>
        </div>

        <div className="glass-card" style={{ padding: '20px', borderRadius: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.80rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Aprovações Pendentes</span>
          </div>
          <div style={{ marginTop: '12px', display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem', fontWeight: 600, color: 'var(--text-primary)' }}>{pendingCount}</span>
            {pendingCount > 0 && <span className="badge badge-warning">Ação Necessária</span>}
          </div>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '8px', display: 'block' }}>
            Operações críticas pausadas aguardando humano
          </span>
        </div>

        <div className="glass-card" style={{ padding: '20px', borderRadius: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.80rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Segurança & Políticas</span>
          </div>
          <div style={{ marginTop: '12px', display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem', fontWeight: 600, color: 'var(--text-primary)' }}>Ativo</span>
            <span className="badge" style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)', color: 'var(--text-secondary)' }}>Zero Bypass</span>
          </div>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '8px', display: 'block' }}>
            Auditoria HMAC e Sandbox habilitados
          </span>
        </div>
      </div>

      {/* Painel Informativo sobre o Monólito e Agentes */}
      <div
        className="glass-panel"
        style={{
          padding: '24px',
          borderRadius: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div>
          <h3 className="claude-serif-title" style={{ fontSize: '1.15rem', fontWeight: 500, margin: 0 }}>
            Capacidades do JARVIS Agent Studio
          </h3>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
            gap: '16px',
          }}
        >
          <div
            style={{
              padding: '16px 18px',
              borderRadius: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border-color)',
            }}
          >
            <div style={{ marginBottom: '6px' }}>
              <strong style={{ fontSize: '0.86rem', color: 'var(--text-primary)' }}>26 Especialistas em Cadeia</strong>
            </div>
            <p style={{ fontSize: '0.80rem', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
              Delegação multi-agente automática (Dev + Arquiteto + QA + Segurança) com geração de pareceres e contratos formais.
            </p>
          </div>

          <div
            style={{
              padding: '16px 18px',
              borderRadius: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border-color)',
            }}
          >
            <div style={{ marginBottom: '6px' }}>
              <strong style={{ fontSize: '0.86rem', color: 'var(--text-primary)' }}>Live Artifact Canvas</strong>
            </div>
            <p style={{ fontSize: '0.80rem', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
              Preview web em tempo real (HTML/CSS), inspeção de diff com realce de sintaxe e alternância Wireframe vs High-Fidelity.
            </p>
          </div>

          <div
            style={{
              padding: '16px 18px',
              borderRadius: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border-color)',
            }}
          >
            <div style={{ marginBottom: '6px' }}>
              <strong style={{ fontSize: '0.86rem', color: 'var(--text-primary)' }}>Memória Persistente & Skills</strong>
            </div>
            <p style={{ fontSize: '0.80rem', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
              Regras do usuário e decisões de arquitetura persistidas em SQLite e injetadas ativamente em cada prompt.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
