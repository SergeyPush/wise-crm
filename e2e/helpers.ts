import { Page, expect } from '@playwright/test';

// Пароль і адреси dev-акаунтів — те же значения, что заводит
// apps/api/prisma/seed-dev.ts. Не секрет: акаунти существуют только
// в одноразовой БД postgres_test, поднятой под конкретный прогон.
export const DEV_PASSWORD = 'DevPassword2026x';
export const ADMIN_EMAIL = 'admin@dev.local';
export const MANAGER_EMAIL = 'manager@dev.local';

export async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Пошта').fill(email);
  await page.getByLabel('Пароль').fill(DEV_PASSWORD);
  await page.getByRole('button', { name: 'Увійти' }).click();
  await expect(page).toHaveURL('/');
}
