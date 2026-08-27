import { expect, test } from '@playwright/test';
import { MANAGER_EMAIL, loginAs } from './helpers';

// Сценарій 5 із 8 (09-implementation-plan.md, розділ 5.3): чекбокс у списку
// задач відкриває поле результату, порожнє не приймається (FR-3.5).
test('закриття задачі, що вимагає результат', async ({ page }) => {
  await loginAs(page, MANAGER_EMAIL);

  const displayName = `E2E КП ${Date.now()}`;
  await page.goto('/clients');
  await page.getByRole('button', { name: 'Новий лід' }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByLabel("Ім'я або назва").fill(displayName);
  await drawer.getByLabel('Телефон').fill('0671234597');
  await drawer.getByLabel('Джерело').click();
  await page.getByRole('option').first().click();
  await drawer.getByRole('button', { name: 'Створити' }).click();
  await expect(page.getByRole('heading', { name: displayName })).toBeVisible();

  // Задача типу КП — через реєстр дій списку клієнтів (FR-8.1: ПКМ → «Створити
  // задачу» › «Підготувати КП»). Не «Подзвонити»: той самий текст є ще й
  // окремим верхньорівневим пунктом ПКМ (tel:-дія), локатор по тексту
  // ловить не той. Квіковий інпут на /tasks завжди створює ІНШЕ, де
  // результат не обов'язковий — тому й не годиться для цього сценарію.
  await page.goto('/clients');
  const clientRow = page.locator('tr', { hasText: displayName });
  await clientRow.click({ button: 'right' });
  await page.locator('.mantine-contextmenu-item-button-title', { hasText: 'Створити задачу' }).hover();
  const proposalTaskItem = page.locator('.mantine-contextmenu-item-button-title', { hasText: 'Підготувати КП' });
  await expect(proposalTaskItem).toBeVisible();
  // Клік лише запускає mutate() — не чекає відповіді; без цього goto() нижче
  // навігацією обриває ще не надісланий POST /tasks
  const [createResponse] = await Promise.all([
    page.waitForResponse((res) => res.url().includes('/api/v1/tasks') && res.request().method() === 'POST'),
    proposalTaskItem.click(),
  ]);
  expect(createResponse.ok()).toBeTruthy();

  await page.goto('/tasks');
  await page.getByRole('checkbox', { name: 'Завершити «Підготувати КП»' }).click();

  const modal = page.getByRole('dialog').filter({ hasText: 'Завершити задачу' });
  await expect(modal).toBeVisible();

  await modal.getByRole('button', { name: 'Завершити' }).click();
  await expect(modal.getByText('Вкажіть результат')).toBeVisible();
  await expect(modal).toBeVisible();

  await modal.getByLabel('Результат').fill('КП погоджено, чекаємо підпис');
  await modal.getByRole('button', { name: 'Завершити' }).click();
  await expect(modal).not.toBeVisible();
});
