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
          className="btn btn-secondary"
          style={{
            fontSize: '0.8rem',
            padding: '6px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.12)',
          }}
        >
          <Bot size={15} color="#ec4899" />
          <span>{showRecommendations ? 'Ocultar Recomendações dos 26 Agentes' : 'Ver Modelo Ideal para cada Agente'}</span>
          {showRecommendations ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {showRecommendations && (
        <div
          style={{
            padding: '16px',
            borderRadius: '12px',
            backgroundColor: 'rgba(7, 10, 18, 0.7)',
            border: '1px solid rgba(236, 72, 153, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={16} color="#ec4899" />
            <h4 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
              Mapeamento de Modelos por Agente Especialista (Otimizado para CPU i5 / 32GB RAM)
            </h4>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
              gap: '10px',
              maxHeight: '320px',
              overflowY: 'auto',
              paddingRight: '6px',
            }}
          >
            {Object.entries(recommendations).map(([agentKey, rec]) => {
              const isInstalled = isModelInstalled(rec.model);
              const agentNameDisplay = formatFriendlyText(agentKey);

              return (
                <div
                  key={agentKey}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#e2e8f0' }}>
                      {agentNameDisplay}
                    </span>
                    {isInstalled ? (
                      <span style={{ fontSize: '0.68rem', color: '#34d399', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Check size={11} /> Instalado
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onInstallModel(rec.model, agentNameDisplay)}
                        disabled={isInstalling}
                        style={{
                          fontSize: '0.68rem',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(236, 72, 153, 0.15)',
                          border: '1px solid rgba(236, 72, 153, 0.4)',
                          color: '#f472b6',
                          cursor: 'pointer',
                        }}
                      >
                        Instalar
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#a5b4fc', fontFamily: "'JetBrains Mono', monospace" }}>
                    {rec.model}
                  </div>
                  <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>
                    {rec.reason}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
