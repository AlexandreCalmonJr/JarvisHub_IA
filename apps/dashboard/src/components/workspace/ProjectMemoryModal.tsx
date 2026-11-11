import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { BookOpen, Plus, Sparkles, RefreshCw } from 'lucide-react';
import { fetchProjectMemory, saveProjectMemory } from '../../api';
import { notify } from '../common/Toast';

interface ProjectMemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

export const ProjectMemoryModal: React.FC<ProjectMemoryModalProps> = ({
  isOpen,
  onClose,
  projectId,
}) => {
  const [memories, setMemories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [category, setCategory] = useState('coding_standard');
  const [key, setKey] = useState('');
  const [content, setContent] = useState('');

  const loadMemories = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await fetchProjectMemory(projectId);
      setMemories(data);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Falha ao carregar memórias do projeto.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && projectId) {
      loadMemories();
    }
  }, [isOpen, projectId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim() || !content.trim() || saving) return;

    setSaving(true);
    try {
      await saveProjectMemory(projectId, {
        category,
        key: key.trim(),
        content: content.trim(),
      });
      setKey('');
      setContent('');
      await loadMemories();
    } catch (e: any) {
      notify(`Erro ao registrar memória: ${e.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const getCategoryBadge = (cat: string) => {
    switch (cat) {
      case 'architecture_decision':
        return <span className="badge badge-purple">Decisão de Arquitetura</span>;
      case 'coding_standard':
        return <span className="badge badge-info">Padrão de Código</span>;
      case 'security_policy':
        return <span className="badge badge-danger">Segurança</span>;
      default:
        return <span className="badge badge-warning">Convenção</span>;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Memória Persistente & Regras do Projeto"
      subtitle={`Regras injetadas ativamente no prompt dos agentes para 'workspace/${projectId}'`}
      icon={<BookOpen size={20} />}
      maxWidth="xl"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Formulário para Adicionar Nova Memória */}
        <form
          onSubmit={handleSubmit}
          className="glass-card"
          style={{
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={16} color="#818cf8" />
            <h4 style={{ fontSize: '0.9rem', fontWeight: 600 }}>Registrar Nova Regra / Decisão</h4>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
            }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  marginBottom: '4px',
                }}
              >
                Categoria da Regra
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '0.84rem',
                  outline: 'none',
                }}
              >
                <option value="coding_standard">Padrão de Código (Coding Standard)</option>
                <option value="architecture_decision">Decisão de Arquitetura (ADR)</option>
                <option value="convention">Convenção de Nomes / UI</option>
                <option value="security_policy">Política de Segurança Estrita</option>
              </select>
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  marginBottom: '4px',
                }}
              >
                Identificador / Chave (Ex: color_theme)
              </label>
              <input
                type="text"
                placeholder="Ex: naming_convention ou color_palette"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '0.84rem',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                marginBottom: '4px',
              }}
            >
              Diretriz / Instrução Detalhada
            </label>
            <textarea
              rows={2}
              placeholder="Ex: Use sempre tema dark com verde esmeralda #10b981 como destaque e validação de formulários."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '0.84rem',
                outline: 'none',
                resize: 'vertical',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button type="submit" disabled={saving || !key.trim() || !content.trim()} className="btn btn-primary">
              {saving ? <RefreshCw size={14} className="spin" /> : <Plus size={14} />}
              Salvar na Memória do Projeto
            </button>
          </div>
        </form>

        {/* Lista de Memórias Existentes */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px',
            }}
          >
            <h4 style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Memórias Ativas ({memories.length})
            </h4>
            <button
              onClick={loadMemories}
              className="btn btn-ghost"
              style={{ fontSize: '0.75rem', padding: '4px 8px' }}
              title="Recarregar memórias"
            >
              <RefreshCw size={13} className={loading ? 'spin' : ''} /> Atualizar
            </button>
          </div>

          {loadError && (
            <div role="alert" style={{ marginBottom: '10px', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(248, 113, 113, 0.3)', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              Não foi possível carregar as memórias: {loadError}
            </div>
          )}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
              <RefreshCw size={20} className="spin" style={{ margin: '0 auto 8px' }} />
              Carregando memórias do projeto...
            </div>
          ) : memories.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '32px',
                border: '1px dashed var(--border-color)',
                borderRadius: '12px',
                color: 'var(--text-secondary)',
              }}
            >
              Nenhuma memória ou regra cadastrada para este projeto ainda.
              <br />
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Adicione regras de design, arquitetura ou padrões de código acima.
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {memories.map((m, idx) => (
                <div
                  key={idx}
                  className="glass-card"
                  style={{
                    padding: '14px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {getCategoryBadge(m.category)}
                      <code style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                        {m.key}
                      </code>
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {m.updated_at ? new Date(m.updated_at).toLocaleDateString() : ''}
                    </span>
                  </div>

                  <p
                    style={{
                      fontSize: '0.84rem',
                      color: 'var(--text-primary)',
                      lineHeight: '1.5',
                      whiteSpace: 'pre-wrap',
                      marginTop: '4px',
                    }}
                  >
                    {m.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
