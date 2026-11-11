import { API_BASE, handleApiResponse } from './client';

const requestOptions: RequestInit = { credentials: 'include' };

async function getJson<T>(path: string, error: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, requestOptions);
  return handleApiResponse<T>(response, error);
}

async function postJson<T>(path: string, payload: unknown, error: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...requestOptions,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleApiResponse<T>(response, error);
}

export function fetchMockEndpoints(): Promise<any[]> {
  return getJson('/mock-server/endpoints', 'Falha ao carregar endpoints simulados.');
}

export async function saveMockEndpoint(payload: any): Promise<any> {
  return postJson('/mock-server/endpoints', payload, 'Falha ao salvar mock endpoint.');
}

export async function deleteMockEndpoint(id: string): Promise<any> {
  const response = await fetch(`${API_BASE}/mock-server/endpoints/${encodeURIComponent(id)}`, {
    ...requestOptions,
    method: 'DELETE',
  });
  return handleApiResponse(response, 'Falha ao excluir mock endpoint.');
}

export function fetchProjectDatabases(projectId: string): Promise<any[]> {
  return getJson(`/backend-studio/databases/${encodeURIComponent(projectId)}`, 'Falha ao carregar bancos do projeto.');
}

export function inspectSqlDatabase(dbPath: string, projectId: string): Promise<any> {
  return postJson('/backend-studio/sql/inspect', {
    db_path: dbPath, project_id: projectId,
  }, 'Falha ao inspecionar banco SQLite.');
}

export function executeSqlQuery(
  dbPath: string, query: string, projectId: string, limit = 200
): Promise<any> {
  return postJson('/backend-studio/sql/query', {
    db_path: dbPath, query, project_id: projectId, limit,
  }, 'Falha ao executar consulta SQL.');
}

export function auditSqlQuery(dbPath: string, query: string, projectId: string): Promise<any> {
  return postJson('/backend-studio/sql/audit', {
    db_path: dbPath, query, project_id: projectId,
  }, 'Falha ao auditar plano de consulta.');
}

export function fetchProjectTests(projectId: string): Promise<any> {
  return getJson(`/quality-studio/tests/${encodeURIComponent(projectId)}`, 'Falha ao carregar testes do projeto.');
}

export function runProjectTests(
  projectId: string, testFile?: string, timeoutSeconds = 45
): Promise<any> {
  return postJson('/quality-studio/run', {
    project_id: projectId, test_file: testFile, timeout_seconds: timeoutSeconds,
  }, 'Falha na execução de testes.');
}

export function generatePlaywrightTest(
  targetUrl: string, scenarioName: string, steps?: any[]
): Promise<any> {
  return postJson('/quality-studio/generate-playwright', {
    target_url: targetUrl, scenario_name: scenarioName, steps,
  }, 'Falha ao gerar teste Playwright.');
}

export function fetchChaosEdgeCases(): Promise<any[]> {
  return getJson('/quality-studio/chaos-edge-cases', 'Falha ao carregar casos de borda.');
}

export function extractColorPalette(hexPrimary: string, name?: string): Promise<any> {
  return postJson('/design-studio/palette', {
    hex_primary: hexPrimary, name,
  }, 'Falha ao extrair paleta.');
}

export function auditWcagAccessibility(markup: string): Promise<any> {
  return postJson('/design-studio/audit-wcag', { markup }, 'Falha ao auditar acessibilidade.');
}

export function fetchComponentBoilerplate(componentType: string): Promise<any> {
  return getJson(
    `/design-studio/components/${encodeURIComponent(componentType)}`,
    'Falha ao obter boilerplate de componente.'
  );
}

export function fetchProjectTechDebt(projectId: string): Promise<any> {
  return getJson(
    `/intelligence/tech-debt/${encodeURIComponent(projectId)}`,
    'Falha na análise de dívida técnica.'
  );
}

export function fetchProductivityRoi(): Promise<any> {
  return getJson('/intelligence/productivity-roi', 'Falha ao carregar métricas globais.');
}

export function fetchExecutiveReport(projectId?: string): Promise<any> {
  const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : '';
  return getJson(`/intelligence/executive-report${query}`, 'Falha ao gerar relatório executivo.');
}
