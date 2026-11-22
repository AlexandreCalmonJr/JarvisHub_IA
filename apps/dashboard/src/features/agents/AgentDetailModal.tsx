import React, { useState, useEffect } from 'react';
import { Modal } from '../../shared/common/Modal';
import {
  AgentInfo,
  AgentMemoryItem,
  getAgentLabel,
  getMemoryCategoryLabel,
  getToolLabel,
  getToolDescription,
  humanizeLabel,
} from '../../types';
import {
  updateAgentConfig,
  fetchAgentMemories,
  saveAgentMemory,
  deleteAgentMemory,
  fetchModels,
} from '../../api';
import {
  Brain,
  Save,
  Trash2,
  Plus,
  Cpu,
  Wrench,
  Sparkles,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Lock,
  PenLine,
} from 'lucide-react';

interface AgentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  agent: AgentInfo;
  onUpdated?: () => void;
  onOpenPlayground?: (agent: AgentInfo) => void;
}

const ALL_TOOLS = [
  'read_file',
  'list_directory',
  'run_tests',
  'run_linter',
  'propose_patch',
  'scan_secrets',
  'inspect_diff',
  'inspect_manifest',
  'inspect_dataset',
  'validate_data',
  'delegate_agent',
  'request_approval',
  'query_audit',
];

export const AgentDetailModal: React.FC<AgentDetailModalProps> = ({
  isOpen,
  onClose,
  agent,
  onUpdated,
  onOpenPlayground,
}) => {
  const [activeTab, setActiveTab] = useState<'config' | 'memories'>('config');
  const [installedLocalModels, setInstalledLocalModels] = useState<any[]>([]);
  const [onlineModels, setOnlineModels] = useState<any[]>([]);
  const [hybridGatewayInfo, setHybridGatewayInfo] = useState<any>(null);

  const [systemPrompt, setSystemPrompt] = useState(agent.system_prompt || '');
  const [preferredModel, setPreferredModel] = useState(agent.preferred_model || 'auto_hybrid');
  const [allowedTools, setAllowedTools] = useState<string[]>(agent.allowed_tools || []);
  const [isReadOnly, setIsReadOnly] = useState<boolean>(agent.is_read_only ?? true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const [memories, setMemories] = useState<AgentMemoryItem[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [newCat, setNewCat] = useState('coding_style');
  const [newKey, setNewKey] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newImportance, setNewImportance] = useState(3);
  const [addingMemory, setAddingMemory] = useState(false);

  useEffect(() => {
    setSystemPrompt(agent.system_prompt || '');
    setPreferredModel(agent.preferred_model || 'auto_hybrid');
    setAllowedTools(agent.allowed_tools || []);
    setIsReadOnly(agent.is_read_only ?? true);
    setFeedbackMsg(null);
  }, [agent]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const data = await fetchModels();
        if (!isMounted) return;
        if (data?.models && Array.isArray(data.models)) {
          setInstalledLocalModels(data.models);
        }
        if (data?.online_models && Array.isArray(data.online_models)) {
          setOnlineModels(data.online_models);
        }
        if (data?.hybrid_gateway) {
          setHybridGatewayInfo(data.hybrid_gateway);
        }
      } catch (e) {
        console.warn('Falha ao carregar modelos para o modal do agente:', e);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const loadMemories = async () => {
    setLoadingMemories(true);
    try {
      const data = await fetchAgentMemories(agent.role);
      setMemories(data);
    } catch (e) {
      console.error('Falha ao carregar memórias:', e);
    } finally {
      setLoadingMemories(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'memories') {
      loadMemories();
    }
  }, [activeTab, agent.role]);

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    setFeedbackMsg(null);
    try {
      await updateAgentConfig(agent.role, {
        system_prompt: systemPrompt,
        preferred_model: preferredModel,
        allowed_tools: allowedTools,
        is_read_only: isReadOnly,
      });
      setFeedbackMsg({ text: 'Configuração salva com sucesso.', type: 'success' });
      if (onUpdated) onUpdated();
    } catch (e: any) {
      setFeedbackMsg({ text: e.message || 'Erro ao salvar configuração', type: 'error' });
    } finally {
      setSavingConfig(false);
    }
  };

  const toggleTool = (tool: string) => {
    if (allowedTools.includes(tool)) {
      setAllowedTools(allowedTools.filter((t) => t !== tool));
    } else {
      setAllowedTools([...allowedTools, tool]);
    }
  };

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newContent.trim()) return;
    setAddingMemory(true);
    try {
      await saveAgentMemory(agent.role, {
        category: newCat,
        key: newKey.trim(),
        content: newContent.trim(),
        importance: newImportance,
      });
      setNewKey('');
      setNewContent('');
      await loadMemories();
    } catch (err: any) {
      console.error('Erro ao adicionar memória:', err);
    } finally {
      setAddingMemory(false);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    try {
      await deleteAgentMemory(agent.role, id);
      setMemories(memories.filter((m) => m.id !== id));
    } catch (err) {
      console.error('Erro ao excluir memória:', err);
    }
  };

  const isCloudModel =
    preferredModel.includes('gpt') ||
    preferredModel.includes('gemini') ||
    preferredModel.includes('deepseek') ||
    preferredModel.includes('claude') ||
    preferredModel.includes('versatile');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={getAgentLabel(agent.role)}
      subtitle={agent.mission}
      icon={<Brain size={20} color="var(--accent-light)" />}
      maxWidth="xl"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '10px', flexWrap: 'wrap' }}>
          <div>
            {onOpenPlayground && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  onClose();
                  onOpenPlayground(agent);
                }}
              >
                <Sparkles size={14} color="var(--accent-light)" />
                <span>Abrir no Playground</span>
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
              Fechar
            </button>
            {activeTab === 'config' && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleSaveConfig}
                disabled={savingConfig}
              >
                <Save size={14} />
                <span>{savingConfig ? 'Salvando…' : 'Salvar Alterações'}</span>
              </button>
            )}
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {feedbackMsg && (
          <div
            role={feedbackMsg.type === 'error' ? 'alert' : 'status'}
            className={`jarvis-callout ${
              feedbackMsg.type === 'success' ? 'jarvis-callout--success' : 'jarvis-callout--danger'
            }`}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            {feedbackMsg.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            <span>{feedbackMsg.text}</span>
          </div>
        )}

        <div className="jarvis-segmented" role="tablist" style={{ alignSelf: 'flex-start' }}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'config'}
            onClick={() => setActiveTab('config')}
            className={`jarvis-segmented-btn ${activeTab === 'config' ? 'is-active' : ''}`}
          >
            <Cpu size={14} />
            <span>Configuração & Raciocínio</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'memories'}
            onClick={() => setActiveTab('memories')}
            className={`jarvis-segmented-btn ${activeTab === 'memories' ? 'is-active' : ''}`}
          >
            <BookOpen size={14} />
            <span>Memória Episódica ({memories.length})</span>
          </button>
        </div>

        {activeTab === 'config' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label className="user-profile-field-label" htmlFor="agent-preferred-model" style={{ marginBottom: 0 }}>
                  Modelo de IA Preferencial
                </label>
                {preferredModel !== 'auto_hybrid' && (
                  <button
                    type="button"
                    onClick={() => setPreferredModel('auto_hybrid')}
                    className="btn btn-ghost btn-xs"
                    title="Restaurar para o roteamento híbrido dinâmico padrão"
                  >
                    <Sparkles size={12} />
                    <span>Usar Padrão Híbrido</span>
                  </button>
                )}
              </div>
              <select
                id="agent-preferred-model"
                value={preferredModel}
                onChange={(e) => setPreferredModel(e.target.value)}
                className="jarvis-select"
              >
                <optgroup label="Modo Híbrido (Recomendado)">
                  <option value="auto_hybrid">Roteamento Híbrido Automático (Padrão do Sistema)</option>
                </optgroup>
                <optgroup label="Modelos Locais Instalados (Ollama)">
                  {installedLocalModels.length > 0 ? (
                    installedLocalModels.map((m: any) => (
                      <option key={m.name} value={m.name}>
                        {m.name} (Local — {m.role || m.parameter_size || 'Ollama'})
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>
                      Nenhum modelo local confirmado pela API
                    </option>
                  )}
                </optgroup>
                <optgroup
                  label={`Modelos Online (${
                    hybridGatewayInfo?.provider ? hybridGatewayInfo.provider.toUpperCase() : 'Gateway Híbrido'
                  })`}
                >
                  {onlineModels.length > 0 ? (
                    onlineModels.map((om: any) => (
                      <option key={om.name} value={om.name}>
                        {om.label || om.name}
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>
                      Nenhum modelo online confirmado pela API
                    </option>
                  )}
                </optgroup>
                {preferredModel &&
                  preferredModel !== 'auto_hybrid' &&
                  !installedLocalModels.some((m) => m.name === preferredModel) &&
                  !onlineModels.some((om) => om.name === preferredModel) && (
                    <optgroup label="Modelo atualmente configurado">
                      <option value={preferredModel}>
                        {preferredModel} (não confirmado na lista atual)
                      </option>
                    </optgroup>
                  )}
              </select>

              <div
                className={`jarvis-callout ${
                  preferredModel === 'auto_hybrid'
                    ? 'jarvis-callout--info'
                    : isCloudModel
                    ? ''
                    : 'jarvis-callout--success'
                }`}
                style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem' }}
              >
                <Sparkles size={14} style={{ flexShrink: 0 }} />
                <span>
                  {preferredModel === 'auto_hybrid'
                    ? `Roteamento Dinâmico: combina modelo local para tarefas cotidianas e provedor online (${
                        hybridGatewayInfo?.provider?.toUpperCase() || 'Model Manager'
                      }) para raciocínio complexo conforme políticas de segurança.`
                    : isCloudModel
                    ? 'Execução em Nuvem: utiliza o Gateway Híbrido com inspeção DLP e auditoria de tokens.'
                    : 'Execução Soberana Local: executa no Ollama local sem envio de dados para a internet.'}
                </span>
              </div>
            </div>

            <div>
              <label className="user-profile-field-label">Governança de Permissão de Operação</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsReadOnly(true)}
                  aria-pressed={isReadOnly}
                  className={`jarvis-choice-card ${isReadOnly ? 'is-active' : ''}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      <Lock size={14} color={isReadOnly ? 'var(--accent-light)' : 'var(--text-muted)'} />
                      <span>Somente Leitura (Read-Only)</span>
                    </span>
                    {isReadOnly && (
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--accent-light)' }}>Ativo</span>
                    )}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    O especialista inspeciona, analisa e orienta sem capacidade de modificar arquivos no disco.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsReadOnly(false)}
                  aria-pressed={!isReadOnly}
                  className={`jarvis-choice-card ${!isReadOnly ? 'is-active' : ''}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      <PenLine size={14} color={!isReadOnly ? '#fbbf24' : 'var(--text-muted)'} />
                      <span>Proposição de Escrita (Read-Write)</span>
                    </span>
                    {!isReadOnly && (
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#fbbf24' }}>Ativo</span>
                    )}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    Pode propor patches e novos componentes sempre sob aprovação humana supervisionada.
                  </span>
                </button>
              </div>
            </div>

            <div>
              <label className="user-profile-field-label" htmlFor="agent-system-prompt">
                Diretrizes de Raciocínio & Prompt de Sistema
              </label>
              <textarea
                id="agent-system-prompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={8}
                className="jarvis-textarea"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', resize: 'vertical' }}
                placeholder="Diretrizes do especialista, protocolo cognitivo e regras técnicas..."
              />
            </div>

            <div>
              <label
                className="user-profile-field-label"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Wrench size={14} color="var(--accent-light)" />
                <span>Matriz de Ferramentas Autorizadas (Sandbox ToolGateway)</span>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))', gap: '8px' }}>
                {ALL_TOOLS.map((t) => {
                  const isChecked = allowedTools.includes(t);
                  return (
                    <label
                      key={t}
                      title={getToolDescription(t)}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-md)',
                        background: isChecked ? 'var(--accent-soft)' : 'var(--bg-tertiary)',
                        border: `1px solid ${isChecked ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
                        cursor: 'pointer',
                        fontSize: '0.78rem',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleTool(t)}
                        style={{ accentColor: 'var(--accent-color)', marginTop: '2px' }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{getToolLabel(t)}</span>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontFamily: 'var(--font-mono)',
                            color: isChecked ? 'var(--accent-light)' : 'var(--text-muted)',
                          }}
                        >
                          {t}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'memories' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              Regras e padrões aprendidos pelo especialista ao longo de tarefas e interações. Injetadas automaticamente
              em seus prompts de raciocínio.
            </p>

            <form onSubmit={handleAddMemory} className="jarvis-settings-subcard" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Adicionar Nova Diretriz / Aprendizado
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
                <select
                  aria-label="Categoria da memória"
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                  className="jarvis-select"
                >
                  <option value="coding_style">Estilo de Código</option>
                  <option value="test_preference">Padrão de Teste</option>
                  <option value="architecture_rule">Regra Arquitetural</option>
                  <option value="security_policy">Diretriz de Segurança</option>
                  <option value="user_preference">Preferência do Usuário</option>
                </select>
                <input
                  type="text"
                  aria-label="Chave única"
                  placeholder="Chave única (ex: pydantic_v2_models)"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  className="jarvis-input"
                />
                <select
                  aria-label="Importância"
                  value={newImportance}
                  onChange={(e) => setNewImportance(Number(e.target.value))}
                  className="jarvis-select"
                >
                  <option value={5}>Peso 5 (Crítico)</option>
                  <option value={4}>Peso 4 (Alto)</option>
                  <option value={3}>Peso 3 (Médio)</option>
                  <option value={2}>Peso 2 (Baixo)</option>
                  <option value={1}>Peso 1 (Informativo)</option>
                </select>
              </div>
              <input
                type="text"
                aria-label="Conteúdo da diretriz"
                placeholder="Conteúdo da diretriz aprendida (ex: Sempre usar ConfigDict em schemas Pydantic)"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                className="jarvis-input"
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="submit"
                  className="btn btn-secondary btn-sm"
                  disabled={addingMemory || !newKey.trim() || !newContent.trim()}
                >
                  <Plus size={14} />
                  <span>{addingMemory ? 'Salvando…' : 'Adicionar Aprendizado'}</span>
                </button>
              </div>
            </form>

            {loadingMemories ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                Carregando memórias do agente…
              </div>
            ) : memories.length === 0 ? (
              <div className="jarvis-empty-state" style={{ padding: '24px' }}>
                <span style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                  Nenhuma memória episódica registrada para este especialista ainda.
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
                {memories.map((m) => (
                  <div
                    key={m.id}
                    className="jarvis-settings-subcard"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
                      <div className="meta-inline jarvis-tabular" style={{ fontSize: '0.76rem' }}>
                        <span style={{ color: 'var(--accent-light)', fontWeight: 600 }}>
                          {getMemoryCategoryLabel(m.category)}
                        </span>
                        <strong style={{ color: 'var(--text-primary)' }} title={m.key}>
                          {humanizeLabel(m.key)}
                        </strong>
                        <span style={{ color: 'var(--text-muted)' }}>Peso {m.importance}/5</span>
                      </div>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{m.content}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteMemory(m.id)}
                      className="btn btn-danger-ghost btn-icon-sm"
                      title="Excluir memória"
                      aria-label="Excluir memória"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
