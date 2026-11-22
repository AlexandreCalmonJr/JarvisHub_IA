import React from 'react';
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';

export const LoadingSkeleton: React.FC<{ rows?: number; height?: number }> = ({
  rows = 3,
  height = 64,
}) => (
  <div role="status" aria-label="Carregando conteúdo" style={{ display: 'grid', gap: '12px' }}>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="jarvis-skeleton" style={{ height: `${height}px`, width: '100%' }} />
    ))}
  </div>
);

export const EmptyState: React.FC<{
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}> = ({ title, description, action, icon }) => (
  <div
    style={{
      padding: '40px 24px',
      borderRadius: 'var(--radius-lg)',
      border: '1px dashed var(--border-color)',
      background: 'var(--bg-secondary)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      gap: '10px',
    }}
  >
    <div style={{ color: 'var(--text-muted)' }}>{icon || <Inbox size={26} />}</div>
    <strong style={{ fontSize: '0.94rem', color: 'var(--text-primary)', fontWeight: 600 }}>
      {title}
    </strong>
    {description && (
      <p style={{ margin: 0, maxWidth: '420px', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {description}
      </p>
    )}
    {action && <div style={{ marginTop: '6px' }}>{action}</div>}
  </div>
);

export const ErrorBanner: React.FC<{
  message: string;
  onRetry?: () => void;
}> = ({ message, onRetry }) => (
  <div
    role="alert"
    style={{
      padding: '12px 16px',
      borderRadius: 'var(--radius-md)',
      background: 'var(--danger-soft)',
      border: '1px solid rgba(239, 68, 68, 0.3)',
      color: '#fca5a5',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      flexWrap: 'wrap',
      fontSize: '0.84rem',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <AlertTriangle size={16} style={{ flexShrink: 0 }} />
      <span>{message}</span>
    </div>
    {onRetry && (
      <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
        <RefreshCw size={13} />
        <span>Tentar novamente</span>
      </button>
    )}
  </div>
);
