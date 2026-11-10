import React, { useState, useEffect } from 'react';
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
  const [policyMessage, setPolicyMessage] = useState<string | null>(null);

  const loadProjects = async () => {
    try {
      const projs = await fetchWorkspaceProjects();
      setProjects(projs || []);
      if (projs && projs.length > 0 && !selectedProjectId) {
        setSelectedProjectId(projs[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadPolicyTemplates = async () => {
    try {
      const tmpls = await fetchSecurityPolicyTemplates();
      setPolicyTemplates(tmpls || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadProjects();
    loadPolicyTemplates();
  }, []);

  const handleScanCVEs = async () => {
    if (!selectedProjectId) return;
    setCveLoading(true);
    setCveReport(null);
    try {
      const res = await scanProjectCVEs(selectedProjectId);
      setCveReport(res);
    } catch (err: any) {
      alert(`Falha ao varrer CVEs: ${err.message}`);
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
      alert(`Falha na auditoria Red Team: ${err.message}`);
    } finally {
      setRedTeamLoading(false);
    }
  };

  const handleApplyPolicy = async (templateId: string) => {
    if (!selectedProjectId) return;
    setApplyingPolicyId(templateId);
    setPolicyMessage(null);
    try {
      const res = await applySecurityPolicy(selectedProjectId, templateId);
      setPolicyMessage(`Sucesso: ${res.message} Arquivo criado: ${res.file}`);
    } catch (err: any) {
      setPolicyMessage(`Erro: ${err.message}`);
    } finally {
      setApplyingPolicyId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
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

        <div style={{ display: 'flex', gap: '10px', alignSelf: 'flex-end', marginLeft: 'auto' }}>
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
                      {f.file}:{f.line} — <code style={{ color: '#818cf8' }}>{f.type}</code>
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
              Políticas de Segurança e Hardening (1-Clique)
            </h3>
            <p
              style={{
                color: 'var(--text-secondary)',
                fontSize: '0.85rem',
                marginTop: '2px',
              }}
            >
              Aplique headers de proteção CSP, CORS estrito e proteção contra Clickjacking/XSS no seu projeto.
            </p>
          </div>
        </div>

        {policyMessage && (
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '8px',
              color: '#34d399',
              fontSize: '0.85rem',
            }}
          >
            {policyMessage}
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
                    navigator.clipboard.writeText(tmpl.code);
                    setCopiedTemplateId(tmpl.id);
                    setTimeout(() => setCopiedTemplateId(null), 2000);
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
                <button
                  onClick={() => handleApplyPolicy(tmpl.id)}
                  disabled={applyingPolicyId === tmpl.id || !selectedProjectId}
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
                  {applyingPolicyId === tmpl.id ? 'Aplicando...' : 'Aplicar no Projeto'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
