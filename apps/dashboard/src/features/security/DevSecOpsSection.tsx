import React, { useState, useEffect } from 'react';
import { API_BASE } from '../../services/api/client';
import { getAccountStorageKey } from '../../services/accountScope';
import {
  Bug,
  Flame,
  Lock,
  Copy,
  Check,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  fetchWorkspaceProjects,
  scanProjectCVEs,
  runRedTeamAudit,
  fetchSecurityPolicyTemplates,
  applySecurityPolicy,
} from '../../api';
import { getFindingTypeLabel, getSeverityLabel } from '../../types';

export const DevSecOpsSection: React.FC = () => {
  const [projects, setProjects] = useState<any[]>([]);
  const [canRunSecurityActions, setCanRunSecurityActions] = useState(false);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  // Scanner CVEs
  const [cveLoading, setCveLoading] = useState(false);
  const [cveReport, setCveReport] = useState<any | null>(null);

  // Red Team Sandbox
  const [redTeamLoading, setRedTeamLoading] = useState(false);
  const [redTeamReport, setRedTeamReport] = useState<any | null>(null);

  // Políticas de Segurança
  const [policyTemplates, setPolicyTemplates] = useState<any[]>([]);
  const [applyingPolicyId, setApplyingPolicyId] = useState<string | null>(null);
  const [copiedTemplateId, setCopiedTemplateId] = useState<string | null>(null);
  const [policyMessage, setPolicyMessage] = useState<{ text: string; type: 'success' | 'error' | 'pending' } | null>(null);
  const [pendingPolicies, setPendingPolicies] = useState<Array<{ projectId: string; templateId: string; approvalId: string }>>([]);

  const loadProjects = async () => {
    try {
      const projs = await fetchWorkspaceProjects();
      setProjects(projs || []);
      setLoadError(null);
      if (projs && projs.length > 0 && !selectedProjectId) {
        setSelectedProjectId(projs[0].id);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Falha ao carregar projetos.');
    }
  };

  const loadPolicyTemplates = async () => {
    try {
      const tmpls = await fetchSecurityPolicyTemplates();
      setPolicyTemplates(tmpls || []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Falha ao carregar modelos de política.');
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/auth/me`, { credentials: 'include' })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((principal) => {
        if (!cancelled) {
          setCanRunSecurityActions(
            principal?.kind === 'human' &&
            (principal?.role === 'admin' || principal?.role === 'developer')
          );
          setRoleLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCanRunSecurityActions(false);
          setRoleLoaded(true);
        }
      });
    try {
      const raw = localStorage.getItem(getAccountStorageKey('jarvis_security_policy_pending_v1'));
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        setPendingPolicies(parsed.filter((item) =>
          item && typeof item.projectId === 'string' &&
          typeof item.templateId === 'string' &&
          typeof item.approvalId === 'string'
        ));
      }
    } catch {
      // A lista de continuações é apenas uma conveniência local.
    }
    loadProjects();
    loadPolicyTemplates();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistPendingPolicies = (items: Array<{ projectId: string; templateId: string; approvalId: string }>) => {
    setPendingPolicies(items);
    try {
      localStorage.setItem(getAccountStorageKey('jarvis_security_policy_pending_v1'), JSON.stringify(items));
    } catch {
      // A operação no servidor não depende da persistência local.
    }
  };

  const handleScanCVEs = async () => {
    if (!canRunSecurityActions || !selectedProjectId) return;
    setCveLoading(true);
    setCveReport(null);
    try {
      const res = await scanProjectCVEs(selectedProjectId);
      setCveReport(res);
    } catch (err: any) {
      setLoadError(`Falha ao varrer CVEs: ${err.message}`);
    } finally {
      setCveLoading(false);
    }
  };

  const handleRunRedTeam = async () => {
    if (!canRunSecurityActions || !selectedProjectId) return;
    setRedTeamLoading(true);
    setRedTeamReport(null);
    try {
      const res = await runRedTeamAudit(selectedProjectId);
      setRedTeamReport(res);
    } catch (err: any) {
      setLoadError(`Falha na auditoria Red Team: ${err.message}`);
    } finally {
      setRedTeamLoading(false);
    }
  };

  const handleApplyPolicy = async (templateId: string, approvalId?: string) => {
    if (!canRunSecurityActions || !selectedProjectId) return;
    setApplyingPolicyId(templateId);
    setPolicyMessage(null);
    try {
      const res = await applySecurityPolicy(selectedProjectId, templateId, approvalId);
      if (res.status === 'approval_required' && res.approval_id) {
        const next = [
          ...pendingPolicies.filter((item) => !(item.projectId === selectedProjectId && item.templateId === templateId)),
          { projectId: selectedProjectId, templateId, approvalId: res.approval_id },
        ];
        persistPendingPolicies(next);
        setPolicyMessage({
          type: 'pending',
          text: `Pedido de aprovação criado (${res.approval_id}). Aprove-o no Centro de Aprovações e depois volte aqui para concluir a aplicação.`,
        });
      } else if (res.status === 'applied') {
        persistPendingPolicies(pendingPolicies.filter((item) => !(item.projectId === selectedProjectId && item.templateId === templateId)));
        setPolicyMessage({ type: 'success', text: res.message || `Política aplicada ao ficheiro ${res.file || ''}.` });
      } else {
        setPolicyMessage({ type: 'error', text: 'O servidor não confirmou a aplicação da política.' });
      }
    } catch (err: any) {
      setPolicyMessage({
        type: 'error',
        text: approvalId
          ? 'A aprovação ainda não foi concluída, expirou ou não corresponde a este pedido. Verifique o Centro de Aprovações e tente novamente.'
          : (err.message || 'Falha ao solicitar aprovação da política.'),
      });
    } finally {
      setApplyingPolicyId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {!roleLoaded && (
        <div role="status" className="jarvis-callout jarvis-callout--info">
          A verificar permissões de segurança…
        </div>
      )}

      {loadError && (
        <div role="alert" className="jarvis-error-banner">
          {loadError}
        </div>
      )}

      {/* Seletor de Projeto Ativo para Auditoria */}
      <section className="jarvis-settings-card" style={{ padding: '16px 20px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '240px', flex: '1 1 260px', maxWidth: '420px' }}>
            <label htmlFor="devsecops-project-select" className="user-profile-field-label">
              Projeto alvo para auditoria
            </label>
            <select
              id="devsecops-project-select"
              className="jarvis-select"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              disabled={projects.length === 0}
            >
              {projects.length === 0 ? (
                <option value="">Nenhum projeto disponível no workspace</option>
              ) : (
                projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.id}
                  </option>
                ))
              )}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {canRunSecurityActions ? (
              <>
                <button
                  type="button"
                  onClick={handleScanCVEs}
                  disabled={cveLoading || !selectedProjectId}
                  className="btn btn-primary btn-sm"
                >
                  <Bug size={14} />
                  {cveLoading ? 'Varrendo…' : 'Varredura Offline de CVEs'}
                </button>
                <button
                  type="button"
                  onClick={handleRunRedTeam}
                  disabled={redTeamLoading || !selectedProjectId}
                  className="btn btn-danger btn-sm"
                >
                  <Flame size={14} />
                  {redTeamLoading ? 'Auditando…' : 'Auditoria Red Team (Código)'}
                </button>
              </>
            ) : (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                Varreduras e alterações estão reservadas a perfis autorizados.
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Resultado do Scanner Offline de CVEs */}
      {cveReport && (
        <section className="jarvis-settings-card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: cveReport.is_safe ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                  color: cveReport.is_safe ? '#4ade80' : '#f87171',
                  flexShrink: 0,
                }}
              >
                <Bug size={17} />
              </div>
              <div>
                <h3 style={{ fontWeight: 600, fontSize: '0.95rem', margin: 0, color: 'var(--text-primary)' }}>
                  {cveReport.is_safe
                    ? 'Nenhuma vulnerabilidade conhecida encontrada'
                    : `${cveReport.vulnerabilities_found} vulnerabilidade(s) detectada(s)`}
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '3px 0 0' }}>
                  Dependências analisadas:{' '}
                  <span className="jarvis-tabular" style={{ color: 'var(--text-primary)' }}>
                    {cveReport.total_dependencies_found}
                  </span>{' '}
                  · Ficheiros:{' '}
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem' }}>
                    {(cveReport.files_scanned || []).join(', ') || 'nenhum'}
                  </span>
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span
                className={`badge jarvis-tabular ${
                  cveReport.security_score >= 80 ? 'badge-success' : 'badge-danger'
                }`}
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}
              >
                Score: {cveReport.security_score}/100
              </span>
              <button
                type="button"
                onClick={() => setCveReport(null)}
                className="btn btn-ghost btn-xs"
                aria-label="Fechar relatório de CVEs"
              >
                <X size={13} />
                Fechar
              </button>
            </div>
          </div>

          {cveReport.findings && cveReport.findings.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {cveReport.findings.map((f: any, idx: number) => (
                <div key={idx} className="jarvis-settings-subcard" style={{ gap: '6px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '10px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.86rem' }}>
                      {f.package}{' '}
                      <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                        (versão:{' '}
                        <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                          {f.detected_version}
                        </code>
                        )
                      </span>{' '}
                      —{' '}
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-light)' }}>
                        {f.cve}
                      </span>
                    </div>
                    <span
                      className={`badge ${
                        f.severity === 'CRITICAL'
                          ? 'badge-danger'
                          : f.severity === 'HIGH'
                          ? 'badge-warning'
                          : 'badge-info'
                      }`}
                    >
                      {getSeverityLabel(f.severity)}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {f.title}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#4ade80', fontWeight: 500 }}>
                    Correção: {f.remediation}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Resultado do Red Team Sandbox */}
      {redTeamReport && (
        <section className="jarvis-settings-card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: redTeamReport.score >= 80 ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                  color: redTeamReport.score >= 80 ? '#4ade80' : '#f87171',
                  flexShrink: 0,
                }}
              >
                <Flame size={17} />
              </div>
              <div>
                <h3 style={{ fontWeight: 600, fontSize: '0.95rem', margin: 0, color: 'var(--text-primary)' }}>
                  {redTeamReport.verdict}
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '3px 0 0' }}>
                  Ficheiros auditados:{' '}
                  <span className="jarvis-tabular" style={{ color: 'var(--text-primary)' }}>
                    {redTeamReport.total_files_audited}
                  </span>{' '}
                  · Vulnerabilidades de código:{' '}
                  <span className="jarvis-tabular" style={{ color: 'var(--text-primary)' }}>
                    {redTeamReport.total_vulnerabilities}
                  </span>
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span
                className={`badge jarvis-tabular ${
                  redTeamReport.score >= 80 ? 'badge-success' : 'badge-danger'
                }`}
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}
              >
                Score Red Team: {redTeamReport.score}/100
              </span>
              <button
                type="button"
                onClick={() => setRedTeamReport(null)}
                className="btn btn-ghost btn-xs"
                aria-label="Fechar relatório Red Team"
              >
                <X size={13} />
                Fechar
              </button>
            </div>
          </div>

          {redTeamReport.findings && redTeamReport.findings.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {redTeamReport.findings.map((f: any, idx: number) => (
                <div key={idx} className="jarvis-settings-subcard" style={{ gap: '6px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '10px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                      <span style={{ fontFamily: 'var(--font-mono)' }}>
                        {f.file}:{f.line}
                      </span>{' '}
                      —{' '}
                      <code style={{ color: 'var(--accent-light)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }} title={f.type}>
                        {getFindingTypeLabel(f.type)}
                      </code>
                    </div>
                    <span
                      className={`badge ${
                        f.severity === 'CRITICAL'
                          ? 'badge-danger'
                          : f.severity === 'HIGH'
                          ? 'badge-warning'
                          : 'badge-info'
                      }`}
                    >
                      {getSeverityLabel(f.severity)}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {f.description}
                  </div>
                  <code
                    style={{
                      fontSize: '0.76rem',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border-color)',
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-sm)',
                      color: '#fca5a5',
                      fontFamily: 'var(--font-mono)',
                      overflowX: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {f.snippet}
                  </code>
                  <div style={{ fontSize: '0.78rem', color: '#4ade80', fontWeight: 500 }}>
                    Remediação: {f.remediation}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Gerador de Políticas de Hardening */}
      <section className="jarvis-settings-card">
        <div className="jarvis-settings-card-header">
          <div>
            <h3 className="jarvis-settings-card-title">
              Políticas de Segurança e Hardening
            </h3>
            <p className="jarvis-settings-card-desc">
              Solicite a aplicação de headers CSP, CORS estrito e proteção contra Clickjacking/XSS. A alteração só é executada depois de aprovação humana.
            </p>
          </div>
        </div>

        {policyMessage && (
          <div
            role={policyMessage.type === 'error' ? 'alert' : 'status'}
            className={`jarvis-callout ${
              policyMessage.type === 'success'
                ? 'jarvis-callout--success'
                : policyMessage.type === 'pending'
                ? 'jarvis-callout--info'
                : 'jarvis-callout--danger'
            }`}
          >
            {policyMessage.text}
          </div>
        )}

        {policyTemplates.length === 0 ? (
          <div className="jarvis-empty-state">
            <ShieldCheck size={28} />
            <div className="jarvis-empty-state-title">Nenhum modelo de política disponível</div>
            <div className="jarvis-empty-state-desc">
              Os templates de hardening aparecerão aqui assim que forem carregados do servidor.
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
              gap: '12px',
            }}
          >
            {policyTemplates.map((tmpl) => {
              const hasPendingApproval = pendingPolicies.some(
                (item) => item.projectId === selectedProjectId && item.templateId === tmpl.id
              );

              return (
                <div
                  key={tmpl.id}
                  className="jarvis-settings-subcard"
                  style={{ gap: '12px', justifyContent: 'space-between' }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          color: 'var(--accent-light)',
                        }}
                      >
                        {tmpl.framework}
                      </span>
                      <span
                        style={{
                          fontSize: '0.74rem',
                          color: 'var(--text-muted)',
                          fontFamily: 'var(--font-mono)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {tmpl.filename}
                      </span>
                    </div>

                    <div>
                      <h4
                        style={{
                          fontSize: '0.9rem',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          margin: 0,
                        }}
                      >
                        {tmpl.title}
                      </h4>
                      <p
                        style={{
                          fontSize: '0.8rem',
                          color: 'var(--text-secondary)',
                          margin: '4px 0 0',
                          lineHeight: 1.5,
                        }}
                      >
                        {tmpl.description}
                      </p>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: canRunSecurityActions ? '1fr 1fr' : '1fr',
                      gap: '8px',
                      marginTop: 'auto',
                      paddingTop: '4px',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (!navigator.clipboard?.writeText) {
                          setLoadError('A cópia não está disponível neste navegador.');
                          return;
                        }
                        navigator.clipboard.writeText(tmpl.code)
                          .then(() => {
                            setCopiedTemplateId(tmpl.id);
                            window.setTimeout(() => setCopiedTemplateId(null), 2000);
                          })
                          .catch(() => setLoadError('Não foi possível copiar o template. Verifique as permissões do navegador.'));
                      }}
                      className={`btn btn-sm btn-block ${copiedTemplateId === tmpl.id ? 'btn-success' : 'btn-ghost'}`}
                    >
                      {copiedTemplateId === tmpl.id ? <Check size={14} /> : <Copy size={14} />}
                      {copiedTemplateId === tmpl.id ? 'Copiado' : 'Copiar Código'}
                    </button>

                    {canRunSecurityActions ? (
                      <button
                        type="button"
                        onClick={() => {
                          const pending = pendingPolicies.find(
                            (item) => item.projectId === selectedProjectId && item.templateId === tmpl.id
                          );
                          void handleApplyPolicy(tmpl.id, pending?.approvalId);
                        }}
                        disabled={applyingPolicyId === tmpl.id || !selectedProjectId || !roleLoaded}
                        className="btn btn-primary btn-sm btn-block"
                      >
                        <Lock size={14} />
                        {applyingPolicyId === tmpl.id
                          ? 'A processar…'
                          : hasPendingApproval
                          ? 'Concluir aprovação'
                          : 'Solicitar aprovação'}
                      </button>
                    ) : (
                      <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        Aplicação reservada a perfis autorizados.
                      </small>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
