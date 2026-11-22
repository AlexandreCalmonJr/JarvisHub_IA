import React from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Modal } from './Modal';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'warning' | 'primary';
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'danger',
  isLoading = false,
  onConfirm,
  onCancel,
}) => {
  const icon =
    tone === 'danger' ? (
      <Trash2 size={18} color="var(--danger-color)" />
    ) : (
      <AlertTriangle
        size={18}
        color={tone === 'warning' ? 'var(--warning-color)' : 'var(--accent-color)'}
      />
    );

  const confirmButtonClass =
    tone === 'danger' ? 'btn btn-danger' : 'btn btn-primary';

  return (
    <Modal
      isOpen={isOpen}
      onClose={isLoading ? () => {} : onCancel}
      title={title}
      icon={icon}
      maxWidth="sm"
      footer={
        <>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={confirmButtonClass}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Processando...' : confirmLabel}
          </button>
        </>
      }
    >
      <div
        role="alertdialog"
        aria-modal="true"
        style={{
          fontSize: '0.88rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
        }}
      >
        {description}
      </div>
    </Modal>
  );
};
