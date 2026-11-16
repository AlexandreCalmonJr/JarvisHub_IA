import { expect, type BrowserContext } from '@playwright/test';
import { E2E } from '../env';

export interface WorkspaceProject {
  id?: string;
  project_id?: string;
  name?: string;
}

export function sse(events: Array<Record<string, unknown>>): string {
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
}

export async function loginAsAdmin(context: BrowserContext): Promise<void> {
  const response = await context.request.post(`${E2E.dashboardUrl}/api/v1/auth/login`, {
    data: { token: E2E.adminToken },
    headers: { Accept: 'application/json' },
  });
  expect(response.ok(), `login falhou: HTTP ${response.status()} ${await response.text()}`).toBeTruthy();

  const session = await context.request.get(`${E2E.dashboardUrl}/api/v1/auth/me`);
  expect(session.ok(), 'sessão não ficou autenticada').toBeTruthy();
  const principal = (await session.json()) as { role?: string; must_change_password?: boolean };
  expect(principal.role).toBe('admin');

  // A credencial de desenvolvimento default obriga a troca antes de usar a UI.
  if (principal.must_change_password) {
    const change = await context.request.post(
      `${E2E.dashboardUrl}/api/v1/auth/password/change`,
      {
        data: {
          current_password: 'jarvishub',
          new_password: E2E.adminPassword,
        },
      },
    );
    expect(
      change.ok(),
      `troca da credencial inicial falhou: HTTP ${change.status()} ${await change.text()}`,
    ).toBeTruthy();
  }

  // Evita que o assistente de configuração inicial bloqueie as telas nos testes.
  await context.request.post(`${E2E.dashboardUrl}/api/v1/system/onboarding/complete`, { data: {} });
}

export async function listProjects(context: BrowserContext): Promise<WorkspaceProject[]> {
  const response = await context.request.get(`${E2E.dashboardUrl}/api/v1/workspace/projects`);
  expect(response.ok(), `listagem de projetos falhou: HTTP ${response.status()}`).toBeTruthy();
  return (await response.json()) as WorkspaceProject[];
}

export async function ensureImportedProject(
  context: BrowserContext,
  folderPath: string,
  projectId: string,
): Promise<void> {
  const projects = await listProjects(context);
  if (projects.some((project) => (project.id || project.project_id) === projectId)) return;

  const first = await context.request.post(`${E2E.dashboardUrl}/api/v1/workspace/import`, {
    data: { folder_path: folderPath },
    headers: { Accept: 'application/json' },
  });
  expect(first.ok(), `pedido de importação falhou: HTTP ${first.status()}`).toBeTruthy();
  const pending = (await first.json()) as { status?: string; approval_id?: string };
  expect(pending.status).toBe('approval_required');
  expect(pending.approval_id, 'importação sem approval_id').toBeTruthy();

  const decision = await context.request.post(
    `${E2E.dashboardUrl}/api/v1/approvals/${pending.approval_id}/decide`,
    { data: { action: 'approve', reason: 'Preparação da suite E2E' } },
  );
  expect(decision.ok(), `decisão de aprovação falhou: HTTP ${decision.status()}`).toBeTruthy();

  const second = await context.request.post(`${E2E.dashboardUrl}/api/v1/workspace/import`, {
    data: { folder_path: folderPath, approval_id: pending.approval_id },
    headers: { Accept: 'application/json' },
  });
  expect(second.ok(), `importação aprovada falhou: HTTP ${second.status()} ${await second.text()}`).toBeTruthy();
  const imported = (await second.json()) as { status?: string; id?: string };
  expect(imported.status).toBe('imported');
  expect(imported.id).toBe(projectId);
}
