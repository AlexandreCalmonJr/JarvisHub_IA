import React from 'react';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  meta?: Array<string | React.ReactNode>;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  meta,
  actions,
  icon,
  className = '',
}) => {
  const filteredMeta = (meta || []).filter(Boolean);

  return (
    <header className={`jarvis-page-header${className ? ` ${className}` : ''}`}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {icon && (
            <span
              aria-hidden="true"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'var(--accent-soft)',
                border: '1px solid var(--border-accent)',
                color: 'var(--accent-light)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {icon}
            </span>
          )}
          <h1 className="jarvis-page-header__title">{title}</h1>
        </div>
        {subtitle && <p className="jarvis-page-header__subtitle">{subtitle}</p>}
        {filteredMeta.length > 0 && (
          <div className="jarvis-page-header__meta">
            {filteredMeta.map((item, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span aria-hidden="true">·</span>}
                <span>{item}</span>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
      {actions && <div className="jarvis-page-header__actions">{actions}</div>}
    </header>
  );
};
