import { expect, test } from '@playwright/test';
import { loginAsAdmin, sse } from '../support/helpers';

test.describe('Fluxo 2 — chat com fontes', () => {
  test.beforeEach(async ({ context }) => {
    await loginAsAdmin(context);
  });

  test('renderiza as fontes devolvidas no evento done', async ({ page }) => {
    await page.goto('/chat');
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
          { type: 'meta', task_id: 'e2e-chat-2', intent: 'conversation' },
          { type: 'token', chunk: 'A resposta usa o índice local.' },
          {
            type: 'done',
            task_id: 'e2e-chat-2',
            final_summary: 'A resposta usa o índice local.',
            is_completed: true,
            sources: [
              {
                title: 'Documentação E2E',
                url: 'https://example.test/docs',
                retrieved_at: '2026-11-16',
              },
            ],
          },
        ]),
      });
    });

    await input.fill('Consulte a documentação E2E.');
    await input.press('Enter');

    await expect(page.getByText('A resposta usa o índice local.').first()).toBeVisible();
    await expect(page.getByText('Fontes consultadas')).toBeVisible();
    const link = page.getByRole('link', { name: 'Documentação E2E' });
    await expect(link).toHaveAttribute('href', 'https://example.test/docs');
    await expect(page.getByText('2026-11-16')).toBeVisible();
  });
});
