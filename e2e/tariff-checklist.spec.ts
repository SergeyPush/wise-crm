import { expect, test } from '@playwright/test';
import { MANAGER_EMAIL, loginAs } from './helpers';

// Сценарій 6 із 8 (09-implementation-plan.md, розділ 5.3): перехід у «Договір
// підписано» показує незаповнені поля блоку «Для тарифу», але не блокує
// перехід (FR-2.0.5).
test('чек-лист перед закриттям угоди', async ({ page }) => {
  await loginAs(page, MANAGER_EMAIL);

  const displayName = `E2E Тариф ${Date.now()}`;
  await page.goto('/clients');
  await page.getByRole('button', { name: 'Новий лід' }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByLabel("Ім'я або назва").fill(displayName);
  await drawer.getByLabel('Телефон').fill('0671234596');
  await drawer.getByLabel('Джерело').click();
  await page.getByRole('option').first().click();
  await drawer.getByRole('button', { name: 'Створити' }).click();

  // Створення переносить одразу на картку — тариф свідомо не заповнений
  await expect(page.getByRole('heading', { name: displayName })).toBeVisible();
  await page.getByText('Лід', { exact: true }).click();

  const modal = page.getByRole('dialog').filter({ hasText: 'Зміна статусу' });
  await expect(modal).toBeVisible();
  await modal.getByLabel('Новий статус').click();
  await page.getByRole('option', { name: 'Договір підписано' }).click();

  await expect(modal.getByText('Не заповнено для тарифу')).toBeVisible();
  await expect(modal.getByText('Система оподаткування')).toBeVisible();

  // «Зберегти» не блокується чек-листом — перехід відбувається все одно
  await modal.getByRole('button', { name: 'Зберегти' }).click();
  await expect(modal).not.toBeVisible();
  await expect(page.getByText('Договір підписано', { exact: true })).toBeVisible();
});
