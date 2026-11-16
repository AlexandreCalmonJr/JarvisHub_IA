import React, { useRef, useEffect, useState } from 'react';
import {
  Square,
  Mic,
  MicOff,
  FolderGit2,
  Plus,
  ChevronDown,
  ArrowUp,
  Paperclip,
  FileText,
  X,
  Upload,
} from 'lucide-react';
import { fetchModels } from '../../api';
import { notify } from '../common/Toast';
import { getAccountStorageKey } from '../../services/accountScope';
import { humanizeLabel } from '../../types';

interface AttachedFile {
  name: string;
  size: number;
  content: string;
}

export interface RealChatModel {
  id: string;
  name: string;
  label: string;
  effort: string;
  isCloud?: boolean;
}



interface ChatInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (overrideText?: string, modelOverride?: string) => void;
  loading: boolean;
  onStopGeneration: () => void;
  isListening: boolean;
  onToggleVoiceInput: () => void;
  activeProjectId: string | null;
  activeProjectName?: string | null;
  onDetachProject: () => void;
  onOpenProjectModal?: () => void;
  isFloatingCenter?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  input,
  onInputChange,
  onSubmit,
  loading,
  onStopGeneration,
  isListening,
  onToggleVoiceInput,
  activeProjectId,
  activeProjectName,
  onDetachProject,
  onOpenProjectModal,
  isFloatingCenter = false,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [modelOptions, setModelOptions] = useState<RealChatModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<RealChatModel | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    let isMounted = true;
    fetchModels()
      .then((data: any) => {
        if (!isMounted || !data) return;
        const list: RealChatModel[] = [];

        // Adiciona modelo do Gateway Híbrido se habilitado
        if (data.hybrid_gateway?.enabled && data.hybrid_gateway?.model) {
          const provName = (data.hybrid_gateway.provider || 'Nuvem').toUpperCase();
          list.push({
            id: data.hybrid_gateway.model,
            name: data.hybrid_gateway.model,
            label: `${data.hybrid_gateway.model}`,
            effort: `${provName} Nuvem`,
            isCloud: true,
          });
        }

        // Adiciona modelos locais instalados no Ollama
        if (Array.isArray(data.models)) {
          for (const m of data.models) {
            const role = m.role || 'Local';
            const shortRole = role.split(',')[0].trim();
            list.push({
              id: m.name,
              name: m.name,
              label: m.name,
              effort: `${m.parameter_size || 'Local'} (${shortRole})`,
              isCloud: false,
            });
          }
        }

        setModelOptions(list);
        const savedModelId = localStorage.getItem(getAccountStorageKey('jarvis_selected_model'));
        const found = list.find((item) => item.id === savedModelId);
        setSelectedModel(found || null);
      })
      .catch((err) => {
        console.warn('Falha ao carregar modelos reais no ChatInput:', err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!input && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input]);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onInputChange(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 220)}px`;
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      if (file.size > 5 * 1024 * 1024) {
        notify('Arquivo muito grande. Limite de 5MB por arquivo.', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        if (text) {
          setAttachedFiles((prev) => [...prev, { name: file.name, size: file.size, content: text }]);
          notify(`Arquivo '${file.name}' anexado ao contexto.`, 'success');
        }
      };
      reader.readAsText(file);
    });
  };

  const removeAttachment = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleActualSubmit = (overrideText?: string, modelOverride?: string) => {
    const textToSubmit = overrideText ?? input;
    if (!textToSubmit.trim() && attachedFiles.length === 0) return;

    let payload = textToSubmit.trim();
    if (attachedFiles.length > 0) {
      const attachmentsBlock = attachedFiles
        .map(
          (f) =>
            `\n[ARQUIVO ANEXADO: ${f.name} (${(f.size / 1024).toFixed(1)} KB)]\n\`\`\`${
              f.name.split('.').pop() || 'text'
            }\n${f.content}\n\`\`\``
        )
        .join('\n');
      payload = payload ? `${payload}\n\n---\n${attachmentsBlock}` : attachmentsBlock;
      setAttachedFiles([]);
    }

    onSubmit(payload, modelOverride ?? selectedModel?.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if ((input.trim() || attachedFiles.length > 0) && !loading) {
        handleActualSubmit(undefined, selectedModel?.id);
      }
    }
  };

  const handleSelectCommand = (cmd: string) => {
    setShowPlusMenu(false);
    handleActualSubmit(cmd, selectedModel?.id);
  };

  return (
    <div
      style={{
        width: '100%',
        maxWidth: isFloatingCenter ? '740px' : '820px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        position: 'relative',
      }}
    >
      {/* Banner de Projeto Ativo no Contexto */}
      {activeProjectId && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '5px 14px',
            borderRadius: '999px',
            backgroundColor: 'rgba(217, 119, 87, 0.12)',
            border: '1px solid rgba(217, 119, 87, 0.25)',
            fontSize: '0.74rem',
            color: 'var(--text-primary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FolderGit2 size={13} color="var(--accent-color)" />
            <span>
              Projeto Ativo: <strong>{activeProjectName || humanizeLabel(activeProjectId)}</strong> (comandos modificarão arquivos deste diretório)
            </span>
          </div>
          <button
            type="button"
            onClick={onDetachProject}
            className="btn btn-ghost"
            style={{ fontSize: '0.70rem', padding: '1px 6px', color: '#f87171' }}
          >
            Desanexar
          </button>
        </div>
      )}

      {/* Cápsula Flutuante de Entrada (Claude Capsule com Dropzone Universal) */}
      <div
        className="claude-capsule"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        style={{
          padding: '14px 18px 12px 18px',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          border: isDragging ? '2px dashed var(--accent-color)' : undefined,
          backgroundColor: isDragging ? 'rgba(217, 119, 87, 0.08)' : undefined,
          transition: 'all 0.2s ease',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            handleFiles(e.target.files);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
        />

        {/* Banner de Drag & Drop ativo */}
        {isDragging && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '8px',
              color: 'var(--accent-color)',
              fontWeight: 600,
              fontSize: '0.85rem',
            }}
          >
            <Upload size={18} />
            <span>Solte arquivos aqui para anexar ao contexto (Código, Markdown, Logs, JSON, PDF)</span>
          </div>
        )}

        {/* Chips de Arquivos Anexados */}
        {attachedFiles.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingBottom: '4px' }}>
            {attachedFiles.map((file, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 10px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(217, 119, 87, 0.15)',
                  border: '1px solid rgba(217, 119, 87, 0.3)',
                  fontSize: '0.74rem',
                  color: 'var(--text-primary)',
                }}
              >
                <FileText size={13} color="var(--accent-color)" />
                <span>
                  {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Remover anexo"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Campo de Texto Auto-expansível */}
        <textarea
          ref={textareaRef}
          rows={isFloatingCenter ? 2 : 1}
          value={input}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          placeholder="Como posso ajudar você hoje?"
          disabled={loading}
          style={{
            width: '100%',
            backgroundColor: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontSize: '0.94rem',
            lineHeight: '1.5',
            resize: 'none',
            maxHeight: '220px',
            fontFamily: 'inherit',
          }}
        />

        {/* Linha Inferior com Botão +, Seletor de Modelo, Microfone e Envio */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            paddingTop: '4px',
          }}
        >
          {/* Lado Esquerdo: Botão + com Menu Popover */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setShowPlusMenu((prev) => !prev)}
              disabled={loading}
              className="btn btn-ghost"
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: showPlusMenu ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.05)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
              title="Anexar projetos, arquivos ou acionar comandos rápidos"
            >
              <Plus size={16} />
            </button>

            {/* Menu Popover do Botão + */}
            {showPlusMenu && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '38px',
                  left: 0,
                  width: '260px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
                  padding: '6px',
                  zIndex: 100,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowPlusMenu(false);
                    fileInputRef.current?.click();
                  }}
                  className="btn btn-ghost"
                  style={{
                    justifyContent: 'flex-start',
                    padding: '7px 10px',
                    fontSize: '0.80rem',
                    width: '100%',
                    gap: '8px',
                  }}
                >
                  <Paperclip size={14} color="var(--accent-color)" />
                  <span>Anexar Arquivo (Código, Log, PDF)</span>
                </button>

                {onOpenProjectModal && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowPlusMenu(false);
                      onOpenProjectModal();
                    }}
                    className="btn btn-ghost"
                    style={{
                      justifyContent: 'flex-start',
                      padding: '7px 10px',
                      fontSize: '0.80rem',
                      width: '100%',
                      gap: '8px',
                    }}
                  >
                    <FolderGit2 size={14} color="var(--accent-color)" />
                    <span>Anexar Projeto do Workspace</span>
                  </button>
                )}

                <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '4px 0' }} />

                <button
                  type="button"
                  onClick={() => handleSelectCommand('/ponytail senior')}
                  className="btn btn-ghost"
                  style={{ justifyContent: 'flex-start', padding: '6px 10px', fontSize: '0.78rem', width: '100%' }}
                >
                  <span>/ponytail senior — Código enxuto YAGNI</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectCommand('/debate')}
                  className="btn btn-ghost"
                  style={{ justifyContent: 'flex-start', padding: '6px 10px', fontSize: '0.78rem', width: '100%' }}
                >
                  <span>/debate — Mesa Redonda de Especialistas</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectCommand('/audit')}
                  className="btn btn-ghost"
                  style={{ justifyContent: 'flex-start', padding: '6px 10px', fontSize: '0.78rem', width: '100%' }}
                >
                  <span>/audit — Auditoria de Segurança OWASP</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectCommand('/rollback')}
                  className="btn btn-ghost"
                  style={{ justifyContent: 'flex-start', padding: '6px 10px', fontSize: '0.78rem', width: '100%' }}
                >
                  <span>/rollback — Reverter última alteração Git</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectCommand('/test')}
                  className="btn btn-ghost"
                  style={{ justifyContent: 'flex-start', padding: '6px 10px', fontSize: '0.78rem', width: '100%' }}
                >
                  <span>/test — Gerar Suíte de Testes QA</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectCommand('/doc')}
                  className="btn btn-ghost"
                  style={{ justifyContent: 'flex-start', padding: '6px 10px', fontSize: '0.78rem', width: '100%' }}
                >
                  <span>/doc — Documentar Arquitetura</span>
                </button>
              </div>
            )}
          </div>

          {/* Lado Direito: Seletor de Modelo, Microfone, Onda de Voz e Botão de Envio */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Seletor de Modelo (Claude Desktop Style: "Sonnet 5.5 Médio ⌵") */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowModelMenu((prev) => !prev)}
                className="btn btn-ghost"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderRadius: '999px',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.76rem',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
                title="Alternar modelo de IA ativo"
              >
                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                  {selectedModel?.label || 'Automático (Maestro)'}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.70rem' }}>
                  {selectedModel?.effort || 'Seleção inteligente'}
                </span>
                <ChevronDown size={12} color="var(--text-muted)" />
              </button>

              {/* Dropdown de Modelos */}
              {showModelMenu && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '36px',
                    right: 0,
                    width: '210px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
                    padding: '6px',
                    zIndex: 100,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                  }}
                >
                  <div style={{ padding: '4px 8px', fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    MODELOS REAIS DISPONÍVEIS
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedModel(null);
                      try {
                        localStorage.removeItem(getAccountStorageKey('jarvis_selected_model'));
                      } catch {
                        // A seleção automática continua válida nesta sessão.
                      }
                      setShowModelMenu(false);
                    }}
                    className="btn btn-ghost"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 8px',
                      fontSize: '0.78rem',
                      width: '100%',
                      backgroundColor: selectedModel === null ? 'var(--accent-glow)' : 'transparent',
                      color: selectedModel === null ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    <span>Automático (Maestro)</span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--accent-color)' }}>Recomendado</span>
                  </button>
                  {modelOptions.length === 0 && (
                    <div style={{ padding: '8px', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                      Nenhum modelo foi confirmado pela API. A seleção automática continua disponível.
                    </div>
                  )}
                  {modelOptions.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setSelectedModel(m);
                        try {
                          localStorage.setItem(getAccountStorageKey('jarvis_selected_model'), m.id);
                        } catch {
                          // A seleção continua ativa nesta sessão mesmo sem persistência local.
                        }
                        setShowModelMenu(false);
                      }}
                      className="btn btn-ghost"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 8px',
                        fontSize: '0.78rem',
                        width: '100%',
                        backgroundColor: selectedModel?.id === m.id ? 'rgba(217, 119, 87, 0.15)' : 'transparent',
                        color: selectedModel?.id === m.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                      }}
                    >
                      <span style={{ fontWeight: selectedModel?.id === m.id ? 600 : 400 }}>{m.label}</span>
                      <span style={{ fontSize: '0.68rem', color: m.isCloud ? 'var(--accent-color)' : 'var(--text-muted)' }}>
                        {m.effort}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Microfone com Whisper Turbo */}
            {isListening && (
              <span
                style={{
                  fontSize: '0.72rem',
                  color: '#ef4444',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#ef4444',
                    display: 'inline-block',
                  }}
                />
                Gravando... (clique para enviar)
              </span>
            )}

            <button
              type="button"
              onClick={onToggleVoiceInput}
              disabled={loading}
              className="btn btn-ghost"
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isListening ? 'rgba(239, 68, 68, 0.22)' : 'transparent',
                color: isListening ? '#ef4444' : 'var(--text-muted)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              title={isListening ? 'Clique para parar e transcrever com Whisper' : 'Falar comando por voz (Whisper Turbo)'}
            >
              {isListening ? <MicOff size={15} color="#ef4444" /> : <Mic size={15} />}
            </button>

            {/* Botão de Envio (ArrowUp em círculo) ou Parada */}
            {loading ? (
              <button
                type="button"
                onClick={onStopGeneration}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#ef4444',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)',
                }}
                title="Interromper geração"
              >
                <Square size={13} fill="#fff" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleActualSubmit(undefined, selectedModel?.id)}
                disabled={!input.trim() && attachedFiles.length === 0}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor:
                    input.trim() || attachedFiles.length > 0
                      ? 'var(--accent-color)'
                      : 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  color: input.trim() || attachedFiles.length > 0 ? '#fff' : 'var(--text-muted)',
                  cursor: input.trim() || attachedFiles.length > 0 ? 'pointer' : 'default',
                  transition: 'all 0.18s ease',
                  boxShadow:
                    input.trim() || attachedFiles.length > 0
                      ? '0 2px 10px rgba(217, 119, 87, 0.35)'
                      : 'none',
                }}
                title="Enviar mensagem (Enter)"
              >
                <ArrowUp size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
