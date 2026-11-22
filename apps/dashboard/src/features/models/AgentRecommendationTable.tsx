import React, { useState } from 'react';
import { Bot, ChevronDown, ChevronUp, Layers, Check } from 'lucide-react';
import { formatFriendlyText } from '../../types';

interface AgentRecommendationTableProps {
  recommendations: Record<string, { model: string; reason: string }>;
  isModelInstalled: (tag: string) => boolean;
  onInstallModel: (modelTag: string, displayName: string) => void;
  isInstalling: boolean;
}

export const AgentRecommendationTable: React.FC<AgentRecommendationTableProps> = ({
  recommendations,
  isModelInstalled,
  onInstallModel,
  isInstalling,
}) => {
  const [showRecommendations, setShowRecommendations] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => setShowRecommendations(!showRecommendations)}
          className="btn btn-secondary btn-sm"
          aria-expanded={showRecommendations}
        >
          <Bot size={14} color="var(--accent-light)" />
          <span>{showRecommendations ? 'Ocultar recomendações por agente' : 'Ver modelo ideal para cada agente'}</span>
          {showRecommendations ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {showRecommendations && (
        <section className="jarvis-settings-card">
          <div className="jarvis-settings-card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={16} color="var(--accent-light)" />
              <div>
                <h4 className="jarvis-settings-card-title">
                  Mapeamento de modelos por especialista
                </h4>
                <p className="jarvis-settings-card-desc">
                  Sugestões calibradas para execução local eficiente por função.
                </p>
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
              gap: '10px',
              maxHeight: '360px',
              overflowY: 'auto',
              paddingRight: '4px',
            }}
          >
            {Object.entries(recommendations).map(([agentKey, rec]) => {
              const isInstalled = isModelInstalled(rec.model);
              const agentNameDisplay = formatFriendlyText(agentKey);

              return (
                <div key={agentKey} className="jarvis-settings-subcard" style={{ gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {agentNameDisplay}
                    </span>
                    {isInstalled ? (
                      <span
                        style={{
                          fontSize: '0.72rem',
                          color: '#4ade80',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          flexShrink: 0,
                        }}
                      >
                        <Check size={12} />
                        Instalado
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onInstallModel(rec.model, agentNameDisplay)}
                        disabled={isInstalling}
                        className="btn btn-secondary btn-xs"
                      >
                        Instalar
                      </button>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: '0.74rem',
                      color: 'var(--accent-light)',
                      fontFamily: 'var(--font-mono)',
                      wordBreak: 'break-all',
                    }}
                  >
                    {rec.model}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    {rec.reason}
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
