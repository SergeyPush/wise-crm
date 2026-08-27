import { expect, test } from '@playwright/test';
import { MANAGER_EMAIL, loginAs } from './helpers';

// Сценарій 4 із 8 (09-implementation-plan.md, розділ 5.3): ПКМ по рядку,
// «Змінити статус», тост і кнопка «Скасувати» повертають попередній статус
// (FR-8.1, FR-8.8).
test('ПКМ і оптимістичний відкат', async ({ page }) => {
  await loginAs(page, MANAGER_EMAIL);

  const displayName = `E2E ПКМ ${Date.now()}`;
  await page.goto('/clients');
  await page.getByRole('button', { name: 'Новий лід' }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByLabel("Ім'я або назва").fill(displayName);
  await drawer.getByLabel('Телефон').fill('0671234598');
  await drawer.getByLabel('Джерело').click();
  await page.getByRole('option').first().click();
  await drawer.getByRole('button', { name: 'Створити' }).click();
  await expect(page.getByRole('heading', { name: displayName })).toBeVisible();

  // Свіжий лід стоїть у статусі «Лід» (isDefaultForNew) — саме на нього чекаємо назад
  await page.goto('/clients');
  const row = page.locator('tr', { hasText: displayName });
  await expect(row.getByText('Лід', { exact: true })).toBeVisible();

  // Пункти ПКМ мають клас mantine-contextmenu-item-button-title — скоуп по
  // ньому, а не по видимому тексту: той самий статус уже є в демо-даних
  // seed-dev, і page-wide getByText ловить чужий бейдж у таблиці
  await row.click({ button: 'right' });
  await page.locator('.mantine-contextmenu-item-button-title', { hasText: 'Змінити статус' }).hover();
  const targetStatus = page.locator('.mantine-contextmenu-item-button-title', { hasText: 'Переговори' });
  await expect(targetStatus).toBeVisible();
  await targetStatus.click();

  await expect(page.getByText('Статус змінено на «Переговори»')).toBeVisible();
  await expect(row.getByText('Переговори', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Скасувати' }).click();
  await expect(row.getByText('Лід', { exact: true })).toBeVisible();
});
