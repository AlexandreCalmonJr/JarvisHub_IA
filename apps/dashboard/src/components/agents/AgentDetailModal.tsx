import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { AgentInfo, AgentMemoryItem, getAgentLabel, getToolLabel, getToolDescription } from '../../types';
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
  // Estados de modelos dinâmicos (Locais e Online do Gateway Híbrido)
  const [installedLocalModels, setInstalledLocalModels] = useState<any[]>([]);
  const [onlineModels, setOnlineModels] = useState<any[]>([]);
  const [hybridGatewayInfo, setHybridGatewayInfo] = useState<any>(null);
  // Estado de configuração
  const [systemPrompt, setSystemPrompt] = useState(agent.system_prompt || '');
  const [preferredModel, setPreferredModel] = useState(agent.preferred_model || 'auto_hybrid');
  const [allowedTools, setAllowedTools] = useState<string[]>(agent.allowed_tools || []);
  const [isReadOnly, setIsReadOnly] = useState<boolean>(agent.is_read_only ?? true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  // Estado de memórias episódicas
  const [memories, setMemories] = useState<AgentMemoryItem[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [newCat, setNewCat] = useState('coding_style');
  const [newKey, setNewKey] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newImportance, setNewImportance] = useState(3);
  const [addingMemory, setAddingMemory] = useState(false);
  useEffect(() => {
    setSystemPrompt(agent.system_prompt || '');
    // Modo híbrido é o padrão para o especialista se não estiver travado em um modelo específico
    const initialModel = agent.preferred_model || 'auto_hybrid';
    setPreferredModel(initialModel);
    setAllowedTools(agent.allowed_tools || []);
    setFeedbackMsg(null);
  }, [agent]);
  // Carrega modelos dinâmicos do backend (ModelManager e Gateway Híbrido)
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
      setFeedbackMsg({ text: 'Configuração salva com sucesso!', type: 'success' });
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
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span>{getAgentLabel(agent.role)}</span>
          <span
            style={{
              fontSize: '0.75rem',
              padding: '2px 8px',
              borderRadius: '6px',
              backgroundColor: 'var(--accent-glow)',
              color: 'var(--accent-color)',
              border: '1px solid var(--border-accent)',
              fontWeight: 600,
            }}
          >
            Especialista Ativo
          </span>
        </div>
      }
      subtitle={agent.mission}
      icon={<Brain size={22} color="var(--accent-color)" />}
      maxWidth="xl"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div>
            {onOpenPlayground && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  onClose();
                  onOpenPlayground(agent);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Sparkles size={15} color="var(--accent-color)" />
                Abrir no Playground
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Fechar
            </button>
            {activeTab === 'config' && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveConfig}
                disabled={savingConfig}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Save size={15} />
                {savingConfig ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {/* Feedback Alert */}
        {feedbackMsg && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.86rem',
              backgroundColor:
                feedbackMsg.type === 'success' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
              border: `1px solid ${feedbackMsg.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              color: feedbackMsg.type === 'success' ? '#34d399' : '#f87171',
            }}
          >
            {feedbackMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {feedbackMsg.text}
          </div>
        )}
        {/* Tabs de Navegação */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
          <button
            onClick={() => setActiveTab('config')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.88rem',
              fontWeight: 600,
              backgroundColor: activeTab === 'config' ? 'var(--accent-glow)' : 'transparent',
              color: activeTab === 'config' ? 'var(--accent-color)' : 'var(--text-secondary)',
            }}
          >
            <Cpu size={16} />
            Configuração & Raciocínio
          </button>
          <button
            onClick={() => setActiveTab('memories')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.88rem',
              fontWeight: 600,
              backgroundColor: activeTab === 'memories' ? 'var(--accent-glow)' : 'transparent',
              color: activeTab === 'memories' ? 'var(--accent-color)' : 'var(--text-secondary)',
            }}
          >
            <BookOpen size={16} />
            Memória Episódica ({memories.length})
          </button>
        </div>
        {/* Conteúdo Aba: Configuração */}
        {activeTab === 'config' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Modelo Preferencial com Suporte a Modo Híbrido e Model Manager */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Modelo de IA Preferencial para este Especialista:
                </label>
                {preferredModel !== 'auto_hybrid' && (
                  <button
                    type="button"
                    onClick={() => setPreferredModel('auto_hybrid')}
                    className="btn btn-ghost"
                    style={{ fontSize: '0.72rem', color: 'var(--accent-color)', padding: '2px 6px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    title="Restaurar para o roteamento híbrido dinâmico padrão"
                  >
                    <Sparkles size={12} />
                    Usar Padrão Híbrido
                  </button>
                )}
              </div>
              <select
                value={preferredModel}
                onChange={(e) => setPreferredModel(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '0.88rem',
                  outline: 'none',
                }}
              >
                {/* Padrão do Sistema: Modo Híbrido */}
                <optgroup label="🌐 Modo Híbrido (Padrão Recomendado)">
                  <option value="auto_hybrid">
                    🌐 Roteamento Híbrido Automático (Padrão do Sistema — Recomendado)
                  </option>
                </optgroup>
                {/* Modelos Locais Instalados (Ollama) */}
                <optgroup label="💻 Modelos Locais Instalados no seu Computador (Ollama)">
                  {installedLocalModels.length > 0 ? (
                    installedLocalModels.map((m: any) => (
                      <option key={m.name} value={m.name}>
                        💻 {m.name} (Local — {m.role || m.parameter_size || 'Ollama'})
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>Nenhum modelo local confirmado pela API</option>
                  )}
                </optgroup>
                {/* Modelos Online Configurados no Model Manager / Gateway Híbrido */}
                <optgroup label={`☁️ Modelos Online (${hybridGatewayInfo?.provider ? hybridGatewayInfo.provider.toUpperCase() : 'Gateway Híbrido'})`}>
                  {onlineModels.length > 0 ? (
                    onlineModels.map((om: any) => (
                      <option key={om.name} value={om.name}>
                        ☁️ {om.label || om.name}
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>Nenhum modelo online confirmado pela API</option>
                  )}
                </optgroup>
                {/* Opção Personalizada se o modelo atual não estiver listado */}
                {preferredModel &&
                  preferredModel !== 'auto_hybrid' &&
                  !installedLocalModels.some((m) => m.name === preferredModel) &&
                  !onlineModels.some((om) => om.name === preferredModel) &&
                  (
                    <optgroup label="⚙️ Modelo atualmente configurado">
                      <option value={preferredModel}>
                        ⚙️ {preferredModel} (não confirmado na lista atual)
                      </option>
                    </optgroup>
                )}
              </select>
              {/* Card Explicativo de Contexto Operacional */}
              <div
                style={{
                  marginTop: '8px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  backgroundColor:
                    preferredModel === 'auto_hybrid'
                      ? 'rgba(56, 189, 248, 0.08)'
                      : preferredModel.includes('gpt') ||
                        preferredModel.includes('gemini') ||
                        preferredModel.includes('deepseek') ||
                        preferredModel.includes('claude') ||
                        preferredModel.includes('versatile')
                      ? 'rgba(168, 85, 247, 0.08)'
                      : 'rgba(52, 211, 153, 0.08)',
                  border: `1px solid ${
                    preferredModel === 'auto_hybrid'
                      ? 'rgba(56, 189, 248, 0.25)'
                      : preferredModel.includes('gpt') ||
                        preferredModel.includes('gemini') ||
                        preferredModel.includes('deepseek') ||
                        preferredModel.includes('claude') ||
                        preferredModel.includes('versatile')
                      ? 'rgba(168, 85, 247, 0.25)'
                      : 'rgba(52, 211, 153, 0.25)'
                  }`,
                  fontSize: '0.78rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Sparkles
                  size={14}
                  color={
                    preferredModel === 'auto_hybrid'
                      ? '#38bdf8'
                      : preferredModel.includes('gpt') ||
                        preferredModel.includes('gemini') ||
                        preferredModel.includes('deepseek') ||
                        preferredModel.includes('claude') ||
                        preferredModel.includes('versatile')
                      ? '#c084fc'
                      : '#34d399'
                  }
                />
                <span style={{ color: 'var(--text-secondary)' }}>
                  {preferredModel === 'auto_hybrid'
                    ? `Roteamento Dinâmico: O agente utilizará o Gateway Híbrido, acionando o modelo local ideal para tarefas cotidianas e o provedor online (${hybridGatewayInfo?.provider?.toUpperCase() || 'Model Manager'}) para raciocínio complexo conforme cotas e regras de segurança.`
                    : preferredModel.includes('gpt') ||
                      preferredModel.includes('gemini') ||
                      preferredModel.includes('deepseek') ||
                      preferredModel.includes('claude') ||
                      preferredModel.includes('versatile')
                    ? 'Execução em Nuvem: O agente utilizará o Gateway Híbrido com inspeção de segurança cibernética DLP e auditoria de tokens.'
                    : 'Execução Soberana Local: O agente executará 100% no Ollama do seu computador sem enviar dados para a internet.'}
                </span>
              </div>
            </div>
            {/* Governança Prática de Permissões (Read-Only vs Proposição de Escrita) */}
            <div>
              <label style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '8px' }}>
                Governança de Permissão de Operação:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
                <div
                  onClick={() => setIsReadOnly(true)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    border: `1.5px solid ${isReadOnly ? 'rgba(56, 189, 248, 0.6)' : 'var(--border-color)'}`,
                    backgroundColor: isReadOnly ? 'rgba(56, 189, 248, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.1rem' }}>🔒</span>
                      <strong style={{ fontSize: '0.86rem', color: isReadOnly ? '#38bdf8' : 'var(--text-primary)' }}>
                        Somente Leitura (Read-Only)
                      </strong>
                    </div>
                    {isReadOnly && (
                      <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', backgroundColor: '#38bdf8', color: '#000', fontWeight: 700 }}>
                        ATIVO
                      </span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    O especialista inspeciona, analisa e orienta, sem capacidade de modificar ou gravar arquivos no disco.
                  </p>
                </div>

                <div
                  onClick={() => setIsReadOnly(false)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    border: `1.5px solid ${!isReadOnly ? 'rgba(245, 158, 11, 0.6)' : 'var(--border-color)'}`,
                    backgroundColor: !isReadOnly ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.1rem' }}>✍️</span>
                      <strong style={{ fontSize: '0.86rem', color: !isReadOnly ? '#f59e0b' : 'var(--text-primary)' }}>
                        Proposição de Escrita (Read-Write)
                      </strong>
                    </div>
                    {!isReadOnly && (
                      <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', backgroundColor: '#f59e0b', color: '#000', fontWeight: 700 }}>
                        ATIVO
                      </span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    O especialista pode propor alterações de arquivos e novos componentes (sempre com aprovação humana supervisionada).
                  </p>
                </div>
              </div>
            </div>

            {/* Prompt de Sistema / Raciocínio */}
            <div>
              <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>
                Diretrizes de Raciocínio & Prompt de Sistema:
              </label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={9}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '0.84rem',
                  fontFamily: 'monospace',
                  lineHeight: '1.5',
                  outline: 'none',
                  resize: 'vertical',
                }}
                placeholder="Diretrizes do especialista, protocolo cognitivo e regras técnicas..."
              />
            </div>
            {/* Ferramentas Autorizadas */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>
                <Wrench size={15} color="#818cf8" />
                Matriz de Ferramentas Autorizadas (Sandbox ToolGateway):
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
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
                        borderRadius: '6px',
                        backgroundColor: isChecked ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                        border: `1px solid ${isChecked ? 'rgba(99, 102, 241, 0.35)' : 'var(--border-color)'}`,
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        color: isChecked ? '#c7d2fe' : 'var(--text-secondary)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleTool(t)}
                        style={{ accentColor: '#6366f1', marginTop: '2px' }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontWeight: 600, color: isChecked ? '#ffffff' : 'var(--text-primary)' }}>
                          {getToolLabel(t)}
                        </span>
                        <span style={{ fontSize: '0.70rem', fontFamily: 'monospace', color: isChecked ? '#a5b4fc' : 'var(--text-muted)' }}>
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
        {/* Conteúdo Aba: Memórias Episódicas */}
        {activeTab === 'memories' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
              Regras e padrões aprendidos pelo especialista ao longo de tarefas e interações. Injetadas automaticamente em seus prompts de raciocínio.
            </p>
            {/* Formulário Novo Aprendizado */}
            <form
              onSubmit={handleAddMemory}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                padding: '14px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--border-color)',
              }}
            >
              <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Adicionar Nova Diretriz / Aprendizado
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: '10px' }}>
                <select
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    fontSize: '0.82rem',
                    outline: 'none',
                  }}
                >
                  <option value="coding_style">coding_style (Estilo de Código)</option>
                  <option value="test_preference">test_preference (Padrão de Teste)</option>
                  <option value="architecture_rule">architecture_rule (Regra Arquitetural)</option>
                  <option value="security_policy">security_policy (Diretriz de Segurança)</option>
                  <option value="user_preference">user_preference (Preferência do Usuário)</option>
                </select>
                <input
                  type="text"
                  placeholder="Chave única (ex: pydantic_v2_models)"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    fontSize: '0.82rem',
                    outline: 'none',
                  }}
                />
                <select
                  value={newImportance}
                  onChange={(e) => setNewImportance(Number(e.target.value))}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    fontSize: '0.82rem',
                    outline: 'none',
                  }}
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
                placeholder="Conteúdo da diretriz aprendida (ex: Sempre usar ConfigDict em schemas Pydantic)"
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                style={{
                  padding: '8px 10px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  fontSize: '0.82rem',
                  outline: 'none',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="submit"
                  className="btn btn-secondary"
                  disabled={addingMemory || !newKey.trim() || !newContent.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}
                >
                  <Plus size={14} />
                  {addingMemory ? 'Salvando...' : 'Adicionar Aprendizado'}
                </button>
              </div>
            </form>
            {/* Lista de Memórias */}
            {loadingMemories ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                Carregando memórias do agente...
              </div>
            ) : memories.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                Nenhuma memória episódica registrada para este especialista ainda.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
                {memories.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(99, 102, 241, 0.15)',
                            color: '#818cf8',
                            fontFamily: 'monospace',
                            fontWeight: 600,
                          }}
                        >
                          {m.category}
                        </span>
                        <strong style={{ fontSize: '0.84rem', color: 'var(--text-primary)' }}>{m.key}</strong>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                          Importância: {m.importance}/5
                        </span>
                      </div>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{m.content}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteMemory(m.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        padding: '6px',
                        borderRadius: '6px',
                        transition: 'color 0.2s',
                      }}
                      title="Excluir memória"
                    >
                      <Trash2 size={16} />
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
