import { expect, test } from '@playwright/test';
import { E2E } from '../env';
import { loginAsAdmin, sse } from '../support/helpers';

test.describe('Fluxo 1 — autenticação e chat', () => {
  test('login por token admin e resposta em streaming', async ({ page, context }) => {
    // Garante que o onboarding já está concluído antes do login pela UI.
    await loginAsAdmin(context);
    await context.clearCookies();

    await page.goto('/chat');
    await expect(page.locator('#login-title')).toHaveText('Bem-vindo de volta');

    await page.getByRole('button', { name: 'Token admin', exact: true }).click();
    await page.locator('#auth-token').fill(E2E.adminToken);
    await page.getByRole('button', { name: 'Validar acesso' }).click();

    const input = page.getByPlaceholder(/Como posso ajudar/);
    await expect(input).toBeVisible();

    await page.route('**/api/v1/chat/stream', async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache',
        },
        body: sse([
          { type: 'meta', task_id: 'e2e-chat-1', intent: 'conversation' },
          { type: 'token', chunk: 'Resposta E2E' },
          { type: 'token', chunk: ' recebida.' },
          {
            type: 'done',
            task_id: 'e2e-chat-1',
            final_summary: 'Resposta E2E recebida.',
            is_completed: true,
            sources: [],
          },
        ]),
      });
    });

    await input.fill('Olá JARVIS, teste E2E.');
    await input.press('Enter');

    await expect(page.getByText('Olá JARVIS, teste E2E.')).toBeVisible();
    await expect(page.getByText('Resposta E2E recebida.').first()).toBeVisible();
    await expect(page.getByText(/provedor offline/i)).toHaveCount(0);
  });
});
