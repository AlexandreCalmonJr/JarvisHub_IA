import React, { useState, useEffect } from 'react';
import { Volume2, Cpu, HardDrive } from 'lucide-react';

interface DynamicIslandProps {
  activeAgentName?: string;
  /** Métricas reais de `GET /api/v1/system/resources`. Ausentes = indisponível. */
  systemStatus?: { cpu?: number | null; memory?: number | null };
  onOpenVoice?: () => void;
}

export const DynamicIsland: React.FC<DynamicIslandProps> = ({
  activeAgentName = 'JARVIS AI Hub',
  systemStatus,
  onOpenVoice,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'speaking'>('idle');
  const [greetingDismissed, setGreetingDismissed] = useState(false);

  // Escuta atalhos de voz e eventos globais
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'J' || e.key === 'j')) {
        setVoiceState((prev) => (prev === 'listening' ? 'idle' : 'listening'));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Timer para recolher saudação inicial
  useEffect(() => {
    const timer = setTimeout(() => setGreetingDismissed(true), 6000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <aside
      className={`openbot-dynamic-island ${isExpanded ? 'is-expanded' : ''} ${voiceState !== 'idle' ? 'is-active' : ''}`}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
      onClick={onOpenVoice}
      aria-label="JARVIS Dynamic Island"
      style={{
        position: 'fixed',
        top: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        backgroundColor: '#050507',
        color: '#f4f4f5',
        borderBottomLeftRadius: '20px',
        borderBottomRightRadius: '20px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderTop: 'none',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.7), 0 0 14px rgba(168, 85, 247, 0.15)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: isExpanded ? '8px 20px 10px' : '6px 16px 8px',
        cursor: 'pointer',
        transition: 'all 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        userSelect: 'none',
      }}
    >
      {/* Bot Icon Avatar Lilás com Olhos (Estilo OpenBot) */}
      <div
        style={{
          width: '24px',
          height: '24px',
          borderRadius: '8px',
          backgroundColor: '#c084fc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(192, 132, 252, 0.4)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
          <span style={{ width: '3px', height: '3px', borderRadius: '50%', backgroundColor: '#1e1b4b' }} />
          <span style={{ width: '3px', height: '3px', borderRadius: '50%', backgroundColor: '#1e1b4b' }} />
        </div>
      </div>

      {/* Conteúdo Dinâmico Central */}
      {voiceState === 'listening' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="dynamic-island-soundwave">
            <span className="island-bar b1" />
            <span className="island-bar b2" />
            <span className="island-bar b3" />
            <span className="island-bar b4" />
            <span className="island-bar b5" />
          </div>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#38bdf8' }}>Ouvindo...</span>
        </div>
      ) : voiceState === 'speaking' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Volume2 size={15} color="#10b981" />
          <span style={{ fontSize: '13px', fontWeight: 500, color: '#10b981' }}>JARVIS respondendo</span>
        </div>
      ) : isExpanded ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#a1a1aa' }}>
            <Cpu size={13} color="#f59e0b" />
            <span>{typeof systemStatus?.cpu === 'number' ? `${Math.round(systemStatus.cpu)}%` : '—'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#a1a1aa' }}>
            <HardDrive size={13} color="#38bdf8" />
            <span>{typeof systemStatus?.memory === 'number' ? `${Math.round(systemStatus.memory)}%` : '—'}</span>
          </div>
          <span style={{ color: '#e4e4e7', fontWeight: 600 }}>{activeAgentName}</span>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {!greetingDismissed && (
            <span style={{ fontSize: '15px', animation: 'wave-bounce 1.5s infinite' }} role="img" aria-label="Aceno">
              👋
            </span>
          )}
          <span style={{ fontSize: '12px', fontWeight: 500, color: '#d4d4d8' }}>
            {!greetingDismissed ? 'JARVIS Online' : activeAgentName}
          </span>
        </div>
      )}

      {/* Mini indicador direito */}
      <div
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: voiceState === 'listening' ? '#38bdf8' : voiceState === 'speaking' ? '#10b981' : '#10b981',
          boxShadow: '0 0 6px currentColor',
        }}
      />
    </aside>
  );
};
