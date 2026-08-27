import { expect, test } from '@playwright/test';
import { MANAGER_EMAIL, loginAs } from './helpers';

// Сценарій 7 із 8 (09-implementation-plan.md, розділ 5.3): F5 на /clients/<uuid>
// віддає застосунок, а не 404. Дешевий тест, що ловить цілий клас проблем
// з деплоєм (SPA-фолбек на сервері/у nginx, розділ 0 плану).
test('глибокий URL і оновлення сторінки', async ({ page }) => {
  await loginAs(page, MANAGER_EMAIL);

  const displayName = `E2E Deep URL ${Date.now()}`;
  await page.goto('/clients');
  await page.getByRole('button', { name: 'Новий лід' }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByLabel("Ім'я або назва").fill(displayName);
  await drawer.getByLabel('Телефон').fill(`067${String(Date.now()).slice(-7)}`);
  await drawer.getByLabel('Джерело').click();
  await page.getByRole('option').first().click();
  await drawer.getByRole('button', { name: 'Створити' }).click();
  await expect(page.getByRole('heading', { name: displayName })).toBeVisible();

  const deepUrl = page.url(); // /clients/<uuid>, а не корінь чи список
  expect(deepUrl).toMatch(/\/clients\/[0-9a-f-]{36}$/);

  // Повне перезавантаження (не router.navigate) — саме так поводиться F5
  await page.reload();

  await expect(page.getByRole('heading', { name: displayName })).toBeVisible();
  expect(page.url()).toBe(deepUrl);
});
