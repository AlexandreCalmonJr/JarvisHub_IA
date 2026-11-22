import React, { useEffect, useState } from 'react';
import { Check, FolderLock, Lock, Save, ShieldCheck } from 'lucide-react';
import {
  fetchPermissionsMatrix,
  updateAgentPermissionRule,
} from '../../services/api';
import type {
  AgentPermissionRule,
  PermissionAction,
  PermissionMode,
} from '../../services/sentinelSecurity';
import { notify } from '../../shared/common/Toast';

const MODE_OPTIONS: { value: PermissionMode; label: string }[] = [
  { value: 'read_only', label: 'Somente Leitura (Plano)' },
  { value: 'ask_approval', label: 'Pedir Aprovação' },
  { value: 'autonomous', label: 'Autônomo no Workspace' },
  { value: 'blocked', label: 'Bloqueado' },
];

const FOLDER_SCOPES = [
  'workspace/src',
  'workspace/docs',
  '~/Downloads',
  '.env & Segredos',
  'workspace/*',
];

const CAPABILITY_COLUMNS: { key: PermissionAction; label: string }[] = [
  { key: 'read', label: 'Ler' },
  { key: 'create', label: 'Criar' },
  { key: 'modify_diff', label: 'Modificar (Diff)' },
  { key: 'run_terminal', label: 'Terminal' },
  { key: 'network', label: 'Acessar Rede' },
  { key: 'integrations', label: 'Integrações' },
];

export const PermissionsMatrixSection: React.FC = () => {
  const [rules, setRules] = useState<AgentPermissionRule[]>([]);
  const [vaultLocked, setVaultLocked] = useState(true);
  const [loading, setLoading] = useState(true);
  const [dirtyMap, setDirtyMap] = useState<Record<string, boolean>>({});
  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [savedRole, setSavedRole] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchPermissionsMatrix();
        setRules(data.rules || []);
        setVaultLocked(Boolean(data.vault_locked));
      } catch (err: any) {
        notify(err?.message || 'Falha ao carregar Matriz de Permissões.', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const updateLocalRule = (
    agentRole: string,
    updater: (rule: AgentPermissionRule) => AgentPermissionRule
  ) => {
    setRules((prev) => prev.map((r) => (r.agent_role === agentRole ? updater(r) : r)));
    setDirtyMap((prev) => ({ ...prev, [agentRole]: true }));
    if (savedRole === agentRole) setSavedRole(null);
  };

  const handleSaveRule = async (rule: AgentPermissionRule) => {
    setSavingRole(rule.agent_role);
    try {
      const updated = await updateAgentPermissionRule(rule.agent_role, {
        mode: rule.mode,
        folder_scope: rule.folder_scope,
        capabilities: rule.capabilities,
      });
      setRules((prev) => prev.map((r) => (r.agent_role === updated.agent_role ? updated : r)));
      setDirtyMap((prev) => ({ ...prev, [rule.agent_role]: false }));
      setSavedRole(rule.agent_role);
      notify(`Política de ${updated.proper_name} salva com sucesso.`, 'success');
    } catch (err: any) {
      notify(err?.message || 'Erro ao salvar política de permissões.', 'error');
    } finally {
      setSavingRole(null);
    }
  };

  if (loading) {
    return (
      <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
        Carregando Matriz Granular de Permissões do Computador & Workspace…
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Banner superior */}
      <div style={s.headerCard}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', maxWidth: '760px' }}>
          <div style={s.iconBox}>
            <FolderLock size={18} />
          </div>
          <div>
            <h2 style={{ fontSize: '0.96rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Matriz Granular de Permissões por Agente & Pasta
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.5 }}>
              Controle exatamente em quais pastas do computador cada agente pode operar, seu nível de autonomia e quais capacidades (Diff, Terminal, Rede e Integrações) estão liberadas.
            </p>
          </div>
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '7px',
            padding: '7px 12px',
            borderRadius: '8px',
            fontSize: '0.75rem',
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            border: `1px solid ${vaultLocked ? 'rgba(245, 158, 11, 0.38)' : 'rgba(34, 197, 94, 0.38)'}`,
            backgroundColor: vaultLocked ? 'rgba(245, 158, 11, 0.09)' : 'rgba(34, 197, 94, 0.09)',
            color: vaultLocked ? '#fbbf24' : '#4ade80',
          }}
        >
          {vaultLocked ? <Lock size={13} /> : <ShieldCheck size={13} />}
          {vaultLocked ? 'Vault Lock Ativo (.env bloqueado)' : 'Cofre Desbloqueado'}
        </div>
      </div>

      {/* Tabela da Matriz */}
      <div style={s.tableShell}>
        <table style={s.table}>
          <thead>
            <tr style={s.theadRow}>
              <th style={{ ...s.th, textAlign: 'left', paddingLeft: '16px' }}>Agente</th>
              <th style={{ ...s.th, textAlign: 'left' }}>Pasta / Escopo</th>
              <th style={{ ...s.th, textAlign: 'left' }}>Modo de Execução</th>
              {CAPABILITY_COLUMNS.map((col) => (
                <th key={col.key} style={{ ...s.th, textAlign: 'center' }}>
                  {col.label}
                </th>
              ))}
              <th style={{ ...s.th, textAlign: 'right', paddingRight: '16px' }}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => {
              const isDirty = Boolean(dirtyMap[rule.agent_role]);
              const isSaving = savingRole === rule.agent_role;
              const isSaved = savedRole === rule.agent_role && !isDirty;
              return (
                <tr key={rule.agent_role} style={s.tbodyRow}>
                  <td style={{ ...s.td, paddingLeft: '16px' }}>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {rule.proper_name}
                    </div>
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {rule.agent_name}
                    </div>
                  </td>

                  <td style={s.td}>
                    <select
                      aria-label={`Pasta de ${rule.proper_name}`}
                      value={rule.folder_scope}
                      onChange={(e) =>
                        updateLocalRule(rule.agent_role, (r) => ({
                          ...r,
                          folder_scope: e.target.value,
                        }))
                      }
                      style={{ ...s.select, fontFamily: 'var(--font-mono)' }}
                    >
                      {FOLDER_SCOPES.map((scope) => (
                        <option key={scope} value={scope}>
                          {scope}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td style={s.td}>
                    <select
                      aria-label={`Modo de execução de ${rule.proper_name}`}
                      value={rule.mode}
                      onChange={(e) =>
                        updateLocalRule(rule.agent_role, (r) => ({
                          ...r,
                          mode: e.target.value as PermissionMode,
                        }))
                      }
                      style={s.select}
                    >
                      {MODE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>

                  {CAPABILITY_COLUMNS.map((col) => (
                    <td key={col.key} style={{ ...s.td, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        aria-label={`${col.label} para ${rule.proper_name}`}
                        checked={Boolean(rule.capabilities[col.key])}
                        onChange={(e) =>
                          updateLocalRule(rule.agent_role, (r) => ({
                            ...r,
                            capabilities: {
                              ...r.capabilities,
                              [col.key]: e.target.checked,
                            },
                          }))
                        }
                        style={{ width: '16px', height: '16px', accentColor: '#f97316', cursor: 'pointer' }}
                      />
                    </td>
                  ))}

                  <td style={{ ...s.td, textAlign: 'right', paddingRight: '16px' }}>
                    <button
                      type="button"
                      onClick={() => void handleSaveRule(rule)}
                      disabled={isSaving}
                      className={`btn btn-sm ${isDirty ? 'btn-primary' : 'btn-secondary'}`}
                    >
                      {isSaved ? <Check size={13} /> : <Save size={13} />}
                      {isSaving ? 'Salvando...' : isSaved ? 'Salvo' : 'Salvar Política'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const s: Record<string, React.CSSProperties> = {
  headerCard: {
    borderRadius: '12px',
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-secondary)',
    padding: '16px 18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    flexWrap: 'wrap',
  },
  iconBox: {
    width: '38px',
    height: '38px',
    borderRadius: '9px',
    backgroundColor: 'var(--accent-soft)',
    border: '1px solid var(--border-accent)',
    color: 'var(--accent-light)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tableShell: {
    borderRadius: '12px',
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-secondary)',
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: '960px',
  },
  theadRow: {
    borderBottom: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-primary)',
  },
  th: {
    padding: '12px 10px',
    fontSize: '0.7rem',
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--text-muted)',
  },
  tbodyRow: {
    borderBottom: '1px solid var(--border-subtle)',
  },
  td: {
    padding: '13px 10px',
    verticalAlign: 'middle',
  },
  select: {
    padding: '7px 10px',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-input)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    fontSize: '0.78rem',
    outline: 'none',
  },
};
