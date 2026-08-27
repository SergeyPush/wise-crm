import { ConfigService } from '@nestjs/config';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorageService as StorageServiceType } from './storage.service';

const statfsMock = vi.fn();
// Мокаем тільки statfs — решта fs/promises лишається справжньою (mkdir тут не потрібен).
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, statfs: statfsMock };
});

/**
 * NFR-33/04-deployment.md: «> 85% зайнятості диска — відмова у завантаженні».
 * У NODE_ENV=test перевірка навмисно вимкнена (комент у самому сервісі) —
 * тому тест підміняє NODE_ENV на 'production' локально й повертає назад.
 */
describe('StorageService.isDiskAlmostFull', () => {
  const originalEnv = process.env.NODE_ENV;
  let StorageService: typeof StorageServiceType;
  let service: StorageServiceType;

  // Динамічний import — після vi.mock, інакше мок не встигне підключитись до модуля
  // (top-level await тут неможливий: apps/api збирається під CommonJS).
  beforeAll(async () => {
    ({ StorageService } = await import('./storage.service'));
  });

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    const config = { get: () => './uploads' } as unknown as ConfigService;
    service = new StorageService(config);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    statfsMock.mockReset();
  });

  it('> 85% зайнятості — true (відмова у завантаженні)', async () => {
    statfsMock.mockResolvedValue({ blocks: 100, bavail: 10 }); // 90% зайнято
    expect(await service.isDiskAlmostFull()).toBe(true);
  });

  it('рівно поріг (85%) — ще false, менше не значить «майже повний»', async () => {
    statfsMock.mockResolvedValue({ blocks: 100, bavail: 15 }); // рівно 85%
    expect(await service.isDiskAlmostFull()).toBe(false);
  });

  it('<= 80% зайнятості — false', async () => {
    statfsMock.mockResolvedValue({ blocks: 100, bavail: 20 }); // 80% зайнято
    expect(await service.isDiskAlmostFull()).toBe(false);
  });

  it('statfs недоступний (best-effort) — не блокує завантаження', async () => {
    statfsMock.mockRejectedValue(new Error('ENOSYS'));
    expect(await service.isDiskAlmostFull()).toBe(false);
  });

  it('у NODE_ENV=test перевірка вимкнена свідомо — тести не залежать від диска хосту', async () => {
    process.env.NODE_ENV = 'test';
    statfsMock.mockResolvedValue({ blocks: 100, bavail: 1 }); // 99% зайнято — і все одно false
    expect(await service.isDiskAlmostFull()).toBe(false);
  });
});
