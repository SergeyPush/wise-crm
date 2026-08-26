import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

/**
 * Один раннер на юнит и API (09-implementation-plan.md, раздел 5): на фронте
 * всё равно Vite, а два раннера с разными способами мокать — лишнее трение.
 *
 * swc вместо esbuild обязателен: Nest живёт на emitDecoratorMetadata,
 * которого esbuild не эмитит, и DI в тестах рассыпается.
 */
export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: { target: 'es2022', parser: { syntax: 'typescript', decorators: true }, transform: { decoratorMetadata: true } },
    }),
  ],
  test: {
    globals: true,
    // API-тесты делят один postgres_test: параллельные файлы вычищали бы
    // данные друг другу через TRUNCATE между тестами.
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
    projects: [
      {
        // Юнит: чистая логика, без БД и HTTP — миллисекунды на прогон
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts'],
          environment: 'node',
        },
      },
      {
        // API: supertest против настоящего Postgres. Мокать Prisma смысла нет —
        // транзакции, каскады и частичные уникальные индексы живут в базе.
        extends: true,
        test: {
          name: 'api',
          include: ['test/**/*.api-spec.ts'],
          environment: 'node',
          globalSetup: ['./test/helpers/global-setup.ts'],
          setupFiles: ['./test/helpers/setup.ts'],
          // Общая БД на прогон: параллельные файлы затирали бы друг другу данные
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
