import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

let toastListeners: Array<(toasts: ToastMessage[]) => void> = [];
let currentToasts: ToastMessage[] = [];

export function notify(
  message: string,
  type: 'success' | 'error' | 'info' | 'warning' = 'info'
): void {
  const id = Math.random().toString(36).slice(2, 9);
  const newToast: ToastMessage = { id, message, type };
  currentToasts = [...currentToasts, newToast];
  toastListeners.forEach((fn) => fn(currentToasts));

  setTimeout(() => {
    currentToasts = currentToasts.filter((t) => t.id !== id);
    toastListeners.forEach((fn) => fn(currentToasts));
  }, 4000);
}

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handler = (newToasts: ToastMessage[]) => setToasts([...newToasts]);
    toastListeners.push(handler);
    return () => {
      toastListeners = toastListeners.filter((l) => l !== handler);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        zIndex: 99999,
        maxWidth: '380px',
      }}
    >
      {toasts.map((t) => {
        let bg = 'rgba(15, 23, 42, 0.95)';
        let border = 'rgba(99, 102, 241, 0.3)';
        let color = '#818cf8';
        let Icon = Info;

        if (t.type === 'success') {
          border = 'rgba(16, 185, 129, 0.4)';
          color = '#34d399';
          Icon = CheckCircle2;
        } else if (t.type === 'error') {
          border = 'rgba(239, 68, 68, 0.4)';
          color = '#f87171';
          Icon = AlertCircle;
        } else if (t.type === 'warning') {
          border = 'rgba(245, 158, 11, 0.4)';
          color = '#f59e0b';
          Icon = AlertCircle;
        }

        return (
          <div
            key={t.id}
            style={{
              padding: '12px 16px',
              borderRadius: '10px',
              backgroundColor: bg,
              border: `1px solid ${border}`,
              backdropFilter: 'blur(12px)',
              boxShadow: '0 8px 30px rgba(0,0,0,0.7)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontSize: '0.84rem',
              color: '#f8fafc',
              animation: 'fadeIn 0.2s ease-out',
            }}
          >
            <Icon size={18} color={color} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, lineHeight: 1.4 }}>{t.message}</span>
            <button
              onClick={() => {
                currentToasts = currentToasts.filter((item) => item.id !== t.id);
                toastListeners.forEach((fn) => fn(currentToasts));
              }}
              className="btn btn-ghost"
              style={{ padding: '2px', color: 'var(--text-muted)' }}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
