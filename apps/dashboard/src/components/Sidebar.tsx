import React from 'react';
import {
  Activity,
  MessageSquare,
  ShieldAlert,
  FolderGit2,
  Users,
  Lock,
  Cpu,
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  pendingApprovalsCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  pendingApprovalsCount,
}) => {
  const menuItems = [
    { id: 'overview', label: 'Visão Geral', icon: Activity },
    { id: 'chat', label: 'JARVIS Master', icon: MessageSquare },
    {
      id: 'approvals',
      label: 'Approval Center',
      icon: ShieldAlert,
      badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined,
    },
    { id: 'workspace', label: 'Project Workspace', icon: FolderGit2 },
    { id: 'agents', label: 'Agent Center (26)', icon: Users },
    { id: 'security', label: 'Security & Kill Switch', icon: Lock },
  ];

  return (
    <aside style={{
      width: '260px',
      backgroundColor: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border-color)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      flexShrink: 0,
    }}>
      <div style={{
        padding: '24px 20px',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}>
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '8px',
          backgroundColor: 'var(--accent-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
        }}>
          <Cpu size={22} />
        </div>
        <div>
          <h1 style={{ fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.02em' }}>JARVIS AI HUB</h1>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Local-First v1.0</span>
        </div>
      </div>

      <nav style={{ padding: '16px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: isActive ? 'var(--bg-tertiary)' : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: isActive ? 600 : 500,
                transition: 'all 0.15s ease',
                width: '100%',
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Icon size={18} color={isActive ? 'var(--accent-color)' : 'currentColor'} />
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span className="badge badge-warning">{item.badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div style={{
        padding: '16px 20px',
        borderTop: '1px solid var(--border-color)',
        fontSize: '0.75rem',
        color: 'var(--text-secondary)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: 'var(--success-color)',
            display: 'inline-block',
          }} />
          <span>Local CPU Inference</span>
        </div>
      </div>
    </aside>
  );
};
