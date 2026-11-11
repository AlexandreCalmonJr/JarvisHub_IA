import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { Plus, Upload } from 'lucide-react';
import { createUserSkill, importEccSkill } from '../../api';
import { notify } from '../common/Toast';
import { AgentInfo } from '../../types';

interface CreateSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
  agents: AgentInfo[];
  onSkillCreated: () => void;
}

export const CreateSkillModal: React.FC<CreateSkillModalProps> = ({
  isOpen,
  onClose,
  agents,
  onSkillCreated,
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'import'>('create');
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('backend');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [selectedAgents, setSelectedAgents] = useState<string[]>(['jarvis_master']);
  const [markdownContent, setMarkdownContent] = useState('');
  const [saving, setSaving] = useState(false);

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
    <Modal isOpen={isOpen} onClose={onClose} title="Adicionar Habilidade ECC & Ponytail">
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
            <Upload size={14} /> Importar SKILL.md (ECC / Ponytail)
          </button>
        </div>

        {activeTab === 'create' ? (
          <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '4px' }}>
                Nome da Habilidade
              </label>
              <input
                type="text"
                placeholder="Ex: Auditor de Performance FastAPI, Validador Zod, etc."
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '0.86rem',
                }}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '4px' }}>
                  Domínio Técnico
                </label>
                <select
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    backgroundColor: '#070a12',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '0.84rem',
                  }}
                >
                  <option value="backend">Backend & APIs</option>
                  <option value="web">Frontend & Web</option>
                  <option value="security">Segurança & DevSecOps</option>
                  <option value="ops">DevOps & Infra</option>
                  <option value="qa">Qualidade & Testes</option>
                  <option value="data">Engenharia de Dados</option>
                  <option value="management">Gestão & Arquitetura</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '4px' }}>
                  Breve Descrição
                </label>
                <input
                  type="text"
                  placeholder="Finalidade da habilidade..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: '#070a12',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '0.86rem',
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '4px' }}>
                Diretrizes e Instruções Técnicas (Injetadas no Prompt do Especialista)
              </label>
              <textarea
                rows={5}
                placeholder="Descreva as regras estritas que o agente deve seguir quando esta habilidade estiver ativa (ex: 'Sempre aplique tipagem estrita com Pydantic v2, evite bibliotecas externas desnecessárias...')."
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: '#070a12',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '0.84rem',
                  fontFamily: 'monospace',
                }}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                Vincular aos Agentes Especialistas:
              </label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: '8px',
                  maxHeight: '140px',
                  overflowY: 'auto',
                  padding: '8px',
                  backgroundColor: '#070a12',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {agents.map((ag) => {
                  const isChecked = selectedAgents.includes(ag.role);
                  return (
                    <label
                      key={ag.role}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '0.78rem',
                        color: isChecked ? '#fff' : 'var(--text-muted)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleAgent(ag.role)}
                        style={{ cursor: 'pointer' }}
                      />
                      <span>{ag.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
              <button type="button" onClick={onClose} className="btn btn-secondary" style={{ fontSize: '0.84rem' }}>
                Cancelar
              </button>
              <button type="submit" disabled={saving} className="btn btn-primary" style={{ fontSize: '0.84rem' }}>
                {saving ? 'Criando...' : 'Salvar Habilidade ECC'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleImportSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Cole o conteúdo de um arquivo <strong>SKILL.md</strong> do ecossistema ECC, Cursor ou Ponytail.
              O JARVIS extrai o frontmatter e valida as instruções. Informe também uma licença reconhecida (por exemplo, MIT) antes da importação:
            </div>

            <textarea
              rows={10}
              placeholder={`---
name: Ponytail Clean Code
domain: backend
description: Práticas estritas de YAGNI e reaproveitamento de código existente
license: MIT
---
# Diretrizes Técnicas:
1. Nunca crie classes auxiliares se a biblioteca nativa resolver.
2. Evite dependências de terceiros para tarefas de 1 linha.`}
              value={markdownContent}
              onChange={(e) => setMarkdownContent(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                backgroundColor: '#070a12',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '0.82rem',
                fontFamily: 'monospace',
              }}
              required
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" onClick={onClose} className="btn btn-secondary" style={{ fontSize: '0.84rem' }}>
                Cancelar
              </button>
              <button type="submit" disabled={saving} className="btn btn-primary" style={{ fontSize: '0.84rem' }}>
                {saving ? 'Importando...' : 'Importar e Ativar Skill'}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};
