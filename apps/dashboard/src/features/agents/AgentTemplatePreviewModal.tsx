import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Cpu,
  Download,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wrench,
} from 'lucide-react';
import { AgentInfo } from '../../types';
import {
  AgentTemplate,
  buildInstallPayloadFromTemplate,
  canUninstallAgent,
} from '../../services/agentTemplates';
import { createAgent, deleteAgent } from '../../services/api/agents';
import { Modal } from '../../shared/common/Modal';
import { MascotAvatar } from '../../shared/common/MascotAvatar';
import { notify } from '../../shared/common/Toast';

interface AgentTemplatePreviewModalProps {
  template: AgentTemplate | null;
  installedAgent?: AgentInfo | null;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  onOpenChat?: (agent: AgentInfo) => void;
}

export const AgentTemplatePreviewModal: React.FC<AgentTemplatePreviewModalProps> = ({
  template,
  installedAgent,
  onClose,
  onChanged,
  onOpenChat,
}) => {
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (template) {
      setSelectedSkillIds(template.skills.map((s) => s.id));
    }
  }, [template?.templateId]);

  if (!template) return null;

  const isInstalled = Boolean(installedAgent);
  const allowUninstall = installedAgent ? canUninstallAgent(installedAgent) : false;

  const toggleSkill = (skillId: string) => {
    if (isInstalled) return;
    setSelectedSkillIds((prev) => {
      if (prev.includes(skillId)) {
        if (prev.length <= 1) {
          notify('Mantenha pelo menos 1 habilidade ativa para o agente.', 'warning');
          return prev;
        }
        return prev.filter((id) => id !== skillId);
      }
      return [...prev, skillId];
    });
  };

  const handleInstall = async () => {
    setBusy(true);
    try {
      const payload = buildInstallPayloadFromTemplate(template, selectedSkillIds);
      const created = await createAgent(payload);
      notify(
        `${template.proper_name} instalado com ${selectedSkillIds.length} habilidades prontas!`,
        'success'
      );
      window.dispatchEvent(new CustomEvent('jarvis:agents-updated'));
      await onChanged();
      onClose();
      if (onOpenChat && created) {
        // mantemos usuário na biblioteca, apenas atualizando a lista
      }
    } catch (err: any) {
      notify(err?.message || 'Não foi possível instalar o agente.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleUninstall = async () => {
    if (!installedAgent) return;
    setBusy(true);
    try {
      await deleteAgent(installedAgent.role);
      notify(
        `${installedAgent.proper_name || template.proper_name} foi desinstalado da sua equipe.`,
        'info'
      );
      window.dispatchEvent(new CustomEvent('jarvis:agents-updated'));
      await onChanged();
      onClose();
    } catch (err: any) {
      notify(err?.message || 'Falha ao desinstalar agente.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const modeLabel =
    template.routing_policy === 'local_only'
      ? 'Privado Local (Ollama)'
      : template.routing_policy === 'online_only'
        ? 'Online (Gemini)'
        : 'Híbrido Inteligente (Local + Gemini)';

  const autonomyLabel =
    template.autonomy_level === 'read_only'
      ? 'Somente leitura (Seguro)'
      : template.autonomy_level === 'ask_approval'
        ? 'Pede aprovação antes de agir'
        : 'Autônomo';

  return (
    <Modal
      isOpen={Boolean(template)}
      onClose={busy ? () => {} : onClose}
      title={`${template.proper_name} · ${template.title}`}
      subtitle={`Template pronto para instalar sem precisar preencher formulários (${template.handle})`}
      maxWidth="md"
      footer={
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            gap: '10px',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={busy}
          >
            Fechar
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {isInstalled && installedAgent && allowUninstall && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleUninstall}
                disabled={busy}
              >
                <Trash2 size={14} />
                <span>{busy ? 'Removendo...' : 'Desinstalar agente'}</span>
              </button>
            )}

            {isInstalled && installedAgent && onOpenChat && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  onOpenChat(installedAgent);
                  onClose();
                }}
              >
                <MessageSquare size={14} />
                <span>Conversar com {template.proper_name}</span>
              </button>
            )}

            {!isInstalled && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleInstall}
                disabled={busy}
              >
                <Download size={14} />
                <span>
                  {busy
                    ? 'Instalando...'
                    : `Instalar ${template.proper_name} (${selectedSkillIds.length} habilidades)`}
                </span>
              </button>
            )}
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {/* Cabeçalho do Especialista */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            padding: '14px',
            borderRadius: '12px',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
          }}
        >
          <MascotAvatar
            mascot={template.mascot}
            role={template.role}
            name={template.proper_name}
            size={56}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                {template.proper_name}
              </strong>
              <span
                style={{
                  fontSize: '0.74rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--accent-light)',
                  fontWeight: 600,
                }}
              >
                {template.handle}
              </span>
              <span
                style={{
                  fontSize: '0.7rem',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)',
                }}
              >
                {template.categoryLabel} · {template.audience}
              </span>
              {isInstalled && (
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(16, 185, 129, 0.14)',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    color: '#34d399',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <CheckCircle2 size={12} /> Instalado
                </span>
              )}
            </div>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: '0.84rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
              }}
            >
              {template.mission}
            </p>
          </div>
        </div>

        {/* Lista de Habilidades Incluídas */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                fontSize: '0.82rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              <Sparkles size={14} color="var(--accent-light)" />
              <span>Habilidades incluídas ({selectedSkillIds.length}/{template.skills.length})</span>
            </div>
            {!isInstalled && (
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Todas já vêm prontas — clique para personalizar se quiser
              </span>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
              gap: '10px',
            }}
          >
            {template.skills.map((skill) => {
              const checked = selectedSkillIds.includes(skill.id);
              return (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => toggleSkill(skill.id)}
                  disabled={isInstalled}
                  aria-pressed={checked}
                  style={{
                    textAlign: 'left',
                    padding: '11px 12px',
                    borderRadius: '10px',
                    border: `1px solid ${
                      checked ? 'var(--border-accent)' : 'var(--border-color)'
                    }`,
                    backgroundColor: checked
                      ? 'rgba(249, 115, 22, 0.08)'
                      : 'var(--bg-primary)',
                    cursor: isInstalled ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    transition: 'border-color 0.15s ease, background-color 0.15s ease',
                  }}
                >
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '6px',
                      marginTop: '1px',
                      flexShrink: 0,
                      display: 'grid',
                      placeItems: 'center',
                      backgroundColor: checked ? 'var(--accent-color)' : 'var(--bg-secondary)',
                      border: `1px solid ${
                        checked ? 'var(--accent-color)' : 'var(--border-hover)'
                      }`,
                      color: '#ffffff',
                    }}
                  >
                    {checked && <Check size={12} strokeWidth={3} />}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '6px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {skill.name}
                      </span>
                      <span
                        style={{
                          fontSize: '0.65rem',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--text-muted)',
                          textTransform: 'uppercase',
                          flexShrink: 0,
                        }}
                      >
                        {skill.kind === 'tool' ? 'Ferramenta' : 'Habilidade'}
                      </span>
                    </div>
                    <p
                      style={{
                        margin: '4px 0 0',
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.45,
                      }}
                    >
                      {skill.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Exemplos de uso natural */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div
            style={{
              fontSize: '0.78rem',
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            O que você pode pedir depois de instalar
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {template.examplePrompts.map((prompt, idx) => (
              <div
                key={idx}
                style={{
                  padding: '9px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.45,
                }}
              >
                &ldquo;{prompt}&rdquo;
              </div>
            ))}
          </div>
        </section>

        {/* Resumo técnico transparente (sem exigir preenchimento) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))',
            gap: '8px',
            paddingTop: '4px',
          }}
        >
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '9px',
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Cpu size={14} color="var(--accent-light)" />
            <div style={{ fontSize: '0.74rem' }}>
              <div style={{ color: 'var(--text-muted)' }}>Motor pronto</div>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{modeLabel}</div>
            </div>
          </div>
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '9px',
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <ShieldCheck size={14} color="#34d399" />
            <div style={{ fontSize: '0.74rem' }}>
              <div style={{ color: 'var(--text-muted)' }}>Segurança & Autonomia</div>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{autonomyLabel}</div>
            </div>
          </div>
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '9px',
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Wrench size={14} color="#38bdf8" />
            <div style={{ fontSize: '0.74rem' }}>
              <div style={{ color: 'var(--text-muted)' }}>Invocação rápida</div>
              <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                Diga &ldquo;{template.proper_name}&rdquo; ou {template.handle}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
