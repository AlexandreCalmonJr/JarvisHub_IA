import React, { useState, useEffect } from 'react';
import { API_BASE } from '../../services/api/client';
import { getAccountStorageKey } from '../../services/accountScope';
import {
  Bug,
  Flame,
  Lock,
  Copy,
  Check,
} from 'lucide-react';
import {
  fetchWorkspaceProjects,
  scanProjectCVEs,
  runRedTeamAudit,
  fetchSecurityPolicyTemplates,
  applySecurityPolicy,
} from '../../api';

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
    if (!selectedProjectId) return;
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
    if (!selectedProjectId) return;
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
    if (!selectedProjectId) return;
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {!roleLoaded && <div role="status" className="glass-panel" style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>A verificar permissões de segurança…</div>}
      {loadError && <div role="alert" className="glass-card" style={{ padding: '12px 16px', color: 'var(--danger-color)' }}>{loadError}</div>}
      {/* Seletor de Projeto Ativo para Auditoria */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          backgroundColor: 'var(--bg-secondary)',
          padding: '16px 20px',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
            PROJETO ALVO PARA AUDITORIA
          </label>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            style={{
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '8px 12px',
              fontSize: '0.85rem',
            }}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || p.id}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignSelf: 'flex-end', marginLeft: 'auto', flexWrap: 'wrap' }}>
          {canRunSecurityActions && <>
          <button
            onClick={handleScanCVEs}
            disabled={cveLoading || !selectedProjectId}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem' }}
          >
            <Bug size={15} />
            {cveLoading ? 'Varrendo...' : 'Varredura Offline de CVEs'}
          </button>
          <button
            onClick={handleRunRedTeam}
            disabled={redTeamLoading || !selectedProjectId}
            className="btn btn-ghost"
            style={{
              borderColor: 'rgba(239, 68, 68, 0.4)',
              color: '#f87171',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.82rem',
            }}
          >
            <Flame size={15} />
            {redTeamLoading ? 'Auditando...' : 'Auditoria Red Team (Código)'}
          </button>
          </>}
          {!canRunSecurityActions && (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              Varreduras e alterações estão reservadas a perfis autorizados.
            </span>
          )}
        </div>
      </div>

      {/* Resultado do Scanner Offline de CVEs */}
      {cveReport && (
        <div
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Bug size={20} color={cveReport.is_safe ? '#34d399' : '#f87171'} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                  {cveReport.is_safe
                    ? 'Nenhuma vulnerabilidade conhecida encontrada'
                    : `${cveReport.vulnerabilities_found} vulnerabilidade(s) detectada(s)`}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Dependências analisadas: {cveReport.total_dependencies_found} • Arquivos:{' '}
                  {cveReport.files_scanned.join(', ')}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span
                className={`badge ${
                  cveReport.security_score >= 80 ? 'badge-success' : 'badge-danger'
                }`}
                style={{ fontSize: '0.85rem' }}
              >
                Score: {cveReport.security_score}/100
              </span>
              <button
                onClick={() => setCveReport(null)}
                className="btn btn-ghost"
                style={{ fontSize: '0.75rem' }}
              >
                Fechar
              </button>
            </div>
          </div>

          {/* Lista de Achados CVE */}
          {cveReport.findings && cveReport.findings.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
              {cveReport.findings.map((f: any, idx: number) => (
                <div
                  key={idx}
                  style={{
                    padding: '12px 16px',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        fontSize: '0.9rem',
                      }}
                    >
                      {f.package} (versão: <code>{f.detected_version}</code>) — {f.cve}
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
                      {f.severity}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    {f.title}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#34d399', fontWeight: 500 }}>
                    Correção: {f.remediation}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Resultado do Red Team Sandbox */}
      {redTeamReport && (
        <div
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Flame size={20} color={redTeamReport.score >= 80 ? '#34d399' : '#f87171'} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                  {redTeamReport.verdict}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Arquivos auditados: {redTeamReport.total_files_audited} • Vulnerabilidades de
                  código: {redTeamReport.total_vulnerabilities}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span
                className={`badge ${
                  redTeamReport.score >= 80 ? 'badge-success' : 'badge-danger'
                }`}
                style={{ fontSize: '0.85rem' }}
              >
                Score Red Team: {redTeamReport.score}/100
              </span>
              <button
                onClick={() => setRedTeamReport(null)}
                className="btn btn-ghost"
                style={{ fontSize: '0.75rem' }}
              >
                Fechar
              </button>
            </div>
          </div>

          {/* Achados do Red Team */}
          {redTeamReport.findings && redTeamReport.findings.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
              {redTeamReport.findings.map((f: any, idx: number) => (
                <div
                  key={idx}
                  style={{
                    padding: '12px 16px',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        fontSize: '0.88rem',
                      }}
                    >
                      {f.file}:{f.line} — <code style={{ color: 'var(--accent-color)' }}>{f.type}</code>
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
                      {f.severity}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    {f.description}
                  </div>
                  <code
                    style={{
                      fontSize: '0.78rem',
                      backgroundColor: 'rgba(0, 0, 0, 0.4)',
                      padding: '6px 10px',
                      borderRadius: '4px',
                      color: '#fca5a5',
                      fontFamily: 'monospace',
                    }}
                  >
                    {f.snippet}
                  </code>
                  <div style={{ fontSize: '0.78rem', color: '#34d399', fontWeight: 500 }}>
                    Remediação: {f.remediation}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Gerador de Políticas de Hardening */}
      <div
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>
              Políticas de Segurança e Hardening
            </h3>
            <p
              style={{
                color: 'var(--text-secondary)',
                fontSize: '0.85rem',
                marginTop: '2px',
              }}
            >
              Solicite a aplicação de headers CSP, CORS estrito e proteção contra Clickjacking/XSS. A alteração só é executada depois de aprovação humana.
            </p>
          </div>
        </div>

        {policyMessage && (
          <div
            role={policyMessage.type === 'error' ? 'alert' : 'status'}
            style={{
              padding: '10px 14px',
              backgroundColor: policyMessage.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : policyMessage.type === 'pending' ? 'var(--accent-glow)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${policyMessage.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : policyMessage.type === 'pending' ? 'var(--border-accent)' : 'rgba(239, 68, 68, 0.3)'}`,
              borderRadius: '8px',
              color: policyMessage.type === 'success' ? 'var(--success-color)' : policyMessage.type === 'pending' ? 'var(--accent-color)' : 'var(--danger-color)',
              fontSize: '0.85rem',
            }}
          >
            {policyMessage.text}
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
            gap: '16px',
          }}
        >
          {policyTemplates.map((tmpl) => (
            <div
              key={tmpl.id}
              style={{
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span className="badge badge-info">{tmpl.framework}</span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                    fontFamily: 'monospace',
                  }}
                >
                  {tmpl.filename}
                </span>
              </div>

              <div>
                <h4
                  style={{
                    fontSize: '0.92rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}
                >
                  {tmpl.title}
                </h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {tmpl.description}
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                <button
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
                  className="btn btn-ghost"
                  style={{
                    flex: 1,
                    fontSize: '0.78rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  {copiedTemplateId === tmpl.id ? (
                    <Check size={14} color="#34d399" />
                  ) : (
                    <Copy size={14} />
                  )}
                  Copiar Código
                </button>
                {canRunSecurityActions ? (
                  <button
                    onClick={() => {
                      const pending = pendingPolicies.find((item) => item.projectId === selectedProjectId && item.templateId === tmpl.id);
                      void handleApplyPolicy(tmpl.id, pending?.approvalId);
                    }}
                    disabled={applyingPolicyId === tmpl.id || !selectedProjectId || !roleLoaded}
                    className="btn btn-primary"
                    style={{
                      flex: 1,
                      fontSize: '0.78rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    <Lock size={14} />
                    {applyingPolicyId === tmpl.id ? 'A processar…' : pendingPolicies.some((item) => item.projectId === selectedProjectId && item.templateId === tmpl.id) ? 'Concluir após aprovação' : 'Solicitar aprovação'}
                  </button>
                ) : (
                  <small style={{ color: 'var(--text-muted)', alignSelf: 'center' }}>Aplicação reservada a perfis autorizados.</small>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
