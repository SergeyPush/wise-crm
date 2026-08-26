import { defineConfig, devices } from '@playwright/test';

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://wisecrm:wisecrm@localhost:5434/wisecrm_test?schema=public';

/**
 * 09-implementation-plan.md, раздел 5.3: восемь сценариев, не больше — самые
 * медленные и хрупкие тесты, набор без потолка начнёт падать по чужим причинам.
 * Добавляются по мере стабилизации экранов, не раньше (иначе переписываются трижды).
 *
 * Поднимает API и фронт против отдельной БД `postgres_test` — той же, что
 * держат API-тесты (запускаются последовательно, не параллельно с ними).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter api start:e2e',
      url: 'http://localhost:3001/api/v1/health',
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        NODE_ENV: 'test',
        DATABASE_URL: TEST_DB_URL,
        PORT: '3001',
        JWT_ACCESS_SECRET: 'e2e-access-secret-value-at-least-32-chars',
        JWT_REFRESH_SECRET: 'e2e-refresh-secret-value-at-least-32-chars',
        COOKIE_SECURE: 'false',
        APP_URL: 'http://localhost:5173',
        WEB_FORM_TOKEN: 'e2e-web-form-token',
        LOG_LEVEL: 'silent',
      },
    },
    {
      command: 'pnpm --filter web dev',
      url: 'http://localhost:5173',
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
