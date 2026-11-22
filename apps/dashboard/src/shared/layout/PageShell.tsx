import React from 'react';

export interface PageShellProps {
  mode?: 'standard' | 'fluid';
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export const PageShell: React.FC<PageShellProps> = ({
  mode = 'standard',
  className = '',
  style,
  children,
}) => {
  const baseClass = mode === 'fluid' ? 'jarvis-page-shell--fluid' : 'jarvis-page-shell';
  return (
    <div className={`${baseClass}${className ? ` ${className}` : ''}`} style={style}>
      {children}
    </div>
  );
};
