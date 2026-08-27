import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TestApp, createTestApp, resetData } from './helpers/app';

/** NFR-32.2: помилка фронтенда долітає до логів без авторизації. */
describe('POST /client-errors (NFR-32.2)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetData(ctx.prisma);
  });

  function post(body: Record<string, unknown>) {
    return request(ctx.url).post('/api/v1/client-errors').send(body);
  }

  it('без авторизації і без CSRF-заголовка — 204', async () => {
    const res = await post({ message: 'TypeError: щось зламалось', url: 'https://crm.test/clients/123' });

    expect(res.status).toBe(204);
  });

  it('приймає стек і componentStack як необов’язкові поля', async () => {
    const res = await post({
      message: 'Render error',
      url: 'https://crm.test/tasks',
      stack: 'Error: x\n  at Component',
      componentStack: '  at TasksPage',
      userAgent: 'Mozilla/5.0',
    });

    expect(res.status).toBe(204);
  });

  it('без обов’язкового message — 400, а не 500', async () => {
    const res = await post({ url: 'https://crm.test' });

    expect(res.status).toBe(400);
  });

  it('без обов’язкового url — 400', async () => {
    const res = await post({ message: 'x' });

    expect(res.status).toBe(400);
  });

  it('зайве поле поза DTO відхиляється (forbidNonWhitelisted, NFR-18)', async () => {
    const res = await post({ message: 'x', url: 'https://crm.test', evil: '<script>' });

    expect(res.status).toBe(400);
  });
});
