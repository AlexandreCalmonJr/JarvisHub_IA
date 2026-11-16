import { defineConfig } from '@playwright/test';
import { E2E } from './e2e/env';

export default defineConfig({
  testDir: './e2e/specs',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: E2E.dashboardUrl,
    channel: 'chrome',
    headless: true,
    locale: 'pt-PT',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: [
    {
      command: 'node e2e/fake-ollama.mjs 11435',
      url: 'http://127.0.0.1:11435/health',
      reuseExistingServer: false,
      timeout: 20_000,
    },
    {
      command:
        '".venv\\Scripts\\python.exe" -m uvicorn apps.api.main:app --host 127.0.0.1 --port 8020 --log-level warning',
      cwd: E2E.repoRoot,
      url: 'http://127.0.0.1:8020/health',
      reuseExistingServer: false,
      timeout: 180_000,
      env: { ...process.env, ...E2E.backendEnv, PYTHONUNBUFFERED: '1' },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 3100 --strictPort',
      url: E2E.dashboardUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { ...process.env, VITE_API_PROXY_TARGET: E2E.backendUrl },
    },
  ],
});
