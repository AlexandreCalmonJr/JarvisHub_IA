import React, { useState } from 'react';
import { triggerKillSwitch } from '../api';
import { AlertOctagon, CheckCircle } from 'lucide-react';

interface SecurityCenterViewProps {
  onRefresh: () => void;
}

export const SecurityCenterView: React.FC<SecurityCenterViewProps> = ({ onRefresh }) => {
  const [killLoading, setKillLoading] = useState(false);
  const [taskIdInput, setTaskIdInput] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const handleGlobalKill = async () => {
    if (!window.confirm('ATENÇÃO: Deseja suspender imediatamente todas as operações e ferramentas do JARVIS HUB?')) {
      return;
    }
    setKillLoading(true);
    try {
      await triggerKillSwitch('global');
      setMessage('Kill Switch Global ACIONADO com sucesso! Todas as ferramentas foram bloqueadas.');
      onRefresh();
    } catch (err: any) {
      setMessage(`Erro: ${err.message}`);
    } finally {
      setKillLoading(false);
    }
  };

  const handleCancelTask = async () => {
    if (!taskIdInput.trim()) return;
    setKillLoading(true);
    try {
      await triggerKillSwitch('task', taskIdInput.trim());
      setMessage(`Tarefa '${taskIdInput.trim()}' cancelada com sucesso.`);
      setTaskIdInput('');
      onRefresh();
    } catch (err: any) {
      setMessage(`Erro: ${err.message}`);
    } finally {
      setKillLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Security Center & Kill Switch</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
          Mecanismos de contenção de emergência, governança de permissões e auditoria estrita.
        </p>
      </div>

      {message && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          borderRadius: '8px',
          color: '#818cf8',
          fontSize: '0.875rem',
        }}>
          {message}
        </div>
      )}

      {/* Kill Switch Card */}
      <div style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '12px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertOctagon size={24} color="var(--danger-color)" />
          <h3 style={{ fontSize: '1.15rem', fontWeight: 600, color: '#f87171' }}>
            Kill Switch de Emergência
          </h3>
        </div>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          O Kill Switch interrompe processos em execução, revoga permissões temporárias no Tool Gateway e rejeita novas chamadas a ferramentas de IA instantaneamente.
        </p>

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', marginTop: '8px' }}>
          <button
            onClick={handleGlobalKill}
            disabled={killLoading}
            style={{
              padding: '10px 20px',
              backgroundColor: 'var(--danger-color)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <AlertOctagon size={18} />
            <span>Disparar Paragem Global de Emergência</span>
          </button>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="ID da Tarefa (ex: tsk-abc123)"
              value={taskIdInput}
              onChange={(e) => setTaskIdInput(e.target.value)}
              style={{
                padding: '10px 14px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
                width: '220px',
              }}
            />
            <button
              onClick={handleCancelTask}
              disabled={killLoading || !taskIdInput.trim()}
              style={{
                padding: '10px 16px',
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                fontWeight: 500,
                fontSize: '0.85rem',
                cursor: !taskIdInput.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              Cancelar Tarefa
            </button>
          </div>
        </div>
      </div>

      {/* Políticas Ativas */}
      <div style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        padding: '24px',
      }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '16px' }}>
          Políticas de Segurança do Backend
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.875rem' }}>
            <CheckCircle size={18} color="var(--success-color)" />
            <span><b>Redaction Automático</b>: Chaves API e senhas mascaradas antes de ir para logs e respostas.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.875rem' }}>
            <CheckCircle size={18} color="var(--success-color)" />
            <span><b>Path Traversal Guard</b>: Confinamento rigoroso à raiz de projetos permitidos.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.875rem' }}>
            <CheckCircle size={18} color="var(--success-color)" />
            <span><b>Autoaprovação Bloqueada</b>: Agentes de IA rejeitados incondicionalmente no Approval Center.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.875rem' }}>
            <CheckCircle size={18} color="var(--success-color)" />
            <span><b>Sandbox com Timeout</b>: Subprocessos de teste encerrados automaticamente em 60s.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
