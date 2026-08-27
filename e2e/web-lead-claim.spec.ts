import { expect, test } from '@playwright/test';
import { MANAGER_EMAIL, loginAs } from './helpers';

// Сценарій 3 із 8 (09-implementation-plan.md, розділ 5.3): заявка відправляється
// через API (як реальна форма сайту), лід видно в «Нерозподілені», «Взяти
// в роботу» призначає поточного користувача (FR-W1, FR-W5, FR-8.1).
test('заявка з сайту до взяття в роботу', async ({ page }) => {
  await loginAs(page, MANAGER_EMAIL);

  const displayName = `E2E Веб-заявка ${Date.now()}`;
  const phone = `067${String(Date.now()).slice(-7)}`;

  // Токен — той самий WEB_FORM_TOKEN, що заведений у webServer env
  // playwright.config.ts; без нього FR-W1 просто мовчки не створює клієнта
  const submission = await page.request.post('/api/v1/public/leads', {
    headers: { 'x-web-form-token': 'e2e-web-form-token' },
    data: { name: displayName, phone },
  });
  expect(submission.ok()).toBeTruthy();

  await page.goto('/clients');
  await page.getByRole('button', { name: 'Нерозподілені' }).click();

  const row = page.locator('tr', { hasText: displayName });
  await expect(row).toBeVisible();
  await expect(row.getByText('Нерозподілений')).toBeVisible();

  await row.click({ button: 'right' });
  await page.locator('.mantine-contextmenu-item-button-title', { hasText: 'Взяти в роботу' }).click();

  // Клієнт зникає з пулу — «Нерозподілені» фільтрує по assigneeId=none
  await expect(row).not.toBeVisible();

  await page.getByRole('button', { name: 'Мої' }).click();
  await expect(page.locator('tr', { hasText: displayName })).toBeVisible();
});
