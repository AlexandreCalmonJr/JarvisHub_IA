import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { Plus, Upload, Sparkles, Code } from 'lucide-react';
import { createUserSkill, importEccSkill } from '../../api';
import { notify } from '../common/Toast';
import { AgentInfo } from '../../types';
import { ALL_26_AGENTS } from '../../data/agentsCatalog';

interface CreateSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
  agents: AgentInfo[];
  onSkillCreated: () => void;
  initialTab?: 'create' | 'import';
}

export const CreateSkillModal: React.FC<CreateSkillModalProps> = ({
  isOpen,
  onClose,
  onSkillCreated,
  initialTab = 'create',
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'import'>(initialTab);
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('backend');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [selectedAgents, setSelectedAgents] = useState<string[]>(['jarvis_master']);
  const [markdownContent, setMarkdownContent] = useState('');
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const SKILL_TEMPLATES = [
    {
      label: 'Clean Architecture & SOLID',
      domain: 'backend',
      desc: 'Boas práticas de desacoplamento, Domain-Driven Design e injeção de dependência.',
      instructions:
        'Separe estritamente as camadas de Domínio (Entidades/Regras de Negócio), Aplicação (Casos de Uso), Infraestrutura (Banco/Gateways) e Apresentação (Controllers/APIs). Não permita dependências da camada de domínio para bibliotecas externas.',
    },
    {
      label: 'OWASP Hardening & SAST',
      domain: 'security',
      desc: 'Blindagem contra SQL Injection, XSS, CSRF, SSRF e controle rígido de autorização.',
      instructions:
        'Valide todas as entradas de dados contra schemas estritos. Aplique escape contextual de saídas, parametrização obrigatória em consultas SQL e verificação do escopo do usuário autenticado antes de qualquer mutação de estado.',
    },
    {
      label: 'TDD & Testes Automatizados',
      domain: 'qa',
      desc: 'Fluxo Red-Green-Refactor com testes unitários, de integração e contratos de API.',
      instructions:
        'Escreva testes unitários concisos antes da implementação. Isole efeitos colaterais com fakes em memória. Garanta que todas as ramificações de erro e casos de borda possuam asserções explícitas.',
    },
    {
      label: 'DevOps & Contêineres',
      domain: 'ops',
      desc: 'Padronização de Dockerfile multi-stage, pipelines CI/CD e observabilidade.',
      instructions:
        'Utilize imagens base minimalistas (distroless ou alpine). Execute a aplicação sob usuário não-root (UID 1000). Garanta healthchecks HTTP e logs estruturados em formato JSON para stdout.',
    },
  ];

  const applyTemplate = (tpl: typeof SKILL_TEMPLATES[0]) => {
    setName(tpl.label);
    setDomain(tpl.domain);
    setDescription(tpl.desc);
    setInstructions(tpl.instructions);
    notify(`Template '${tpl.label}' carregado!`, 'info');
  };

  const loadEccExample = () => {
    const example = `---
name: "Clean Code & Refactoring Guidelines"
version: "1.2.0"
domain: "backend"
license: "Apache-2.0"
description: "Padrões de refatoração contínua e redução de dívida técnica para microsserviços."
allowed_tools:
  - "read_file"
  - "search_symbols"
---

# Diretrizes Técnicas
Ao refatorar métodos com complexidade ciclomática elevada:
1. Extraia funções pequenas com responsabilidade única.
2. Evite boolean flags como parâmetros de controle.
3. Garanta que os testes de regressão existentes continuem passando antes de commitar.
`;
    setMarkdownContent(example);
    notify('Exemplo de Skill ECC carregado no editor!', 'info');
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !instructions.trim()) {
      notify('Por favor, informe o nome e as diretrizes da skill', 'error');
      return;
    }
    setSaving(true);
    try {
      await createUserSkill({
        name: name.trim(),
        domain,
        description: description.trim(),
        instructions: instructions.trim(),
        assigned_agents: selectedAgents,
      });
      notify(`Skill '${name}' criada e associada aos agentes com sucesso!`, 'success');
      onSkillCreated();
      onClose();
      // Limpa formulário
      setName('');
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
    <Modal isOpen={isOpen} onClose={onClose} title="Adicionar Habilidade ECC & Ponytail" maxWidth="lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Abas */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>
          <button
            type="button"
            className={`btn ${activeTab === 'create' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('create')}
            style={{ fontSize: '0.82rem', padding: '6px 14px' }}
          >
            <Plus size={14} /> Criar Nova Skill
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'import' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('import')}
            style={{ fontSize: '0.82rem', padding: '6px 14px' }}
          >
            <Upload size={14} /> Importar Skill ECC (Markdown)
          </button>
        </div>

        {activeTab === 'create' ? (
          <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Quick Templates Bar */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <Sparkles size={13} color="#38bdf8" />
                <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#a1a1aa' }}>
                  Modelos Rápidos (1-clique para preencher):
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {SKILL_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.label}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    style={{
                      fontSize: '0.72rem',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      color: '#e4e4e7',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      cursor: 'pointer',
                    }}
                  >
                    + {tpl.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#a1a1aa', marginBottom: '4px' }}>
                  Nome da Habilidade *
                </label>
                <input
                  type="text"
                  placeholder="ex: Microsserviços e Padrão Saga"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    backgroundColor: '#1b1b1b',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#ffffff',
                    fontSize: '0.84rem',
                    outline: 'none',
                  }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#a1a1aa', marginBottom: '4px' }}>
                  Domínio Técnico
                </label>
                <select
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    backgroundColor: '#1b1b1b',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#ffffff',
                    fontSize: '0.84rem',
                    outline: 'none',
                  }}
                >
                  <option value="backend">Backend & APIs</option>
                  <option value="flutter">Flutter / Mobile</option>
                  <option value="web">Web & Frontend</option>
                  <option value="security">Segurança & OWASP</option>
                  <option value="qa">QA & Testes</option>
                  <option value="data">Dados & BI</option>
                  <option value="ops">DevOps & Infra</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', color: '#a1a1aa', marginBottom: '4px' }}>
                Descrição Resumida
              </label>
              <input
                type="text"
                placeholder="Breve resumo da finalidade desta habilidade"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  backgroundColor: '#1b1b1b',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#ffffff',
                  fontSize: '0.84rem',
                  outline: 'none',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', color: '#a1a1aa', marginBottom: '4px' }}>
                Diretrizes de Prompt & Instruções Técnicas *
              </label>
              <textarea
                placeholder="Descreva as instruções que serão injetadas no contexto do agente..."
                rows={5}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  backgroundColor: '#1b1b1b',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#ffffff',
                  fontSize: '0.82rem',
                  fontFamily: 'Consolas, monospace',
                  outline: 'none',
                  resize: 'vertical',
                }}
                required
              />
            </div>

            {/* Agentes Iniciais */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', color: '#a1a1aa', marginBottom: '6px' }}>
                Vincular a Especialistas Iniciais ({selectedAgents.length} selecionados)
              </label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: '6px',
                  maxHeight: '120px',
                  overflowY: 'auto',
                  padding: '4px',
                  backgroundColor: 'rgba(0,0,0,0.2)',
                  borderRadius: '8px',
                }}
              >
                {ALL_26_AGENTS.slice(0, 12).map((ag) => {
                  const isChecked = selectedAgents.includes(ag.role);
                  return (
                    <label
                      key={ag.role}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '0.76rem',
                        color: isChecked ? '#ffffff' : '#a1a1aa',
                        cursor: 'pointer',
                        padding: '3px 6px',
                        borderRadius: '4px',
                        backgroundColor: isChecked ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleAgent(ag.role)}
                        style={{ accentColor: '#38bdf8' }}
                      />
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ag.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
              <button type="button" onClick={onClose} className="btn btn-secondary" style={{ fontSize: '0.82rem', padding: '6px 14px' }}>
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="btn btn-primary"
                style={{ fontSize: '0.82rem', padding: '6px 18px' }}
              >
                {saving ? 'Criando...' : 'Salvar Habilidade'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleImportSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: '0.80rem', color: '#a1a1aa', margin: 0 }}>
                Cole a especificação Markdown da skill contendo frontmatter YAML (com campos <code>name</code>, <code>version</code>, <code>license</code>).
              </p>
              <button
                type="button"
                onClick={loadEccExample}
                className="btn btn-ghost"
                style={{ fontSize: '0.74rem', padding: '4px 10px', color: '#38bdf8' }}
              >
                <Code size={13} />
                <span>Carregar Exemplo</span>
              </button>
            </div>

            <textarea
              placeholder="---\nname: 'Padrões de Arquitetura'\nversion: '1.0.0'\ndomain: 'backend'\nlicense: 'MIT'\n---\n\nInstruções detalhadas..."
              rows={11}
              value={markdownContent}
              onChange={(e) => setMarkdownContent(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                backgroundColor: '#1b1b1b',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#ffffff',
                fontSize: '0.80rem',
                fontFamily: 'Consolas, monospace',
                outline: 'none',
                resize: 'vertical',
              }}
              required
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={onClose} className="btn btn-secondary" style={{ fontSize: '0.82rem', padding: '6px 14px' }}>
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="btn btn-primary"
                style={{ fontSize: '0.82rem', padding: '6px 18px' }}
              >
                {saving ? 'Importando...' : 'Importar e Validar ECC'}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};
