import { expect, test } from '@playwright/test';
import { E2E } from '../env';
import { loginAsAdmin } from '../support/helpers';

test.describe('Fluxo 3 — workspace e base de dados', () => {
  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
  });

  test('importa pasta local com SQLite e consulta no Backend Studio', async ({ page }) => {
    await page.goto('/workspace');
    await page.getByRole('button', { name: 'Anexar Pasta Local' }).click();
    await page.locator('input[placeholder*="SeuUsuario"]').fill(E2E.fixtures.workspace);
    await page.getByRole('button', { name: 'Anexar e Escanear' }).click();

    await page.getByRole('button', { name: 'Aprovar e continuar' }).click();
    await expect(page.getByRole('heading', { name: 'Workspace Fixture' })).toBeVisible({
      timeout: 30_000,
    });

    await page.goto('/backend-studio');
    await page.getByRole('button', { name: 'Playground SQL & Índices' }).click();

    const projectSelect = page.locator('select').first();
    await expect(projectSelect.locator('option', { hasText: 'Workspace Fixture' })).toHaveCount(1);
    await projectSelect.selectOption('workspace-fixture');

    const databaseSelect = page.locator('select').nth(1);
    await expect(databaseSelect.locator('option', { hasText: 'app.db' })).toHaveCount(1);
    await databaseSelect.selectOption('app.db');

    await page
      .getByPlaceholder(/Digite sua instrução SQL/)
      .fill('SELECT id, title FROM tasks ORDER BY id;');
    await page.getByRole('button', { name: 'Executar Consulta' }).click();

    await expect(page.getByText('Resultado da Execução')).toBeVisible();
    await expect(page.getByText('Preparar workspace')).toBeVisible();
    await expect(page.getByText('Validar fluxo E2E')).toBeVisible();
    await expect(page.getByText('2 registros')).toBeVisible();
  });
});
