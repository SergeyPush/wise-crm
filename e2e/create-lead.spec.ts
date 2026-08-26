import { expect, test } from '@playwright/test';
import { MANAGER_EMAIL, loginAs } from './helpers';

// Сценарий 2 из 8 (09-implementation-plan.md, раздел 5.3): форма в чотири
// поля (FR-2.0.4), клієнт з'являється в списку і у «Мої».
test('заведення ліда', async ({ page }) => {
  await loginAs(page, MANAGER_EMAIL);

  const displayName = `E2E Лід ${Date.now()}`;
  await page.goto('/clients');
  await page.getByRole('button', { name: 'Новий лід' }).click();

  const drawer = page.getByRole('dialog');
  await drawer.getByLabel("Ім'я або назва").fill(displayName);
  await drawer.getByLabel('Телефон').fill('0671234567');
  await drawer.getByLabel('Джерело').click();
  await page.getByRole('option').first().click();
  await drawer.getByRole('button', { name: 'Створити' }).click();

  // Створення переносить на картку клієнта
  await expect(page.getByRole('heading', { name: displayName })).toBeVisible();

  await page.goto('/clients');
  await expect(page.getByText(displayName)).toBeVisible();
});
