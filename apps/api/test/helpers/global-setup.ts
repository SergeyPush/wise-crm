import { execSync } from 'node:child_process';

/**
 * Разово перед всем прогоном: миграции на postgres_test.
 * `migrate deploy`, а не `db push` — тестируется ровно та схема,
 * которая поедет на прод, вместе с SQL-миграциями частичных индексов.
 */
export default function setup(): void {
  const url =
    process.env.TEST_DATABASE_URL ??
    'postgresql://wisecrm:wisecrm@localhost:5434/wisecrm_test?schema=public';

  const env = { ...process.env, DATABASE_URL: url };
  execSync('pnpm exec prisma migrate deploy', { env, stdio: 'inherit' });
  // Справочники — часть схемы, а не тестовые данные: без статуса не создаётся
  // ни один клиент. Сидируются один раз, между тестами не чистятся.
  execSync('pnpm exec tsx prisma/seed.ts', { env, stdio: 'inherit' });
}
