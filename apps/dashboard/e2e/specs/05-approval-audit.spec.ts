import { expect, test } from '@playwright/test';
import { E2E } from '../env';
import { ensureImportedProject, loginAsAdmin } from '../support/helpers';

test.describe('Fluxo 5 — aprovação, diff e auditoria', () => {
  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
    await ensureImportedProject(context, E2E.fixtures.approval, 'approval-fixture');
  });

  test('mostra o diff, aprova a escrita e registra a auditoria', async ({ page, context }) => {
    const projectId = 'approval-fixture';
    const approvedPath = 'e2e-approved.txt';
    const approvedContent = 'E2E_CONFIRM = true\n';

    const seed = await context.request.post(
      `${E2E.dashboardUrl}/api/v1/workspace/projects/${projectId}/files/write`,
      {
        data: {
          path: approvedPath,
          content: approvedContent,
          reason: 'Fluxo E2E de aprovação',
        },
      },
    );
    expect(seed.ok()).toBeTruthy();
    const seedBody = (await seed.json()) as {
      status?: string;
      approval_id?: string;
      diff?: string;
    };
    expect(seedBody.status).toBe('approval_required');
    expect(seedBody.approval_id).toBeTruthy();
    expect(seedBody.diff).toContain('E2E_CONFIRM = true');

    await page.goto('/approvals');
    const approvedCard = page.locator('.glass-card').filter({ hasText: approvedPath });
    await expect(approvedCard.getByText('Diff Unificado Proposto:')).toBeVisible();
    await expect(approvedCard.getByText('E2E_CONFIRM = true')).toBeVisible();
    await approvedCard.getByRole('button', { name: 'Aprovar Operação' }).click();
    await expect(approvedCard).toHaveCount(0);

    const replay = await context.request.post(
      `${E2E.dashboardUrl}/api/v1/workspace/projects/${projectId}/files/write`,
      {
        data: {
          path: approvedPath,
          content: approvedContent,
          approval_id: seedBody.approval_id,
        },
      },
    );
    expect(replay.ok(), await replay.text()).toBeTruthy();
    const replayBody = (await replay.json()) as { status?: string };
    expect(replayBody.status).toBe('saved');

    const readBack = await context.request.get(
      `${E2E.dashboardUrl}/api/v1/workspace/projects/${projectId}/file?path=${encodeURIComponent(approvedPath)}`,
    );
    expect(readBack.ok()).toBeTruthy();
    const fileBody = (await readBack.json()) as { content?: string };
    expect(fileBody.content).toContain('E2E_CONFIRM = true');

    const rejectedPath = 'e2e-rejected.txt';
    const rejectedSeed = await context.request.post(
      `${E2E.dashboardUrl}/api/v1/workspace/projects/${projectId}/files/write`,
      {
        data: {
          path: rejectedPath,
          content: 'E2E_REJECT = true\n',
          reason: 'Fluxo E2E de recusa',
        },
      },
    );
    const rejectedBody = (await rejectedSeed.json()) as { status?: string; approval_id?: string };
    expect(rejectedBody.status).toBe('approval_required');
    expect(rejectedBody.approval_id).toBeTruthy();

    await page.reload();
    const rejectedCard = page.locator('.glass-card').filter({ hasText: rejectedPath });
    await expect(rejectedCard).toBeVisible();
    await rejectedCard.getByRole('button', { name: 'Recusar' }).click();
    await expect(rejectedCard).toHaveCount(0);

    const rejectedReplay = await context.request.post(
      `${E2E.dashboardUrl}/api/v1/workspace/projects/${projectId}/files/write`,
      {
        data: {
          path: rejectedPath,
          content: 'E2E_REJECT = true\n',
          approval_id: rejectedBody.approval_id,
        },
      },
    );
    expect(rejectedReplay.ok()).toBeFalsy();

    const audit = await context.request.get(`${E2E.dashboardUrl}/api/v1/audit/logs?limit=100`);
    expect(audit.ok()).toBeTruthy();
    const auditBody = (await audit.json()) as { events?: Array<{ operation?: string }> };
    const operations = (auditBody.events || []).map((event) => event.operation);
    expect(operations).toContain('APPROVAL_REQUEST_APPROVED');
    expect(operations).toContain('WORKSPACE_FILE_WRITE_APPROVED');
    expect(operations).toContain('APPROVAL_REQUEST_REJECTED');
  });
});
