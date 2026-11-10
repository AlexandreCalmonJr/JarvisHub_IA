import React from 'react';
import { Modal } from '../common/Modal';
import { CodeViewer } from '../common/CodeViewer';
import { FileCode, Download } from 'lucide-react';

interface FileViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  filePath: string;
  content: string;
}

export const FileViewerModal: React.FC<FileViewerModalProps> = ({
  isOpen,
  onClose,
  projectId,
  filePath,
  content,
}) => {
  const getLanguage = (path: string) => {
    if (path.endsWith('.html')) return 'html';
    if (path.endsWith('.css')) return 'css';
    if (path.endsWith('.js')) return 'javascript';
    if (path.endsWith('.dart')) return 'dart';
    if (path.endsWith('.yaml') || path.endsWith('.yml')) return 'yaml';
    if (path.endsWith('.json')) return 'json';
    if (path.endsWith('.md')) return 'markdown';
    return 'plaintext';
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filePath.split('/').pop() || 'file.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={filePath}
      subtitle={`Projeto: workspace/${projectId}/`}
      icon={<FileCode size={20} />}
      maxWidth="xl"
      footer={
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleDownload} className="btn btn-secondary">
            <Download size={14} /> Baixar Arquivo
          </button>
          <button onClick={onClose} className="btn btn-primary">
            Concluído
          </button>
        </div>
      }
    >
      <CodeViewer
        code={content}
        language={getLanguage(filePath)}
        filename={filePath}
        maxHeight="65vh"
        showLineNumbers={true}
      />
    </Modal>
  );
};
