import React, { useState, useEffect } from 'react';
import { ListTodo, CheckCircle2, Clock, RefreshCw } from 'lucide-react';
import { fetchTasks } from '../api';

export const TaskManagerView: React.FC = () => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const data = await fetchTasks();
      setTasks(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Task Manager</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Histórico persistido de tarefas, deliberações e checkpoints do monólito.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={loadTasks} disabled={loading}>
          <RefreshCw size={16} /> Atualizar
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <ListTodo size={40} color="var(--text-secondary)" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Nenhuma tarefa registada</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Inicie uma conversa no Chat Master para gerar planos e tarefas.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {tasks.map((task) => (
            <div key={task.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  padding: '10px',
                  borderRadius: '8px',
                  backgroundColor: task.is_completed ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                  color: task.is_completed ? 'var(--success-color)' : 'var(--warning-color)',
                }}>
                  {task.is_completed ? <CheckCircle2 size={20} /> : <Clock size={20} />}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{task.prompt}</span>
                    <span className="badge badge-info">{task.intent || 'generic'}</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    ID: {task.id} • Sessão: {task.session_id} • {task.created_at}
                  </div>
                </div>
              </div>
              <div>
                <span className={`badge ${task.is_completed ? 'badge-success' : 'badge-warning'}`}>
                  {task.is_completed ? 'Concluída' : 'Em Execução'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
