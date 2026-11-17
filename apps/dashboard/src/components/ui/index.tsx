import React from 'react';
import { AlertCircle } from 'lucide-react';

export interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon,
  actions,
}) => (
  <header className="jarvis-page-header">
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
      {icon && <div className="jarvis-page-header-icon">{icon}</div>}
      <div style={{ minWidth: 0 }}>
        <h2
          className="claude-serif-title"
          style={{
            margin: 0,
            fontSize: '1.35rem',
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}
        >
          {title}
        </h2>
        {subtitle && (
          <p
            style={{
              margin: '4px 0 0',
              fontSize: '0.84rem',
              color: 'var(--text-secondary)',
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
    </div>
    {actions && (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {actions}
      </div>
    )}
  </header>
);

export interface ErrorBannerProps {
  message: React.ReactNode;
  action?: React.ReactNode;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ message, action }) => (
  <div role="alert" className="jarvis-error-banner">
    <AlertCircle size={16} color="var(--danger-color)" style={{ flexShrink: 0 }} />
    <div style={{ flex: 1, fontSize: '0.84rem', color: 'var(--text-primary)' }}>{message}</div>
    {action}
  </div>
);

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
}) => (
  <div className="jarvis-empty-state">
    {icon && <div style={{ color: 'var(--accent-color)', opacity: 0.85 }}>{icon}</div>}
    <h3
      style={{
        margin: 0,
        fontSize: '1rem',
        fontWeight: 600,
        color: 'var(--text-primary)',
      }}
    >
      {title}
    </h3>
    {description && (
      <p
        style={{
          margin: 0,
          maxWidth: '440px',
          fontSize: '0.84rem',
          color: 'var(--text-secondary)',
        }}
      >
        {description}
      </p>
    )}
    {action}
  </div>
);
