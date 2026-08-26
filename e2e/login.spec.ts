import { expect, test } from '@playwright/test';
import { DEV_PASSWORD, MANAGER_EMAIL } from './helpers';

// Сценарий 1 из 8 (09-implementation-plan.md, раздел 5.3).
test.describe('Логін', () => {
  test('вхід відкриває дашборд', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Пошта').fill(MANAGER_EMAIL);
    await page.getByLabel('Пароль').fill(DEV_PASSWORD);
    await page.getByRole('button', { name: 'Увійти' }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByText(/Вітаємо/)).toBeVisible();
  });

  test('невірний пароль не пускає', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Пошта').fill(MANAGER_EMAIL);
    await page.getByLabel('Пароль').fill('wrong-password-x');
    await page.getByRole('button', { name: 'Увійти' }).click();

    await expect(page).toHaveURL('/login');
    await expect(page.getByText('Невірна пошта або пароль')).toBeVisible();
  });
});
