import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Overview } from './components/Overview';
import { ChatMaster } from './components/ChatMaster';
import { ApprovalCenter } from './components/ApprovalCenter';
import { ProjectWorkspaceView } from './components/ProjectWorkspaceView';
import { AgentCenterView } from './components/AgentCenterView';
import { SecurityCenterView } from './components/SecurityCenterView';
import { SystemHealth, ApprovalRequestItem } from './types';
import { fetchHealth, fetchApprovals } from './api';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRequestItem[]>([]);

  const loadData = async () => {
    try {
      const [h, a] = await Promise.all([
        fetchHealth().catch(() => null),
        fetchApprovals().catch(() => []),
      ]);
      setHealth(h);
      setApprovals(a);
    } catch (e) {
      console.error('Erro ao atualizar dados:', e);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 8000);
    return () => clearInterval(interval);
  }, []);

  const pendingApprovalsCount = approvals.filter(a => a.status === 'pending').length;

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pendingApprovalsCount={pendingApprovalsCount}
      />

      <main style={{
        flex: 1,
        overflowY: 'auto',
        padding: '32px 40px',
        backgroundColor: 'var(--bg-primary)',
      }}>
        {activeTab === 'overview' && <Overview health={health} approvals={approvals} />}
        {activeTab === 'chat' && <ChatMaster />}
        {activeTab === 'approvals' && <ApprovalCenter approvals={approvals} onRefresh={loadData} />}
        {activeTab === 'workspace' && <ProjectWorkspaceView />}
        {activeTab === 'agents' && <AgentCenterView />}
        {activeTab === 'security' && <SecurityCenterView onRefresh={loadData} />}
      </main>
    </div>
  );
};

export default App;
