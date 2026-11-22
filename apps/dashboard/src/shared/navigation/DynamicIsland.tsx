import React, { useState, useEffect } from 'react';
import { Volume2, Cpu, HardDrive, Activity } from 'lucide-react';

interface DynamicIslandProps {
  activeAgentName?: string;
  /** Métricas reais de `GET /api/v1/system/resources`. Ausentes = indisponível. */
  systemStatus?: { cpu?: number | null; memory?: number | null };
  onOpenVoice?: () => void;
  /** 'inline' se integra na topbar sem sobrepor títulos; 'floating' fica discreto na base */
  variant?: 'inline' | 'floating';
}

export const DynamicIsland: React.FC<DynamicIslandProps> = ({
  activeAgentName = 'JARVIS AI Hub',
  systemStatus,
  onOpenVoice,
  variant = 'inline',
}) => {
  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'speaking'>('idle');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'J' || e.key === 'j')) {
        setVoiceState((prev) => (prev === 'listening' ? 'idle' : 'listening'));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const hasCpu = typeof systemStatus?.cpu === 'number';
  const hasMem = typeof systemStatus?.memory === 'number';

  return (
    <button
      type="button"
      className={`openbot-dynamic-island ${variant === 'floating' ? 'openbot-dynamic-island--floating' : ''} ${voiceState !== 'idle' ? 'is-active' : ''}`}
      onClick={onOpenVoice}
      aria-label="Status do sistema e assistente de voz JARVIS"
      title={`${activeAgentName} · Ctrl+Shift+J para voz`}
    >
      {voiceState === 'listening' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="dynamic-island-soundwave">
            <span className="island-bar b1" />
            <span className="island-bar b2" />
            <span className="island-bar b3" />
            <span className="island-bar b4" />
            <span className="island-bar b5" />
          </div>
          <span style={{ fontWeight: 600, color: 'var(--accent-light)' }}>Ouvindo...</span>
        </div>
      ) : voiceState === 'speaking' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Volume2 size={14} color="var(--success-color)" />
          <span style={{ fontWeight: 500, color: 'var(--success-color)' }}>Respondendo</span>
        </div>
      ) : (
        <div className="tabular-nums" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Activity size={13} color="var(--accent-light)" />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)' }}>
            <Cpu size={12} color="var(--text-muted)" />
            <span>{hasCpu ? `${Math.round(systemStatus!.cpu!)}%` : '—'}</span>
          </span>
          <span style={{ color: 'var(--border-hover)' }}>|</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)' }}>
            <HardDrive size={12} color="var(--text-muted)" />
            <span>{hasMem ? `${Math.round(systemStatus!.memory!)}%` : '—'}</span>
          </span>
        </div>
      )}
    </button>
  );
};
