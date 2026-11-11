import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { Modal } from './Modal';

interface ApprovalPromptDetail {
  impactLabel: string;
  previewText: string;
  resolve: (approved: boolean) => void;
}

export const ApprovalPromptHost: React.FC = () => {
  const [prompt, setPrompt] = useState<ApprovalPromptDetail | null>(null);

  useEffect(() => {
    const handlePrompt = (event: Event) => {
      const detail = (event as CustomEvent<ApprovalPromptDetail>).detail;
      if (detail && typeof detail.resolve === 'function') setPrompt(detail);
    };
    window.addEventListener('jarvis:approval-prompt', handlePrompt);
    return () => window.removeEventListener('jarvis:approval-prompt', handlePrompt);
  }, []);

  const decide = (approved: boolean) => {
    const current = prompt;
    setPrompt(null);
    current?.resolve(approved);
  };

  return (
    <Modal
      isOpen={!!prompt}
      onClose={() => decide(false)}
      title="Aprovação necessária"
      subtitle="Revise o impacto antes de permitir que o JARVIS continue."
      icon={<AlertTriangle size={19} />}
      maxWidth="xl"
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={() => decide(false)}>
            <X size={14} /> Rejeitar operação
          </button>
          <button type="button" className="btn btn-primary" onClick={() => decide(true)}>
            <Check size={14} /> Aprovar e continuar
          </button>
        </>
      )}
    >
      {prompt && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ padding: '12px 14px', borderRadius: '9px', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.88rem', lineHeight: 1.5 }}>
            {prompt.impactLabel}
          </div>
          <div>
            <h4 style={{ margin: '0 0 8px', color: 'var(--text-secondary)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Pré-visualização do impacto</h4>
            <pre style={{ margin: 0, padding: '14px', maxHeight: '42vh', overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', borderRadius: '9px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.78rem', lineHeight: 1.5 }}>
              {prompt.previewText || 'Consulte os detalhes no Centro de Aprovações.'}
            </pre>
          </div>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.76rem' }}>
            A aprovação será registada no servidor. Rejeitar cancela esta operação sem executar a alteração.
          </p>
        </div>
      )}
    </Modal>
  );
};
