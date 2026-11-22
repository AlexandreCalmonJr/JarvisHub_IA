import React, { useRef, useEffect, useState, useMemo } from 'react';
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
  AtSign,
  Slash,
} from 'lucide-react';
import { fetchModels } from '../../api';
import { FormattedChatModel, parseChatModelOptions } from '../../services/chatModels';
import { notify } from '../../shared/common/Toast';
import { getAccountStorageKey } from '../../services/accountScope';
import { ALL_26_AGENTS } from '../../data/agentsCatalog';
import { humanizeLabel } from '../../types';
import { useAssistantIdentity } from '../../context/AssistantIdentityContext';
import { formatAssistantPlaceholder } from '../../services/assistantIdentity';

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

const SLASH_COMMANDS = [
  { slug: '/debate', title: 'Mesa Redonda', desc: 'Debate técnico entre múltiplos especialistas', icon: Users },
  { slug: '/ponytail senior', title: 'Código Enxuto (YAGNI)', desc: 'Simplificação radical sem complexidade', icon: Sparkles },
  { slug: '/audit', title: 'Auditoria de Segurança', desc: 'Análise preventiva de vulnerabilidades e OWASP', icon: ShieldCheck },
  { slug: '/test', title: 'Gerar Testes QA', desc: 'Criação automatizada de testes e validação', icon: CheckCircle2 },
  { slug: '/doc', title: 'Documentar Arquitetura', desc: 'Gera especificações técnicas e documentação', icon: FileText },
  { slug: '/rollback', title: 'Reverter Alterações', desc: 'Desfaz última alteração com segurança', icon: RotateCcw },
];

type TriggerMatch =
  | { type: 'mention'; query: string; startIndex: number; endIndex: number }
  | { type: 'slash'; query: string; startIndex: number; endIndex: number }
  | null;

const detectTrigger = (value: string, cursorPos: number): TriggerMatch => {
  const beforeCursor = value.slice(0, cursorPos);
  const mentionMatch = beforeCursor.match(/(?:^|\s)@([^\s@]*)$/);
  if (mentionMatch) {
    const query = mentionMatch[1];
    const startIndex = beforeCursor.length - query.length - 1;
    return { type: 'mention', query, startIndex, endIndex: cursorPos };
  }
  const slashMatch = beforeCursor.match(/(?:^|\s)\/([^\s/]*)$/);
  if (slashMatch) {
    const query = slashMatch[1];
    const startIndex = beforeCursor.length - query.length - 1;
    return { type: 'slash', query, startIndex, endIndex: cursorPos };
  }
  return null;
};

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

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
  const { assistantName, experienceMode } = useAssistantIdentity();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const inlinePopoverRef = useRef<HTMLDivElement>(null);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [modelOptions, setModelOptions] = useState<RealChatModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<RealChatModel | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [trigger, setTrigger] = useState<TriggerMatch>(null);
  const [highlightIndex, setHighlightIndex] = useState(0);

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
      if (
        inlinePopoverRef.current &&
        !inlinePopoverRef.current.contains(target) &&
        textareaRef.current &&
        !textareaRef.current.contains(target)
      ) {
        setTrigger(null);
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
    const targetId =
      selectedModelId !== undefined
        ? selectedModelId
        : localStorage.getItem(getAccountStorageKey('jarvis_selected_model'));

    let found = modelOptions.find((item) => item.id === targetId);
    if (!found && !selectedModelId && modelOptions.length > 0) {
      found =
        modelOptions.find(
          (item) => item.id.toLowerCase().includes('qwen') || item.id.toLowerCase().includes('llama')
        ) || modelOptions[0];
    }
    setSelectedModel(found || null);
  }, [selectedModelId, modelOptions]);

  useEffect(() => {
    if (!input) {
      setTrigger(null);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  }, [input]);

  const filteredMentions = useMemo(() => {
    if (trigger?.type !== 'mention') return [];
    const q = trigger.query.trim().toLowerCase();
    return ALL_26_AGENTS.filter(
      (a) =>
        !q ||
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.categoryLabel.toLowerCase().includes(q)
    ).slice(0, 6);
  }, [trigger]);

  const filteredCommands = useMemo(() => {
    if (trigger?.type !== 'slash') return [];
    const q = trigger.query.trim().toLowerCase();
    return SLASH_COMMANDS.filter(
      (c) =>
        !q ||
        c.slug.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.desc.toLowerCase().includes(q)
    );
  }, [trigger]);

  const activeSuggestionsCount =
    trigger?.type === 'mention'
      ? filteredMentions.length
      : trigger?.type === 'slash'
        ? filteredCommands.length
        : 0;

  useEffect(() => {
    setHighlightIndex(0);
  }, [trigger?.type, trigger?.query]);

  const applyInlineSelection = (insertedToken: string) => {
    if (!trigger) return;
    const nextValue = `${input.slice(0, trigger.startIndex)}${insertedToken} ${input.slice(trigger.endIndex)}`;
    onInputChange(nextValue);
    setTrigger(null);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const nextCursor = trigger.startIndex + insertedToken.length + 1;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextCursor, nextCursor);
      }
    });
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart ?? val.length;
    onInputChange(val);
    setTrigger(detectTrigger(val, cursor));
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

    setTrigger(null);
    onSubmit(payload, modelOverride ?? selectedModel?.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (trigger && activeSuggestionsCount > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIndex((prev) => (prev + 1) % activeSuggestionsCount);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIndex((prev) => (prev - 1 + activeSuggestionsCount) % activeSuggestionsCount);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setTrigger(null);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (trigger.type === 'mention') {
          const agent = filteredMentions[highlightIndex];
          if (agent) applyInlineSelection(`@${agent.name}`);
        } else if (trigger.type === 'slash') {
          const cmd = filteredCommands[highlightIndex];
          if (cmd) applyInlineSelection(cmd.slug);
        }
        return;
      }
    }

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

  const insertTriggerSymbol = (symbol: '@' | '/') => {
    const needsSpace = input.length > 0 && !/\s$/.test(input);
    const nextVal = `${input}${needsSpace ? ' ' : ''}${symbol}`;
    onInputChange(nextVal);
    setTrigger(detectTrigger(nextVal, nextVal.length));
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextVal.length, nextVal.length);
      }
    });
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
            padding: '6px 14px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--accent-soft)',
            border: '1px solid var(--border-accent)',
            fontSize: '0.76rem',
            color: 'var(--text-primary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FolderGit2 size={14} color="var(--accent-light)" />
            <span>
              Projeto ativo: <strong>{activeProjectName || humanizeLabel(activeProjectId)}</strong> · ações atuarão neste diretório
            </span>
          </div>
          <button
            type="button"
            onClick={onDetachProject}
            className="btn btn-danger-ghost btn-xs"
          >
            Desanexar
          </button>
        </div>
      )}

      {/* Popover inline de Autocomplete para @especialistas e /comandos */}
      {trigger && activeSuggestionsCount > 0 && (
        <div
          ref={inlinePopoverRef}
          role="listbox"
          aria-label={trigger.type === 'mention' ? 'Selecionar especialista' : 'Selecionar comando rápido'}
          className="jarvis-popover"
          style={{
            position: 'absolute',
            ...(isFloatingCenter
              ? { top: 'calc(100% + 8px)' }
              : { bottom: 'calc(100% + 8px)' }),
            left: 0,
            right: 0,
            maxWidth: '420px',
            maxHeight: '260px',
            overflowY: 'auto',
            zIndex: 220,
          }}
        >
          <div className="jarvis-popover__label">
            <span>{trigger.type === 'mention' ? 'Chamar especialista (@)' : 'Comandos rápidos (/)'}</span>
            <span>↑↓ navegar · Enter selecionar</span>
          </div>

          {trigger.type === 'mention' &&
            filteredMentions.map((agent, idx) => (
              <button
                key={agent.id}
                type="button"
                role="option"
                aria-selected={idx === highlightIndex}
                onMouseEnter={() => setHighlightIndex(idx)}
                onClick={() => applyInlineSelection(`@${agent.name}`)}
                className={`btn btn-ghost btn-sm btn-block btn-start ${idx === highlightIndex ? 'is-active' : ''}`}
              >
                <span
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '7px',
                    backgroundColor: `${agent.color}22`,
                    border: `1px solid ${agent.color}44`,
                    color: agent.color,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {getInitials(agent.name)}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0, flex: 1 }}>
                  <span style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.82rem' }}>
                    {agent.name}
                  </span>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      color: 'var(--text-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '100%',
                    }}
                  >
                    {agent.categoryLabel} · {agent.mission}
                  </span>
                </div>
              </button>
            ))}

          {trigger.type === 'slash' &&
            filteredCommands.map((cmd, idx) => {
              const IconComponent = cmd.icon;
              return (
                <button
                  key={cmd.slug}
                  type="button"
                  role="option"
                  aria-selected={idx === highlightIndex}
                  onMouseEnter={() => setHighlightIndex(idx)}
                  onClick={() => applyInlineSelection(cmd.slug)}
                  className={`btn btn-ghost btn-sm btn-block btn-start ${idx === highlightIndex ? 'is-active' : ''}`}
                >
                  <div
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '7px',
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border-color)',
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <IconComponent size={13} color="var(--accent-light)" />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0, flex: 1 }}>
                    <span style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.82rem' }}>
                      <code style={{ fontFamily: 'var(--font-mono)', marginRight: '6px', color: 'var(--accent-light)' }}>
                        {cmd.slug}
                      </code>
                      {cmd.title}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {cmd.desc}
                    </span>
                  </div>
                </button>
              );
            })}
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
          backgroundColor: isDragging ? 'var(--accent-soft)' : undefined,
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
                  backgroundColor: 'var(--accent-soft)',
                  border: '1px solid var(--border-accent)',
                  fontSize: '0.74rem',
                  color: 'var(--text-primary)',
                }}
              >
                <FileText size={13} color="var(--accent-light)" />
                <span>
                  {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  className="btn btn-ghost btn-icon-sm"
                  title="Remover anexo"
                  aria-label={`Remover anexo ${file.name}`}
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
          placeholder={
            isListening
              ? 'Ouvindo... pode falar que o texto será transcrito no chat...'
              : formatAssistantPlaceholder(assistantName, experienceMode)
          }
          aria-label={`Mensagem para ${assistantName}`}
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

        {/* Linha Inferior com Botão +, Atalhos @ e /, Seletor de Modelo, Microfone e Envio */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            paddingTop: '4px',
          }}
        >
          {/* Lado Esquerdo: Botão + e atalhos rápidos @ e / */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div ref={plusMenuRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => {
                  setShowPlusMenu((prev) => !prev);
                  setShowModelMenu(false);
                }}
                disabled={loading}
                className={`btn btn-secondary btn-icon btn-pill ${showPlusMenu ? 'is-active' : ''}`}
                title="Anexar projetos, arquivos ou acionar comandos rápidos"
                aria-label="Anexar projetos, arquivos ou acionar comandos rápidos"
              >
                <Plus size={16} />
              </button>

              {/* Menu Popover do Botão + */}
              {showPlusMenu && (
                <div
                  className="jarvis-popover"
                  style={{
                    position: 'absolute',
                    bottom: '44px',
                    left: 0,
                    width: '320px',
                    zIndex: 200,
                  }}
                >
                  <div className="jarvis-popover__label">
                    <span>Anexos & Contexto</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setShowPlusMenu(false);
                      fileInputRef.current?.click();
                    }}
                    className="btn btn-ghost btn-sm btn-block btn-start"
                  >
                    <div style={{ width: '24px', height: '24px', borderRadius: '6px', backgroundColor: 'var(--bg-surface)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      <Paperclip size={13} color="var(--text-secondary)" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                      <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Anexar Arquivo</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Código, logs, texto ou PDF</span>
                    </div>
                  </button>

                  {onOpenProjectModal && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowPlusMenu(false);
                        onOpenProjectModal();
                      }}
                      className="btn btn-ghost btn-sm btn-block btn-start"
                    >
                      <div style={{ width: '24px', height: '24px', borderRadius: '6px', backgroundColor: 'var(--bg-surface)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        <FolderGit2 size={13} color="var(--text-secondary)" />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Anexar Projeto do Workspace</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Vincular repositório ao chat</span>
                      </div>
                    </button>
                  )}

                  <div className="jarvis-popover__divider" />

                  <div className="jarvis-popover__label">
                    <span>Ações Rápidas & Especialistas</span>
                  </div>

                  {SLASH_COMMANDS.map((cmd) => {
                    const IconComponent = cmd.icon;
                    return (
                      <button
                        key={cmd.slug}
                        type="button"
                        onClick={() => handleSelectCommand(cmd.slug)}
                        className="btn btn-ghost btn-sm btn-block btn-start"
                      >
                        <div
                          style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '6px',
                            backgroundColor: 'var(--bg-surface)',
                            display: 'grid',
                            placeItems: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <IconComponent size={13} color="var(--text-secondary)" />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                            {cmd.title}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {cmd.desc}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => insertTriggerSymbol('@')}
              disabled={loading}
              className="btn btn-ghost btn-xs hide-mobile"
              title="Chamar um especialista (@)"
            >
              <AtSign size={13} />
              <span>Especialista</span>
            </button>

            <button
              type="button"
              onClick={() => insertTriggerSymbol('/')}
              disabled={loading}
              className="btn btn-ghost btn-xs hide-mobile"
              title="Inserir comando rápido (/)"
            >
              <Slash size={13} />
              <span>Comandos</span>
            </button>
          </div>

          {/* Lado Direito: Seletor de Modelo, Microfone e Botão de Envio */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Seletor de Modelo */}
            <div ref={modelMenuRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => {
                  setShowModelMenu((prev) => !prev);
                  setShowPlusMenu(false);
                }}
                className="openbot-model-pill btn-pill"
                title="Alternar modelo de IA ativo"
              >
                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                  {selectedModel?.label || 'Automático (Maestro)'}
                </span>
                <span className="hide-mobile" style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                  {selectedModel?.effort || 'Seleção inteligente'}
                </span>
                <ChevronDown size={12} color="var(--text-muted)" />
              </button>

              {/* Dropdown de Modelos */}
              {showModelMenu && (
                <div
                  className="jarvis-popover"
                  style={{
                    position: 'absolute',
                    bottom: '42px',
                    right: 0,
                    width: '320px',
                    zIndex: 200,
                  }}
                >
                  <div className="jarvis-popover__label">
                    <span>Modelos disponíveis</span>
                    <span className="tabular-nums">{modelOptions.length + 1} opções</span>
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
                      } catch {}
                      setShowModelMenu(false);
                    }}
                    className={`btn btn-ghost btn-sm btn-block btn-between ${selectedModel === null ? 'is-active' : ''}`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <Sparkles size={14} color="var(--accent-light)" style={{ flexShrink: 0 }} />
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                          Automático (Maestro)
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          Roteamento dinâmico · Recomendado
                        </span>
                      </div>
                    </div>
                    {selectedModel === null && <Check size={13} color="var(--accent-light)" />}
                  </button>

                  <div className="jarvis-popover__divider" />

                  {/* Lista com scroll dos Modelos */}
                  <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {modelOptions.length === 0 && (
                      <div style={{ padding: '8px', color: 'var(--text-muted)', fontSize: '0.74rem' }}>
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
                            } catch {}
                            setShowModelMenu(false);
                          }}
                          className={`btn btn-ghost btn-sm btn-block btn-between ${isSelected ? 'is-active' : ''}`}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                            {m.isCloud ? (
                              <Cloud size={13} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
                            ) : (
                              <Cpu size={13} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                              <span style={{ fontSize: '0.8rem', fontWeight: isSelected ? 600 : 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {m.label}
                              </span>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {m.isCloud ? 'Nuvem' : 'Local'} · {m.effort}
                              </span>
                            </div>
                          </div>
                          {isSelected && <Check size={13} color="var(--accent-light)" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Indicador de Ditado por Voz */}
            {isListening && (
              <span
                style={{
                  fontSize: '0.74rem',
                  color: 'var(--text-primary)',
                  fontWeight: 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--danger-color)',
                    display: 'inline-block',
                  }}
                />
                Ouvindo…
              </span>
            )}

            <button
              type="button"
              onClick={onToggleVoiceInput}
              disabled={loading}
              className={`btn btn-icon btn-pill ${isListening ? 'btn-danger' : 'btn-ghost'}`}
              title={isListening ? 'Clique para encerrar ditado' : 'Falar (digitação por voz em tempo real)'}
              aria-label={isListening ? 'Encerrar ditado' : 'Iniciar ditado por voz'}
            >
              {isListening ? <MicOff size={15} /> : <Mic size={15} />}
            </button>

            {/* Botão de Envio ou Parada */}
            {loading ? (
              <button
                type="button"
                onClick={onStopGeneration}
                className="btn btn-danger btn-icon btn-pill"
                title="Interromper geração"
                aria-label="Interromper geração"
              >
                <Square size={13} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleActualSubmit(undefined, selectedModel?.id)}
                disabled={!input.trim() && attachedFiles.length === 0}
                className="btn btn-primary btn-icon btn-pill"
                title="Enviar mensagem (Enter)"
                aria-label="Enviar mensagem"
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
