import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Agent } from './helpers/agent';
import { TestApp, createTestApp, resetData } from './helpers/app';
import { DEFAULT_PASSWORD, makeClient, makeTask, makeUser } from './helpers/factories';

describe('Користувачі (ADMIN)', () => {
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

  async function loggedInAdmin(email = 'boss@test.ua') {
    const admin = await makeUser(ctx.prisma, { email, role: 'ADMIN', fullName: 'Керівник' });
    const a = new Agent(ctx.url);
    await a.login(email, DEFAULT_PASSWORD);
    return { admin, agent: a };
  }

  async function loggedInUser(email = 'staff@test.ua') {
    const user = await makeUser(ctx.prisma, { email, role: 'USER', fullName: 'Співробітник' });
    const a = new Agent(ctx.url);
    await a.login(email, DEFAULT_PASSWORD);
    return { user, agent: a };
  }

  describe('Права доступу (NFR-37)', () => {
    it('USER отримує 403 на /users', async () => {
      const { agent } = await loggedInUser();

      expect((await agent.get('/users')).status).toBe(403);
      expect((await agent.post('/users', { email: 'x@test.ua', fullName: 'Х', role: 'USER' })).status).toBe(403);
    });

    it('без авторизації /users віддає 401, а не список', async () => {
      const res = await new Agent(ctx.url).get('/users');

      expect(res.status).toBe(401);
      expect(res.body.items).toBeUndefined();
    });

    it('ADMIN бачить список', async () => {
      const { agent } = await loggedInAdmin();
      await makeUser(ctx.prisma, { email: 'other@test.ua' });

      const res = await agent.get('/users');

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      // Хеш пароля наружу не отдаётся
      expect(res.body.items[0].passwordHash).toBeUndefined();
    });

    it('USER бачить полегшений /users/lite — потрібен для вибору відповідального (FR-2.0)', async () => {
      const { agent } = await loggedInUser();

      const res = await agent.get('/users/lite');

      expect(res.status).toBe(200);
      expect(res.body[0]).not.toHaveProperty('email');
      expect(res.body[0]).toHaveProperty('fullName');
    });
  });

  describe('Створення (FR-1.3)', () => {
    it('видає одноразове посилання замість пароля', async () => {
      const { agent } = await loggedInAdmin();

      const res = await agent.post('/users', {
        email: 'new@test.ua',
        fullName: 'Нова Співробітниця',
        role: 'USER',
      });

      expect(res.status).toBe(201);
      expect(res.body.resetToken).toBeTruthy();
      expect(res.body.expiresInHours).toBe(72);
      expect(res.body.user.mustChangePassword).toBe(true);
      // Пароль не показывается никогда — только ссылка
      expect(JSON.stringify(res.body)).not.toContain('password');
    });

    it('дублює email — 409', async () => {
      const { agent } = await loggedInAdmin();
      await makeUser(ctx.prisma, { email: 'taken@test.ua' });

      const res = await agent.post('/users', {
        email: 'taken@test.ua',
        fullName: 'Дубль',
        role: 'USER',
      });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('EMAIL_TAKEN');
    });

    it('відхиляє зайві поля (NFR-18)', async () => {
      const { agent } = await loggedInAdmin();

      const res = await agent.post('/users', {
        email: 'extra@test.ua',
        fullName: 'Зайве',
        role: 'USER',
        isProtected: true, // попытка выдать себе флаг владельца
      });

      expect(res.status).toBe(400);
    });
  });

  describe('Скидання пароля адміном (FR-1.3)', () => {
    it('відкликає сесії та створює сповіщення користувачу', async () => {
      const { agent } = await loggedInAdmin();
      const target = await makeUser(ctx.prisma, { email: 'target@test.ua' });
      const targetAgent = new Agent(ctx.url);
      await targetAgent.login('target@test.ua', DEFAULT_PASSWORD);

      const res = await agent.post(`/users/${target.id}/reset-password`);

      expect(res.status).toBe(201);
      expect(res.body.resetToken).toBeTruthy();

      const alive = await ctx.prisma.refreshToken.count({
        where: { userId: target.id, revokedAt: null },
      });
      expect(alive).toBe(0);

      // Админ технически может войти под любым — действие обязано быть видимым
      const notification = await ctx.prisma.notification.findFirstOrThrow({
        where: { userId: target.id, type: 'password_reset' },
      });
      expect(notification.body).toContain('Керівник');

      const audit = await ctx.prisma.auditLog.findFirstOrThrow({
        where: { action: 'password.reset' },
      });
      expect(audit.targetUserId).toBe(target.id);
    });
  });

  describe('Захищений власник (FR-1.8)', () => {
    it('не деактивується, не понижується в ролі, не скидається пароль', async () => {
      const { agent } = await loggedInAdmin();
      const owner = await makeUser(ctx.prisma, {
        email: 'owner@test.ua',
        role: 'ADMIN',
        isProtected: true,
      });

      const demote = await agent.patch(`/users/${owner.id}`, { role: 'USER' });
      const deactivate = await agent.post(`/users/${owner.id}/deactivate`);
      const reset = await agent.post(`/users/${owner.id}/reset-password`);

      expect([demote.status, deactivate.status, reset.status]).toEqual([403, 403, 403]);
      expect(demote.body.code).toBe('USER_PROTECTED');

      const stillOwner = await ctx.prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
      expect(stillOwner.role).toBe('ADMIN');
      expect(stillOwner.isActive).toBe(true);
    });
  });

  describe('Деактивація (FR-1.9)', () => {
    it('переносить відкриті задачі і роль PRIMARY на ADMIN однією транзакцією', async () => {
      const { admin, agent } = await loggedInAdmin();
      const target = await makeUser(ctx.prisma, { email: 'leaving@test.ua' });

      const client = await makeClient(ctx.prisma, { assigneeId: target.id });
      const secondary = await makeClient(ctx.prisma, { displayName: 'ФОП Другий' });
      await ctx.prisma.clientAssignee.create({
        data: { clientId: secondary.id, userId: target.id, role: 'SECONDARY' },
      });
      const openTask = await makeTask(ctx.prisma, target.id, { assigneeId: target.id });
      const doneTask = await makeTask(ctx.prisma, target.id, { assigneeId: target.id });
      await ctx.prisma.task.update({ where: { id: doneTask.id }, data: { status: 'DONE' } });

      const res = await agent.post(`/users/${target.id}/deactivate`);

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        tasksReassigned: 1,
        clientsPrimaryMoved: 1,
        clientsSecondaryRemoved: 1,
      });

      // Задачи деактивированного не «ничьи» — они у админа
      const moved = await ctx.prisma.task.findUniqueOrThrow({ where: { id: openTask.id } });
      expect(moved.assigneeId).toBe(admin.id);
      const untouched = await ctx.prisma.task.findUniqueOrThrow({ where: { id: doneTask.id } });
      expect(untouched.assigneeId).toBe(target.id); // закрытые не трогаем

      const primary = await ctx.prisma.clientAssignee.findFirstOrThrow({
        where: { clientId: client.id, role: 'PRIMARY' },
      });
      expect(primary.userId).toBe(admin.id);

      expect(
        await ctx.prisma.clientAssignee.count({ where: { userId: target.id } }),
      ).toBe(0);
    });

    it('не дає деактивувати самого себе', async () => {
      const { admin, agent } = await loggedInAdmin();

      const res = await agent.post(`/users/${admin.id}/deactivate`);

      expect(res.status).toBe(400);
    });

    it('деактивований більше не має доступу навіть з живою cookie', async () => {
      const { agent } = await loggedInAdmin();
      const target = await makeUser(ctx.prisma, { email: 'session@test.ua' });
      const targetAgent = new Agent(ctx.url);
      await targetAgent.login('session@test.ua', DEFAULT_PASSWORD);
      expect((await targetAgent.get('/me')).status).toBe(200);

      await agent.post(`/users/${target.id}/deactivate`);

      // Роль и активность читаются из БД, а не из токена: иначе доступ
      // сохранялся бы до конца жизни access-токена
      const after = await targetAgent.get('/me');
      expect(after.status).toBe(403);
      expect(after.body.code).toBe('ACCOUNT_INACTIVE');
    });
  });

  describe('Зміна email = зміна логіну (FR-1.3.1)', () => {
    it('пишеться в аудит з обома значеннями', async () => {
      const { agent } = await loggedInAdmin();
      const target = await makeUser(ctx.prisma, { email: 'old@test.ua' });

      const res = await agent.patch(`/users/${target.id}`, { email: 'new@test.ua' });

      expect(res.status).toBe(200);
      const audit = await ctx.prisma.auditLog.findFirstOrThrow({
        where: { action: 'user.update', entityId: target.id },
      });
      expect(audit.payload).toMatchObject({ emailFrom: 'old@test.ua', emailTo: 'new@test.ua' });
    });
  });
});
