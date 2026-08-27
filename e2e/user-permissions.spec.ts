import { expect, test } from '@playwright/test';
import { MANAGER_EMAIL, loginAs } from './helpers';

// Сценарій 8 із 8 (09-implementation-plan.md, розділ 5.3): у USER немає
// пунктів «Користувачі»/«Довідники» в сайдбарі, прямий перехід за URL
// дає екран «Недостатньо прав» (RequireAuth), а не пусту сторінку чи редірект
// у нікуди. manager@dev.local — рівно роль USER (seed-dev.ts), окремий
// акаунт не потрібен.
test('права очима USER', async ({ page }) => {
  await loginAs(page, MANAGER_EMAIL);

  await expect(page.getByRole('link', { name: 'Користувачі' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Довідники' })).toHaveCount(0);

  await page.goto('/settings/users');
  await expect(page.getByRole('heading', { name: 'Недостатньо прав' })).toBeVisible();
  await expect(page.getByText('Цей розділ доступний лише адміністратору.')).toBeVisible();

  await page.goto('/settings/dictionaries');
  await expect(page.getByRole('heading', { name: 'Недостатньо прав' })).toBeVisible();
});
