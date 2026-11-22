import React, { useState } from 'react';
import { Modal } from '../../shared/common/Modal';
import { Plus, Upload, Sparkles, Code } from 'lucide-react';
import { createUserSkill, importEccSkill } from '../../api';
import { notify } from '../../shared/common/Toast';
import { AgentInfo } from '../../types';
import { ALL_26_AGENTS } from '../../data/agentsCatalog';
import {
  CUSTOM_AREA_VALUE,
  SKILL_DOMAIN_CATALOG,
  SKILL_QUICK_TEMPLATES,
  SkillQuickTemplate,
  normalizeCustomAreaId,
} from '../../services/domainCatalog';

interface CreateSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
  agents: AgentInfo[];
  onSkillCreated: () => void;
  initialTab?: 'create' | 'import';
}

const OPERATIONS_DOMAINS = SKILL_DOMAIN_CATALOG.filter((d) => d.group === 'operations');
const PERSONAL_DOMAINS = SKILL_DOMAIN_CATALOG.filter((d) => d.group === 'personal');
const TECH_DOMAINS = SKILL_DOMAIN_CATALOG.filter((d) => d.group === 'tech');

export const CreateSkillModal: React.FC<CreateSkillModalProps> = ({
  isOpen,
  onClose,
  agents,
  onSkillCreated,
  initialTab = 'create',
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'import'>(initialTab);
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('administration');
  const [customDomain, setCustomDomain] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [selectedAgents, setSelectedAgents] = useState<string[]>(['jarvis_master']);
  const [markdownContent, setMarkdownContent] = useState('');
  const [saving, setSaving] = useState(false);

  const availableAgents =
    agents && agents.length > 0
      ? agents.map((ag) => ({
          role: ag.role,
          name: ag.proper_name ? `${ag.proper_name} · ${ag.name}` : ag.name,
        }))
      : ALL_26_AGENTS.map((ag) => ({ role: ag.role, name: ag.name }));

  React.useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const applyTemplate = (tpl: SkillQuickTemplate) => {
    setName(tpl.label);
    setDomain(tpl.domain);
    setCustomDomain('');
    setDescription(tpl.desc);
    setInstructions(tpl.instructions);
    notify(`Modelo '${tpl.label}' carregado!`, 'info');
  };

  const loadEccExample = () => {
    const example = `---
name: "Gestão de Estoque & Curva ABC"
version: "1.0.0"
domain: "logistics"
license: "MIT"
description: "Diretrizes práticas para controle de estoque mínimo, reposição e análise de fornecedores."
allowed_tools: []
---

# Diretrizes da Habilidade
Ao analisar demandas de estoque ou compras:
1. Classifique os itens por relevância financeira (Curva ABC).
2. Calcule o ponto de reposição considerando o prazo de entrega (lead time) e estoque de segurança.
3. Apresente recomendações objetivas de compra e redução de rupturas.
`;
    setMarkdownContent(example);
    notify('Exemplo de Skill carregado no editor!', 'info');
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !instructions.trim()) {
      notify('Por favor, informe o nome e as diretrizes da habilidade', 'error');
      return;
    }
    if (domain === CUSTOM_AREA_VALUE && !customDomain.trim()) {
      notify('Informe o nome da área personalizada da habilidade.', 'error');
      return;
    }
    const resolvedDomain =
      domain === CUSTOM_AREA_VALUE ? normalizeCustomAreaId(customDomain) : domain;

    setSaving(true);
    try {
      await createUserSkill({
        name: name.trim(),
        domain: resolvedDomain,
        description: description.trim(),
        instructions: instructions.trim(),
        assigned_agents: selectedAgents,
      });
      notify(`Habilidade '${name}' criada e vinculada com sucesso!`, 'success');
      onSkillCreated();
      onClose();
      setName('');
      setCustomDomain('');
      setDescription('');
      setInstructions('');
    } catch (err: any) {
      notify(`Erro ao criar skill: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!markdownContent.trim()) {
      notify('Cole uma skill com frontmatter YAML válido e licença declarada.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await importEccSkill(markdownContent.trim());
      notify(`Skill '${res?.skill?.name || 'ECC'}' importada e aprovada!`, 'success');
      onSkillCreated();
      onClose();
      setMarkdownContent('');
    } catch (err: any) {
      notify(`Erro ao importar skill: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleAgent = (role: string) => {
    setSelectedAgents((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Adicionar Nova Habilidade (Skill)"
      subtitle="Crie habilidades para qualquer área — gestão, negócios, logística, IoT, saúde, estudos, rotina ou tecnologia — ou importe em Markdown."
      icon={<Sparkles size={18} color="var(--accent-light)" />}
      maxWidth="lg"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Abas */}
        <div className="jarvis-segmented" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'create'}
            className={`jarvis-segmented-btn ${activeTab === 'create' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('create')}
          >
            <Plus size={14} /> Criar Nova Habilidade
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'import'}
            className={`jarvis-segmented-btn ${activeTab === 'import' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('import')}
          >
            <Upload size={14} /> Importar Skill (Markdown)
          </button>
        </div>

        {activeTab === 'create' ? (
          <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Quick Templates Bar */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <Sparkles size={13} color="var(--accent-light)" />
                <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Modelos Rápidos por Área (1 clique para preencher):
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {SKILL_QUICK_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    className="btn btn-secondary btn-xs"
                  >
                    + {tpl.label}
                  </button>
                ))}
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
                gap: '12px',
              }}
            >
              <div>
                <label htmlFor="skill-name-input" className="user-profile-field-label">
                  Nome da Habilidade *
                </label>
                <input
                  id="skill-name-input"
                  type="text"
                  placeholder="ex: Roteirização de Entregas, Controle de Estoque, Cardápio Semanal"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="jarvis-input"
                  required
                />
              </div>

              <div>
                <label htmlFor="skill-domain-select" className="user-profile-field-label">
                  Área / Domínio
                </label>
                <select
                  id="skill-domain-select"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  className="jarvis-select"
                >
                  <optgroup label="Gestão, Negócios & Operações">
                    {OPERATIONS_DOMAINS.map((dom) => (
                      <option key={dom.id} value={dom.id}>
                        {dom.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Pessoal, Estudos & Estilo de Vida">
                    {PERSONAL_DOMAINS.map((dom) => (
                      <option key={dom.id} value={dom.id}>
                        {dom.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="IoT & Tecnologia">
                    {TECH_DOMAINS.map((dom) => (
                      <option key={dom.id} value={dom.id}>
                        {dom.label}
                      </option>
                    ))}
                  </optgroup>
                  <option value={CUSTOM_AREA_VALUE}>Outra área (personalizada)...</option>
                </select>
              </div>
            </div>

            {domain === CUSTOM_AREA_VALUE && (
              <div>
                <label htmlFor="skill-custom-domain-input" className="user-profile-field-label">
                  Nome da área personalizada *
                </label>
                <input
                  id="skill-custom-domain-input"
                  type="text"
                  placeholder="Ex: Agronegócio, RH & Recrutamento, Psicologia, Arquitetura..."
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value)}
                  className="jarvis-input"
                  required
                />
              </div>
            )}

            <div>
              <label htmlFor="skill-desc-input" className="user-profile-field-label">
                Descrição Resumida
              </label>
              <input
                id="skill-desc-input"
                type="text"
                placeholder="Breve resumo do que esta habilidade ensina o agente a fazer"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="jarvis-input"
              />
            </div>

            <div>
              <label htmlFor="skill-instructions-textarea" className="user-profile-field-label">
                Diretrizes & Instruções da Habilidade *
              </label>
              <textarea
                id="skill-instructions-textarea"
                placeholder="Descreva em linguagem natural os métodos, critérios ou passos que o especialista deve seguir..."
                rows={5}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className="jarvis-textarea"
                style={{ fontSize: '0.84rem' }}
                required
              />
            </div>

            {/* Agentes Iniciais */}
            <div>
              <div className="user-profile-field-label jarvis-tabular">
                Vincular a Especialistas ({selectedAgents.length} selecionados)
              </div>
              <div
                className="jarvis-settings-subcard"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 195px), 1fr))',
                  gap: '6px',
                  maxHeight: '148px',
                  overflowY: 'auto',
                  padding: '8px',
                }}
              >
                {availableAgents.map((ag) => {
                  const isChecked = selectedAgents.includes(ag.role);
                  return (
                    <label
                      key={ag.role}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '0.76rem',
                        color: isChecked ? 'var(--text-primary)' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        padding: '4px 6px',
                        borderRadius: '6px',
                        backgroundColor: isChecked ? 'var(--accent-soft)' : 'transparent',
                        border: isChecked ? '1px solid var(--border-accent)' : '1px solid transparent',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleAgent(ag.role)}
                        style={{ accentColor: 'var(--accent-color)' }}
                      />
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ag.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
              <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">
                Cancelar
              </button>
              <button type="submit" disabled={saving} className="btn btn-primary btn-sm">
                {saving ? 'Criando...' : 'Salvar Habilidade'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleImportSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                flexWrap: 'wrap',
              }}
            >
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                Cole a especificação Markdown da skill contendo frontmatter YAML (com campos{' '}
                <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>name</code>,{' '}
                <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>version</code>,{' '}
                <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>license</code>).
              </p>
              <button type="button" onClick={loadEccExample} className="btn btn-ghost btn-xs">
                <Code size={13} />
                <span>Carregar Exemplo</span>
              </button>
            </div>

            <div>
              <label htmlFor="skill-ecc-markdown-textarea" className="user-profile-field-label">
                Especificação ECC (Markdown + YAML) *
              </label>
              <textarea
                id="skill-ecc-markdown-textarea"
                placeholder={`---\nname: 'Padrões de Arquitetura'\nversion: '1.0.0'\ndomain: 'backend'\nlicense: 'MIT'\n---\n\nInstruções detalhadas...`}
                rows={11}
                value={markdownContent}
                onChange={(e) => setMarkdownContent(e.target.value)}
                className="jarvis-textarea"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">
                Cancelar
              </button>
              <button type="submit" disabled={saving} className="btn btn-primary btn-sm">
                {saving ? 'Importando...' : 'Importar e Validar ECC'}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};
