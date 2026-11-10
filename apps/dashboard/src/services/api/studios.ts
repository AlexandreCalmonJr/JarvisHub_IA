import { API_BASE } from './client';

export async function fetchMockEndpoints(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/mock-server/endpoints`);
  if (!res.ok) return [];
  return res.json();
}

export async function saveMockEndpoint(payload: any): Promise<any> {
  const res = await fetch(`${API_BASE}/mock-server/endpoints`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Erro ao salvar mock' }));
    throw new Error(err.detail || 'Falha ao salvar mock endpoint');
  }
  return res.json();
}

export async function deleteMockEndpoint(id: string): Promise<any> {
  const res = await fetch(`${API_BASE}/mock-server/endpoints/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function fetchProjectDatabases(projectId: string): Promise<any[]> {
  const res = await fetch(`${API_BASE}/backend-studio/databases/${projectId}`);
  if (!res.ok) return [];
  return res.json();
}

export async function inspectSqlDatabase(dbPath: string, projectId?: string): Promise<any> {
  const res = await fetch(`${API_BASE}/backend-studio/sql/inspect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ db_path: dbPath, project_id: projectId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Erro ao inspecionar banco' }));
    throw new Error(err.detail || 'Falha ao inspecionar banco SQLite');
  }
  return res.json();
}

export async function executeSqlQuery(dbPath: string, query: string, projectId?: string, limit: number = 200): Promise<any> {
  const res = await fetch(`${API_BASE}/backend-studio/sql/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ db_path: dbPath, query, project_id: projectId, limit }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Erro ao executar SQL' }));
    throw new Error(err.detail || 'Falha ao executar query SQL');
  }
  return res.json();
}

export async function auditSqlQuery(dbPath: string, query: string, projectId?: string): Promise<any> {
  const res = await fetch(`${API_BASE}/backend-studio/sql/audit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ db_path: dbPath, query, project_id: projectId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Erro ao auditar SQL' }));
    throw new Error(err.detail || 'Falha ao auditar plano de query');
  }
  return res.json();
}

export async function fetchProjectTests(projectId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/quality-studio/tests/${projectId}`);
  if (!res.ok) return { total_tests: 0, suites: [] };
  return res.json();
}

export async function runProjectTests(projectId: string, testFile?: string, timeoutSeconds: number = 45): Promise<any> {
  const res = await fetch(`${API_BASE}/quality-studio/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId, test_file: testFile, timeout_seconds: timeoutSeconds }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Erro ao rodar testes' }));
    throw new Error(err.detail || 'Falha na execução de testes');
  }
  return res.json();
}

export async function generatePlaywrightTest(targetUrl: string, scenarioName: string, steps?: any[]): Promise<any> {
  const res = await fetch(`${API_BASE}/quality-studio/generate-playwright`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_url: targetUrl, scenario_name: scenarioName, steps }),
  });
  if (!res.ok) throw new Error('Falha ao gerar teste Playwright');
  return res.json();
}

export async function fetchChaosEdgeCases(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/quality-studio/chaos-edge-cases`);
  if (!res.ok) return [];
  return res.json();
}

export async function extractColorPalette(hexPrimary: string, name?: string): Promise<any> {
  const res = await fetch(`${API_BASE}/design-studio/palette`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hex_primary: hexPrimary, name }),
  });
  if (!res.ok) throw new Error('Falha ao extrair paleta');
  return res.json();
}

export async function auditWcagAccessibility(markup: string): Promise<any> {
  const res = await fetch(`${API_BASE}/design-studio/audit-wcag`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markup }),
  });
  if (!res.ok) throw new Error('Falha ao auditar acessibilidade');
  return res.json();
}

export async function fetchComponentBoilerplate(componentType: string): Promise<any> {
  const res = await fetch(`${API_BASE}/design-studio/components/${componentType}`);
  if (!res.ok) throw new Error('Falha ao obter boilerplate de componente');
  return res.json();
}

export async function fetchProjectTechDebt(projectId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/intelligence/tech-debt/${projectId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Erro na análise de dívida técnica' }));
    throw new Error(err.detail || 'Falha na análise');
  }
  return res.json();
}

export async function fetchProductivityRoi(): Promise<any> {
  const res = await fetch(`${API_BASE}/intelligence/productivity-roi`);
  if (!res.ok) return {};
  return res.json();
}

export async function fetchExecutiveReport(projectId?: string): Promise<any> {
  const url = projectId ? `${API_BASE}/intelligence/executive-report?project_id=${projectId}` : `${API_BASE}/intelligence/executive-report`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Falha ao gerar relatório executivo');
  return res.json();
}
