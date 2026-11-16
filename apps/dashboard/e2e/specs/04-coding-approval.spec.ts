import { expect, test } from '@playwright/test';
import { E2E } from '../env';
import { ensureImportedProject, loginAsAdmin } from '../support/helpers';

test.describe('Fluxo 4 — Coding Agent com aprovação', () => {
  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
    await ensureImportedProject(context, E2E.fixtures.coding, 'coding-fixture');
  });

  test('pede aprovação humana, executa o comando e conclui', async ({ page }) => {
    await page.goto('/coding');

    const projectSelect = page.locator('select').first();
    await expect(projectSelect.locator('option', { hasText: 'Coding Fixture' })).toHaveCount(1);
    await projectSelect.selectOption('coding-fixture');
    await page.locator('select').nth(1).selectOption('ask');

    const prompt = page.getByPlaceholder(/Descreva a tarefa de código/);
    await prompt.fill('Executar a verificação E2E do projeto.');
    await page.locator('button[title="Executar agente"]').click();

    await expect(page.getByText('Aprovação necessária')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Aprovar', exact: true }).click();

    await expect(page.getByText('e2e-coding-ok').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Execução E2E concluída.', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Concluído em \d+ iteração/)).toBeVisible();
  });
});
