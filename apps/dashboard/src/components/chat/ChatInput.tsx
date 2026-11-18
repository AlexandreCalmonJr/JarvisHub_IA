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
  Sparkles,
  Users,
  ShieldCheck,
  RotateCcw,
  CheckCircle2,
  Cpu,
  Cloud,
  Check,
} from 'lucide-react';
import { fetchModels } from '../../api';
import { FormattedChatModel, parseChatModelOptions } from '../../services/chatModels';
import { notify } from '../common/Toast';
import { getAccountStorageKey } from '../../services/accountScope';
import { humanizeLabel } from '../../types';

interface AttachedFile {
  name: string;
  size: number;
  content: string;
}

export type RealChatModel = FormattedChatModel;

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
  selectedModelId?: string | null;
  onSelectModelId?: (modelId: string) => void;
  availableModels?: FormattedChatModel[];
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
  selectedModelId,
  onSelectModelId,
  availableModels,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [modelOptions, setModelOptions] = useState<RealChatModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<RealChatModel | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Fecha menus ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (plusMenuRef.current && !plusMenuRef.current.contains(target)) {
        setShowPlusMenu(false);
      }
      if (modelMenuRef.current && !modelMenuRef.current.contains(target)) {
        setShowModelMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (availableModels && availableModels.length > 0) {
      setModelOptions(availableModels);
      return;
    }
    let isMounted = true;
    fetchModels()
      .then((data: any) => {
        if (!isMounted || !data) return;
        const list = parseChatModelOptions(data);
        setModelOptions(list);
      })
      .catch((err) => {
        console.warn('Falha ao carregar modelos reais no ChatInput:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [availableModels]);

  useEffect(() => {
    if (modelOptions.length === 0) return;
    const targetId = selectedModelId !== undefined
      ? selectedModelId
      : localStorage.getItem(getAccountStorageKey('jarvis_selected_model'));

    let found = modelOptions.find((item) => item.id === targetId);
    if (!found && !selectedModelId && modelOptions.length > 0) {
      found = modelOptions.find((item) => item.id.toLowerCase().includes('qwen') || item.id.toLowerCase().includes('llama')) || modelOptions[0];
    }
    setSelectedModel(found || null);
  }, [selectedModelId, modelOptions]);

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
          aria-label="Mensagem para o JARVIS"
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
                  bottom: '44px',
                  left: 0,
                  width: '320px',
                  backgroundColor: 'rgba(20, 20, 23, 0.96)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '14px',
                  boxShadow: '0 20px 48px rgba(0, 0, 0, 0.65)',
                  padding: '8px',
                  zIndex: 200,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                {/* Seção Anexos */}
                <div style={{ padding: '4px 8px 2px 8px', fontSize: '0.66rem', color: '#888888', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Anexos & Contexto
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowPlusMenu(false);
                    fileInputRef.current?.click();
                  }}
                  className="btn btn-ghost"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    fontSize: '0.80rem',
                    width: '100%',
                    gap: '10px',
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  }}
                >
                  <div style={{ width: '26px', height: '26px', borderRadius: '7px', backgroundColor: 'rgba(217, 119, 87, 0.15)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <Paperclip size={13} color="var(--accent-color)" />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Anexar Arquivo</span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Código, logs, texto ou PDF</span>
                  </div>
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
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      fontSize: '0.80rem',
                      width: '100%',
                      gap: '10px',
                      backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    }}
                  >
                    <div style={{ width: '26px', height: '26px', borderRadius: '7px', backgroundColor: 'rgba(56, 189, 248, 0.15)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      <FolderGit2 size={13} color="#38bdf8" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Anexar Projeto do Workspace</span>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Vincular repositório ao chat</span>
                    </div>
                  </button>
                )}

                <div style={{ height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.07)', margin: '4px 0' }} />

                {/* Seção Comandos */}
                <div style={{ padding: '2px 8px', fontSize: '0.66rem', color: '#888888', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Comandos Rápidos
                </div>

                {[
                  { slug: '/ponytail senior', desc: 'Código enxuto YAGNI', icon: Sparkles },
                  { slug: '/debate', desc: 'Mesa Redonda de Especialistas', icon: Users },
                  { slug: '/audit', desc: 'Auditoria de Segurança OWASP', icon: ShieldCheck },
                  { slug: '/rollback', desc: 'Reverter última alteração Git', icon: RotateCcw },
                  { slug: '/test', desc: 'Gerar Suíte de Testes QA', icon: CheckCircle2 },
                  { slug: '/doc', desc: 'Documentar Arquitetura', icon: FileText },
                ].map((cmd) => {
                  const IconComponent = cmd.icon;
                  return (
                    <button
                      key={cmd.slug}
                      type="button"
                      onClick={() => handleSelectCommand(cmd.slug)}
                      className="btn btn-ghost"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        padding: '6px 8px',
                        borderRadius: '8px',
                        fontSize: '0.78rem',
                        width: '100%',
                        gap: '8px',
                      }}
                    >
                      <IconComponent size={13} color="var(--accent-color)" style={{ flexShrink: 0 }} />
                      <span
                        style={{
                          fontFamily: 'var(--font-mono, monospace)',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(217, 119, 87, 0.14)',
                          color: 'var(--accent-color)',
                          flexShrink: 0,
                        }}
                      >
                        {cmd.slug}
                      </span>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cmd.desc}
                      </span>
                    </button>
                  );
                })}
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
                    bottom: '42px',
                    right: 0,
                    width: '320px',
                    backgroundColor: 'rgba(20, 20, 23, 0.96)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '14px',
                    boxShadow: '0 20px 48px rgba(0, 0, 0, 0.7)',
                    padding: '8px',
                    zIndex: 200,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', fontSize: '0.66rem', color: '#888888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <span>MODELOS REAIS DISPONÍVEIS</span>
                    <span style={{ color: 'var(--accent-color)' }}>{modelOptions.length + 1} opções</span>
                  </div>

                  {/* Opção Automático (Maestro) */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedModel(null);
                      if (onSelectModelId) {
                        onSelectModelId('auto');
                      }
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
                      padding: '8px 10px',
                      borderRadius: '8px',
                      width: '100%',
                      backgroundColor: selectedModel === null ? 'rgba(217, 119, 87, 0.16)' : 'rgba(255, 255, 255, 0.03)',
                      border: selectedModel === null ? '1px solid rgba(217, 119, 87, 0.35)' : '1px solid transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <Sparkles size={14} color="var(--accent-color)" style={{ flexShrink: 0 }} />
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                        <span style={{ fontSize: '0.80rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          Automático (Maestro)
                        </span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          Roteamento dinâmico
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '0.66rem', color: 'var(--accent-color)', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(217, 119, 87, 0.12)', fontWeight: 600 }}>
                        Recomendado
                      </span>
                      {selectedModel === null && <Check size={13} color="var(--accent-color)" />}
                    </div>
                  </button>

                  <div style={{ height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.07)', margin: '3px 0' }} />

                  {/* Lista com scroll dos Modelos */}
                  <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {modelOptions.length === 0 && (
                      <div style={{ padding: '8px', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                        Nenhum modelo foi confirmado pela API. A seleção automática continua disponível.
                      </div>
                    )}
                    {modelOptions.map((m) => {
                      const isSelected = selectedModel?.id === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setSelectedModel(m);
                            if (onSelectModelId) {
                              onSelectModelId(m.id);
                            }
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
                            padding: '7px 10px',
                            borderRadius: '8px',
                            width: '100%',
                            backgroundColor: isSelected ? 'rgba(217, 119, 87, 0.16)' : 'transparent',
                            border: isSelected ? '1px solid rgba(217, 119, 87, 0.35)' : '1px solid transparent',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                            {m.isCloud ? (
                              <Cloud size={13} color="var(--accent-color)" style={{ flexShrink: 0 }} />
                            ) : (
                              <Cpu size={13} color="#38bdf8" style={{ flexShrink: 0 }} />
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                              <span style={{ fontSize: '0.80rem', fontWeight: isSelected ? 600 : 500, color: isSelected ? '#ffffff' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {m.label}
                              </span>
                              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {m.effort}
                              </span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                            <span
                              style={{
                                fontSize: '0.65rem',
                                color: m.isCloud ? 'var(--accent-color)' : '#38bdf8',
                                padding: '2px 5px',
                                borderRadius: '4px',
                                backgroundColor: m.isCloud ? 'rgba(217, 119, 87, 0.12)' : 'rgba(56, 189, 248, 0.12)',
                                fontWeight: 500,
                              }}
                            >
                              {m.isCloud ? 'GROQ Nuvem' : 'Local'}
                            </span>
                            {isSelected && <Check size={13} color="var(--accent-color)" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
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
