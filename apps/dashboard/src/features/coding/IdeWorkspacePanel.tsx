import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Code2,
  FileCode2,
  FileText,
  FolderOpen,
  GitCompare,
  History,
  Lock,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  Sparkles,
  Unlock,
  X,
} from 'lucide-react';
import {
  IdeCheckpointRecord,
  IdeProposalResponse,
  IdeWorkspaceFile,
  applyIdeEdit,
  fetchIdeWorkspace,
  proposeIdeEdit,
  restoreIdeCheckpoint,
} from '../../services/api';
import { notify } from '../../shared/common/Toast';

interface SplitDiffRow {
  lineNumber: number;
  before: string | null;
  after: string | null;
  kind: 'unchanged' | 'changed' | 'added' | 'removed';
}

function computeSideBySideRows(original: string, proposed: string): SplitDiffRow[] {
  const beforeLines = (original || '').split('\n');
  const afterLines = (proposed || '').split('\n');
  const maxLen = Math.max(beforeLines.length, afterLines.length);
  const rows: SplitDiffRow[] = [];

  for (let i = 0; i < maxLen; i += 1) {
    const b = i < beforeLines.length ? beforeLines[i] : null;
    const a = i < afterLines.length ? afterLines[i] : null;
    let kind: SplitDiffRow['kind'] = 'unchanged';
    if (b === null && a !== null) kind = 'added';
    else if (b !== null && a === null) kind = 'removed';
    else if (b !== a) kind = 'changed';
    rows.push({ lineNumber: i + 1, before: b, after: a, kind });
  }
  return rows;
}

const QUICK_IDE_PROMPTS = [
  'Adicionar guarda assertValidSession com erro claro',
  'Adicionar limpeza automática de buckets expirados',
  'Adicionar regra de auditoria e retenção de checkpoints',
];

export const IdeWorkspacePanel: React.FC = () => {
  const [files, setFiles] = useState<IdeWorkspaceFile[]>([]);
  const [checkpoints, setCheckpoints] = useState<IdeCheckpointRecord[]>([]);
  const [vaultLocked, setVaultLocked] = useState(true);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [draftContent, setDraftContent] = useState<string>('');
  const [instruction, setInstruction] = useState('');
  const [proposing, setProposing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<IdeProposalResponse | null>(null);

  const loadWorkspace = async (preserveSelected = true) => {
    try {
      const data = await fetchIdeWorkspace();
      setFiles(data.files || []);
      setCheckpoints(data.checkpoints || []);
      setVaultLocked(Boolean(data.vault_locked));
      setSelectedPath((current) => {
        if (preserveSelected && current && data.files.some((f) => f.path === current)) {
          return current;
        }
        return data.files[0]?.path || '';
      });
    } catch (err: any) {
      notify(err?.message || 'Falha ao carregar arquivos da IDE.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkspace(false);
  }, []);

  const selectedFile = useMemo(
    () => files.find((f) => f.path === selectedPath) || null,
    [files, selectedPath]
  );

  useEffect(() => {
    if (selectedFile) {
      setDraftContent(selectedFile.content);
      setProposal(null);
    }
  }, [selectedFile?.path, selectedFile?.updated_at]);

  const filteredFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) => f.path.toLowerCase().includes(q));
  }, [files, searchQuery]);

  const splitRows = useMemo(() => {
    if (!proposal || proposal.blocked_reason) return [];
    return computeSideBySideRows(proposal.original, proposal.proposed);
  }, [proposal]);

  const hasUnsavedManualChanges = Boolean(
    selectedFile && draftContent !== selectedFile.content && !proposal
  );

  const handleProposeDiff = async (customInstruction?: string) => {
    if (!selectedFile) return;
    const text = (customInstruction ?? instruction).trim();
    if (!text) {
      notify('Descreva o que deseja alterar para gerar o Diff visual.', 'warning');
      return;
    }
    setProposing(true);
    try {
      const res = await proposeIdeEdit({
        file_path: selectedFile.path,
        instruction: text,
        current_content: draftContent,
        agent_role: 'coding_agent',
      });
      setProposal(res);
      if (res.blocked_reason) {
        notify(res.blocked_reason, 'warning');
      } else {
        notify('Diff visual gerado! Revise Antes vs. Depois antes de aceitar.', 'success');
      }
    } catch (err: any) {
      notify(err?.message || 'Erro ao propor alteração.', 'error');
    } finally {
      setProposing(false);
    }
  };

  const handleAcceptProposal = async () => {
    if (!proposal || !selectedFile || proposal.blocked_reason) return;
    setApplying(true);
    try {
      const res = await applyIdeEdit({
        file_path: selectedFile.path,
        content: proposal.proposed,
        label: proposal.summary.slice(0, 72) || `Diff aplicado em ${selectedFile.path}`,
        agent_name: 'Dante (IDE · Diff Aprovado)',
      });
      setFiles((prev) => prev.map((f) => (f.path === res.file.path ? res.file : f)));
      setCheckpoints((prev) => [res.checkpoint, ...prev]);
      setDraftContent(res.file.content);
      setProposal(null);
      setInstruction('');
      notify('Alteração aplicada e Checkpoint reversível criado!', 'success');
    } catch (err: any) {
      notify(err?.message || 'Não foi possível aplicar o Diff.', 'error');
    } finally {
      setApplying(false);
    }
  };

  const handleManualSave = async () => {
    if (!selectedFile) return;
    setApplying(true);
    try {
      const res = await applyIdeEdit({
        file_path: selectedFile.path,
        content: draftContent,
        label: `Edição manual em ${selectedFile.path.split('/').pop()}`,
        agent_name: 'Usuário (Editor Manual)',
      });
      setFiles((prev) => prev.map((f) => (f.path === res.file.path ? res.file : f)));
      setCheckpoints((prev) => [res.checkpoint, ...prev]);
      notify('Arquivo salvo com Checkpoint automático.', 'success');
    } catch (err: any) {
      notify(err?.message || 'Falha ao salvar arquivo.', 'error');
    } finally {
      setApplying(false);
    }
  };

  const handleRestoreCheckpoint = async (checkpointId: string) => {
    setRestoringId(checkpointId);
    try {
      const res = await restoreIdeCheckpoint(checkpointId);
      setFiles((prev) => prev.map((f) => (f.path === res.file.path ? res.file : f)));
      setCheckpoints((prev) => [res.checkpoint, ...prev]);
      if (selectedPath === res.file.path) {
        setDraftContent(res.file.content);
        setProposal(null);
      }
      notify(`Checkpoint revertido com sucesso em ${res.file.path}.`, 'success');
    } catch (err: any) {
      notify(err?.message || 'Falha ao reverter checkpoint.', 'error');
    } finally {
      setRestoringId(null);
    }
  };

  if (loading) {
    return (
      <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
        Carregando árvore de arquivos, editor e checkpoints da IDE…
      </div>
    );
  }

  return (
    <div style={s.layout}>
      {/* COLUNA 1: EXPLORADOR DE ARQUIVOS */}
      <aside style={s.panel} aria-label="Explorador de arquivos do workspace">
        <div style={s.panelHeader}>
          <div style={s.panelHeaderTitle}>
            <FolderOpen size={14} color="var(--accent-color)" />
            <span>Workspace</span>
          </div>
          <span
            style={{
              ...s.vaultTag,
              borderColor: vaultLocked ? 'rgba(245, 158, 11, 0.38)' : 'rgba(34, 197, 94, 0.38)',
              color: vaultLocked ? '#fbbf24' : '#4ade80',
              backgroundColor: vaultLocked ? 'rgba(245, 158, 11, 0.1)' : 'rgba(34, 197, 94, 0.1)',
            }}
            title="Vault Lock protege arquivos .env e segredos"
          >
            {vaultLocked ? <Lock size={11} /> : <Unlock size={11} />}
            {vaultLocked ? 'Vault' : 'Aberto'}
          </span>
        </div>

        <div style={{ padding: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ position: 'relative' }}>
            <Search
              size={13}
              color="var(--text-muted)"
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar arquivo..."
              aria-label="Buscar arquivo no workspace"
              style={{ ...s.input, paddingLeft: '30px' }}
            />
          </div>
        </div>

        <div style={s.scrollColumn}>
          {filteredFiles.map((file) => {
            const isSelected = file.path === selectedPath;
            const fileName = file.path.split('/').pop() || file.path;
            const dirLabel = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : 'raiz';
            return (
              <button
                key={file.path}
                type="button"
                onClick={() => setSelectedPath(file.path)}
                style={{
                  ...s.fileRow,
                  backgroundColor: isSelected ? 'var(--accent-soft)' : 'transparent',
                  borderColor: isSelected ? 'var(--border-accent)' : 'transparent',
                  color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                {file.protected ? (
                  <Lock size={14} color="#fbbf24" style={{ marginTop: '2px', flexShrink: 0 }} />
                ) : file.language === 'markdown' ? (
                  <FileText size={14} color="#38bdf8" style={{ marginTop: '2px', flexShrink: 0 }} />
                ) : (
                  <FileCode2 size={14} color="var(--accent-light)" style={{ marginTop: '2px', flexShrink: 0 }} />
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</span>
                    {file.protected && (
                      <span style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: '#fbbf24', textTransform: 'uppercase' }}>
                        Cofre
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: '0.7rem',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {dirLabel}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* COLUNA 2: EDITOR + BARRA IA + SPLIT-VIEW DIFF */}
      <section style={s.panel}>
        <div style={s.editorHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <Code2 size={15} color="var(--accent-color)" style={{ flexShrink: 0 }} />
            <code style={{ fontSize: '0.8rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedFile?.path || 'Nenhum arquivo selecionado'}
            </code>
            {selectedFile?.protected && (
              <span style={s.protectedBannerTag}>
                <Lock size={11} /> Protegido pelo Vault Lock
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            {hasUnsavedManualChanges && (
              <button type="button" onClick={handleManualSave} disabled={applying} className="btn btn-secondary btn-sm">
                <Save size={13} /> {applying ? 'Salvando...' : 'Salvar Checkpoint'}
              </button>
            )}
            <span className="tabular-nums" style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
              {draftContent.split('\n').length} linhas
            </span>
          </div>
        </div>

        {/* Barra de Proposta IA */}
        <div style={s.promptBar}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="text"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleProposeDiff();
                }
              }}
              placeholder="Peça ao Dante para refatorar, corrigir ou documentar este arquivo (gera Diff visual)..."
              aria-label="Instrução para gerar Diff com agente"
              style={{ ...s.input, flex: 1, padding: '9px 12px' }}
              disabled={proposing || !selectedFile}
            />
            <button
              type="button"
              onClick={() => void handleProposeDiff()}
              disabled={proposing || !selectedFile}
              className="btn btn-primary btn-sm"
              style={{ flexShrink: 0 }}
            >
              <GitCompare size={14} />
              {proposing ? 'Gerando Diff...' : 'Gerar Diff com Agente'}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginRight: '2px' }}>Sugestões:</span>
            {QUICK_IDE_PROMPTS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => {
                  setInstruction(q);
                  void handleProposeDiff(q);
                }}
                disabled={proposing || !selectedFile}
                style={s.suggestionBtn}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Bloqueio de Governança / Vault Lock */}
        {proposal?.blocked_reason && (
          <div role="alert" style={s.blockedBanner}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <ShieldAlert size={16} color="#f87171" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fca5a5' }}>
                  Alteração bloqueada pela Governança
                </div>
                <div style={{ fontSize: '0.78rem', color: '#fecaca', marginTop: '2px', lineHeight: 1.45 }}>
                  {proposal.blocked_reason}
                </div>
              </div>
            </div>
            <button type="button" onClick={() => setProposal(null)} className="btn btn-ghost btn-icon-sm" aria-label="Fechar alerta">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Split-View Diff ou Editor */}
        {proposal && !proposal.blocked_reason ? (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={s.diffApprovalBar}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                <Sparkles size={14} color="var(--accent-color)" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {proposal.summary}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <button type="button" onClick={() => setProposal(null)} disabled={applying} className="btn btn-secondary btn-sm">
                  <X size={14} /> Recusar
                </button>
                <button type="button" onClick={handleAcceptProposal} disabled={applying} className="btn btn-success btn-sm">
                  <Check size={14} /> {applying ? 'Aplicando...' : 'Aceitar & Criar Checkpoint'}
                </button>
              </div>
            </div>

            <div style={s.splitDiffHeader}>
              <div style={{ padding: '7px 12px', borderRight: '1px solid var(--border-color)', color: '#fca5a5' }}>
                Antes (Original)
              </div>
              <div style={{ padding: '7px 12px', color: '#6ee7b7' }}>
                Depois (Proposta do Agente)
              </div>
            </div>

            <div style={s.splitDiffBody}>
              {splitRows.map((row) => {
                const leftBg = row.kind === 'removed' || row.kind === 'changed' ? 'rgba(239, 68, 68, 0.14)' : 'transparent';
                const rightBg = row.kind === 'added' || row.kind === 'changed' ? 'rgba(34, 197, 94, 0.14)' : 'transparent';
                return (
                  <div key={row.lineNumber} style={s.splitDiffRow}>
                    <div style={{ ...s.splitCell, borderRight: '1px solid var(--border-color)', backgroundColor: leftBg }}>
                      <span className="tabular-nums" style={s.gutterLine}>{row.before !== null ? row.lineNumber : ''}</span>
                      <span style={{ ...s.gutterSign, color: '#f87171' }}>
                        {row.kind === 'removed' || row.kind === 'changed' ? '-' : ' '}
                      </span>
                      <pre style={s.diffCode}>{row.before ?? ''}</pre>
                    </div>
                    <div style={{ ...s.splitCell, backgroundColor: rightBg }}>
                      <span className="tabular-nums" style={s.gutterLine}>{row.after !== null ? row.lineNumber : ''}</span>
                      <span style={{ ...s.gutterSign, color: '#4ade80' }}>
                        {row.kind === 'added' || row.kind === 'changed' ? '+' : ' '}
                      </span>
                      <pre style={s.diffCode}>{row.after ?? ''}</pre>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', backgroundColor: '#090b10' }}>
            <textarea
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              spellCheck={false}
              aria-label="Editor de código do workspace"
              style={s.codeTextarea}
            />
          </div>
        )}
      </section>

      {/* COLUNA 3: CHECKPOINTS REVERSÍVEIS */}
      <aside style={s.panel} aria-label="Linha do tempo de checkpoints reversíveis">
        <div style={s.panelHeader}>
          <div style={s.panelHeaderTitle}>
            <History size={14} color="var(--accent-color)" />
            <span>Checkpoints</span>
          </div>
          <span className="tabular-nums" style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            {checkpoints.length} salvo(s)
          </span>
        </div>

        <div style={s.scrollColumn}>
          {checkpoints.length === 0 ? (
            <div style={{ padding: '18px 10px', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Nenhum checkpoint ainda. Aceite um Diff para registrar o primeiro ponto de restauração.
            </div>
          ) : (
            checkpoints.map((chk) => {
              const shortTime = new Date(chk.created_at).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              });
              const isBusy = restoringId === chk.id;
              return (
                <div key={chk.id} style={s.checkpointCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.35 }}>
                      {chk.label}
                    </div>
                    <span className="tabular-nums" style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', flexShrink: 0 }}>
                      {shortTime}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-light)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {chk.file_path}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', paddingTop: '6px', borderTop: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {chk.agent_name}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleRestoreCheckpoint(chk.id)}
                      disabled={Boolean(restoringId)}
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '4px 9px', fontSize: '0.72rem' }}
                    >
                      <RotateCcw size={12} />
                      {isBusy ? 'Revertendo...' : 'Reverter'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
};

const s: Record<string, React.CSSProperties> = {
  layout: {
    display: 'grid',
    gridTemplateColumns: '240px minmax(0, 1fr) 280px',
    gap: '12px',
    flex: 1,
    minHeight: '540px',
    height: '100%',
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    borderRadius: '12px',
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-secondary)',
    overflow: 'hidden',
  },
  panelHeader: {
    padding: '10px 12px',
    borderBottom: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-tertiary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    flexShrink: 0,
  },
  panelHeaderTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    fontSize: '0.72rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--text-secondary)',
  },
  vaultTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '0.68rem',
    fontFamily: 'var(--font-mono)',
    fontWeight: 600,
    padding: '2px 7px',
    borderRadius: '6px',
    border: '1px solid',
  },
  input: {
    width: '100%',
    padding: '7px 10px',
    borderRadius: '8px',
    backgroundColor: 'var(--bg-input)',
    border: '1px solid var(--border-color)',
    color: 'var(--text-primary)',
    fontSize: '0.78rem',
    outline: 'none',
  },
  scrollColumn: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  fileRow: {
    width: '100%',
    textAlign: 'left',
    padding: '8px 10px',
    borderRadius: '8px',
    border: '1px solid transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    transition: 'background-color 120ms ease, border-color 120ms ease',
  },
  editorHeader: {
    padding: '10px 14px',
    borderBottom: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
  },
  protectedBannerTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: '0.7rem',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '6px',
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    color: '#fbbf24',
    border: '1px solid rgba(245, 158, 11, 0.35)',
    flexShrink: 0,
  },
  promptBar: {
    padding: '12px 14px',
    borderBottom: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-secondary)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  suggestionBtn: {
    fontSize: '0.71rem',
    padding: '4px 9px',
    borderRadius: '6px',
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-primary)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  blockedBanner: {
    margin: '12px 14px 0',
    padding: '12px 14px',
    borderRadius: '10px',
    border: '1px solid rgba(239, 68, 68, 0.42)',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '12px',
  },
  diffApprovalBar: {
    padding: '10px 14px',
    backgroundColor: 'rgba(249, 115, 22, 0.09)',
    borderBottom: '1px solid rgba(249, 115, 22, 0.28)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
  },
  splitDiffHeader: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    borderBottom: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-primary)',
    fontSize: '0.72rem',
    fontFamily: 'var(--font-mono)',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  splitDiffBody: {
    flex: 1,
    overflowY: 'auto',
    backgroundColor: '#090b10',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.76rem',
    lineHeight: 1.55,
  },
  splitDiffRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
  },
  splitCell: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'stretch',
  },
  gutterLine: {
    width: '34px',
    flexShrink: 0,
    textAlign: 'right',
    paddingRight: '8px',
    color: 'var(--text-muted)',
    borderRight: '1px solid rgba(255, 255, 255, 0.06)',
    userSelect: 'none',
  },
  gutterSign: {
    width: '18px',
    flexShrink: 0,
    textAlign: 'center',
    fontWeight: 700,
    userSelect: 'none',
  },
  diffCode: {
    margin: 0,
    padding: '1px 8px 1px 2px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    color: 'var(--text-primary)',
    flex: 1,
    fontFamily: 'var(--font-mono)',
  },
  codeTextarea: {
    flex: 1,
    width: '100%',
    padding: '16px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#e5e7eb',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.8rem',
    lineHeight: 1.6,
    resize: 'none',
    outline: 'none',
  },
  checkpointCard: {
    padding: '10px 11px',
    borderRadius: '9px',
    border: '1px solid var(--border-color)',
    backgroundColor: 'var(--bg-primary)',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
};
