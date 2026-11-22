import React, { useState } from 'react';
import { Download, RefreshCw, Share, Smartphone, WifiOff, X } from 'lucide-react';
import { useOfflineQueue, usePWAInstall } from './usePWAInstall';
import { notify } from '../common/Toast';

interface PWAInstallButtonProps {
  compact?: boolean;
  showFallbackInfo?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  compact = false,
  showFallbackInfo = false,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    if (!showFallbackInfo) return null;
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          borderRadius: '8px',
          fontSize: '0.78rem',
          fontWeight: 600,
          color: '#4ade80',
          backgroundColor: 'rgba(34, 197, 94, 0.12)',
          border: '1px solid rgba(34, 197, 94, 0.35)',
        }}
      >
        <Smartphone size={14} /> App instalado (Standalone)
      </span>
    );
  }

  const handleClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) {
        notify('JARVIS AI Hub instalado na tela inicial!', 'success');
      }
      return;
    }
    setShowGuide(true);
  };

  if (!isInstallable && !isIOS && !showFallbackInfo) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        className={compact ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'}
        title="Instalar JARVIS AI Hub como aplicativo PWA"
      >
        <Download size={14} />
        <span>{isIOS ? 'Instalar no iOS' : 'Instalar App'}</span>
      </button>

      {showGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Como instalar o JARVIS AI Hub"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 900,
            backgroundColor: 'rgba(5, 7, 11, 0.72)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '420px',
              borderRadius: '14px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-secondary)',
              padding: '20px',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Smartphone size={17} color="var(--accent-color)" />
                {isIOS ? 'Instalar no iPhone / iPad' : 'Instalar App PWA (Celular & Desktop)'}
              </h3>
              <button type="button" onClick={() => setShowGuide(false)} className="btn btn-ghost btn-icon-sm" aria-label="Fechar guia">
                <X size={15} />
              </button>
            </div>

            {isIOS ? (
              <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <p style={{ marginBottom: '8px' }}>
                  1. Toque no botão <strong style={{ color: 'var(--text-primary)' }}><Share size={13} style={{ display: 'inline', verticalAlign: 'middle' }} /> Compartilhar</strong> na barra inferior do Safari.
                </p>
                <p>
                  2. Role para baixo e toque em <strong style={{ color: 'var(--text-primary)' }}>Adicionar à Tela de Início</strong>.
                </p>
              </div>
            ) : (
              <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <p style={{ marginBottom: '8px' }}>
                  O Manifesto PWA, Service Worker e ícones oficiais estão ativos neste aplicativo.
                </p>
                <p>
                  No Chrome, Edge ou Android, clique no ícone de <strong style={{ color: 'var(--text-primary)' }}>Instalar App</strong> na barra de endereço ou abra o menu <strong>⋮ → Instalar aplicativo</strong>.
                </p>
              </div>
            )}

            <button type="button" onClick={() => setShowGuide(false)} className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-end' }}>
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const { isOnline, queue, syncing, syncNow } = useOfflineQueue();

  if (isOnline && queue.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '18px',
        left: '18px',
        zIndex: 450,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '9px 14px',
        borderRadius: '10px',
        backgroundColor: isOnline ? 'rgba(249, 115, 22, 0.16)' : 'rgba(245, 158, 11, 0.18)',
        border: `1px solid ${isOnline ? 'rgba(249, 115, 22, 0.45)' : 'rgba(245, 158, 11, 0.5)'}`,
        color: '#fef3c7',
        fontSize: '0.78rem',
        fontWeight: 600,
        backdropFilter: 'blur(8px)',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <WifiOff size={15} color="#fbbf24" />
      <span>
        {!isOnline
          ? `Modo Offline — ${queue.length > 0 ? `${queue.length} comando(s) na fila` : 'Usando cache local'}`
          : `${queue.length} comando(s) offline prontos para sincronizar`}
      </span>
      {isOnline && queue.length > 0 && (
        <button
          type="button"
          onClick={async () => {
            const res = await syncNow();
            if (res.synced > 0) notify(`${res.synced} comando(s) sincronizado(s)!`, 'success');
          }}
          disabled={syncing}
          className="btn btn-primary btn-sm"
          style={{ padding: '3px 9px', fontSize: '0.72rem' }}
        >
          <RefreshCw size={12} /> {syncing ? 'Sincronizando...' : 'Sincronizar'}
        </button>
      )}
    </div>
  );
};
