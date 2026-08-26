import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AUTH } from 'shared';
import { Agent, cloneSession } from './helpers/agent';
import { TestApp, createTestApp, resetData } from './helpers/app';
import { DEFAULT_PASSWORD, makeUser } from './helpers/factories';

describe('Автентифікація та сесії', () => {
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

  const agent = () => new Agent(ctx.url);

  it('вхід із вірним паролем видає сесію', async () => {
    const user = await makeUser(ctx.prisma, { email: 'ok@test.ua' });
    const a = agent();

    const res = await a.login('ok@test.ua', DEFAULT_PASSWORD);

    expect(res.status).toBe(201);
    expect(res.body.user.id).toBe(user.id);
    expect(a.hasSession()).toBe(true);
  });

  it('невірний пароль не видає сесію і не розрізняє причину', async () => {
    await makeUser(ctx.prisma, { email: 'bad@test.ua' });
    const a = agent();

    const wrongPassword = await a.login('bad@test.ua', 'WrongPassword123');
    const unknownEmail = await a.login('nobody@test.ua', 'WrongPassword123');

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    // Разные тексты позволили бы перебрать список сотрудников
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
    expect(a.hasSession()).toBe(false);
  });

  it('деактивований користувач не входить', async () => {
    await makeUser(ctx.prisma, { email: 'off@test.ua', isActive: false });

    const res = await agent().login('off@test.ua', DEFAULT_PASSWORD);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_INACTIVE');
  });

  // FR-1.5: блокировка по email, а не по IP
  it('блокує email після 10 невдалих спроб', async () => {
    await makeUser(ctx.prisma, { email: 'lock@test.ua' });
    const a = agent();

    for (let i = 0; i < AUTH.LOGIN_ATTEMPTS_PER_EMAIL; i++) {
      await a.login('lock@test.ua', 'WrongPassword123');
    }

    const blocked = await a.login('lock@test.ua', DEFAULT_PASSWORD);
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('блокування email не зачіпає колегу з тієї ж адреси', async () => {
    await makeUser(ctx.prisma, { email: 'victim@test.ua' });
    await makeUser(ctx.prisma, { email: 'colleague@test.ua' });
    const a = agent();

    for (let i = 0; i < AUTH.LOGIN_ATTEMPTS_PER_EMAIL; i++) {
      await a.login('victim@test.ua', 'WrongPassword123');
    }

    // Офис сидит за одним NAT — лимит по email не должен ронять соседа
    const colleague = await agent().login('colleague@test.ua', DEFAULT_PASSWORD);
    expect(colleague.status).toBe(201);
  });

  it('успішний вхід обнуляє лічильник невдач', async () => {
    await makeUser(ctx.prisma, { email: 'reset@test.ua' });
    const a = agent();

    for (let i = 0; i < 9; i++) await a.login('reset@test.ua', 'WrongPassword123');
    await a.login('reset@test.ua', DEFAULT_PASSWORD);
    for (let i = 0; i < 9; i++) await a.login('reset@test.ua', 'WrongPassword123');

    const res = await a.login('reset@test.ua', DEFAULT_PASSWORD);
    expect(res.status).toBe(201);
  });

  // NFR-43 отменено (решение от 26.08.2026): ADMIN входит по email+паролю,
  // как и USER — без второго фактора.
  it('ADMIN входить лише поштою і паролем, без другого кроку', async () => {
    await makeUser(ctx.prisma, { email: 'admin@test.ua', role: 'ADMIN' });
    const a = agent();

    const res = await a.login('admin@test.ua', DEFAULT_PASSWORD);
    expect(res.status).toBe(201);
    expect((await a.get('/users')).status).toBe(200);
  });

  describe('Сесії', () => {
    it('ротація refresh видає нові токени', async () => {
      await makeUser(ctx.prisma, { email: 'rot@test.ua' });
      const a = agent();
      await a.login('rot@test.ua', DEFAULT_PASSWORD);

      const res = await a.post('/auth/refresh');

      expect(res.status).toBe(201);
      expect(await ctx.prisma.refreshToken.count({ where: { revokedAt: { not: null } } })).toBe(1);
    });

    it('повторне використання відкликаного refresh відкликає всю сімʼю', async () => {
      const user = await makeUser(ctx.prisma, { email: 'steal@test.ua' });
      const a = new Agent(ctx.url);
      await a.login('steal@test.ua', DEFAULT_PASSWORD);
      const stolen = await ctx.prisma.refreshToken.findFirstOrThrow({ where: { userId: user.id } });
      // Копия cookie на момент до ротации — как если бы токен украли
      const thief = cloneSession(a, ctx.url);

      await a.post('/auth/refresh'); // легитимная ротация
      const replay = await thief.post('/auth/refresh');
      expect(replay.status).toBe(401);

      // Украденный токен использовать не удалось, и вся цепочка закрыта
      const alive = await ctx.prisma.refreshToken.count({
        where: { familyId: stolen.familyId, revokedAt: null },
      });
      expect(alive).toBe(0);
    });

    it('зміна пароля відкликає всі сесії', async () => {
      const user = await makeUser(ctx.prisma, { email: 'chg@test.ua' });
      const a = agent();
      await a.login('chg@test.ua', DEFAULT_PASSWORD);

      const res = await a.post('/me/password', {
        currentPassword: DEFAULT_PASSWORD,
        newPassword: 'BrandNewPassword2026',
      });

      expect(res.status).toBe(201);
      const alive = await ctx.prisma.refreshToken.count({
        where: { userId: user.id, revokedAt: null },
      });
      expect(alive).toBe(0);
    });

    it('слабкий пароль зі списку витоків не приймається (NFR-14)', async () => {
      await makeUser(ctx.prisma, { email: 'weak@test.ua' });
      const a = agent();
      await a.login('weak@test.ua', DEFAULT_PASSWORD);

      const res = await a.post('/me/password', {
        currentPassword: DEFAULT_PASSWORD,
        newPassword: 'password123',
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PASSWORD_TOO_WEAK');
    });
  });

  describe('CSRF (NFR-15)', () => {
    it('мутація без заголовка відхиляється', async () => {
      await makeUser(ctx.prisma, { email: 'csrf@test.ua' });
      const a = agent();
      await a.login('csrf@test.ua', DEFAULT_PASSWORD);

      const res = await a.postWithoutCsrf('/me/password', {
        currentPassword: DEFAULT_PASSWORD,
        newPassword: 'BrandNewPassword2026',
      });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CSRF_INVALID');
    });
  });

  it('помилка містить requestId для звернення в підтримку (NFR-31.2)', async () => {
    const res = await agent().get('/users');

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    expect(res.body.requestId).toBeTruthy();
  });
});
