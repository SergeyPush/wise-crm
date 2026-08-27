import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Agent } from './helpers/agent';
import { TestApp, createTestApp, resetData } from './helpers/app';
import { DEFAULT_PASSWORD, makeClient, makeTask, makeUser } from './helpers/factories';

describe('Задачі (етап 3)', () => {
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

  async function loggedInUser(email = 'staff@test.ua', role: 'ADMIN' | 'USER' = 'USER') {
    const user = await makeUser(ctx.prisma, { email, role, fullName: 'Співробітник' });
    const a = new Agent(ctx.url);
    await a.login(email, DEFAULT_PASSWORD);
    return { user, agent: a };
  }

  describe('Швидке додавання («Що зробити? ⏎»)', () => {
    it('без явного виконавця й строку — на себе, на сьогодні', async () => {
      const { agent, user } = await loggedInUser();

      const res = await agent.post('/tasks', { title: 'Подзвонити клієнту' });

      expect(res.status).toBe(201);
      expect(res.body.assignee.id).toBe(user.id);
      expect(res.body.dueAt).not.toBeNull();
    });

    it('assigneeId: null — задача в пул, не ламає список', async () => {
      const { agent } = await loggedInUser();

      const created = await agent.post('/tasks', { title: 'Задача в пул', assigneeId: null });
      expect(created.status).toBe(201);
      expect(created.body.assignee).toBeNull();

      const list = await agent.get('/tasks?assigneeId=none');
      expect(list.status).toBe(200);
      expect(list.body.items.map((t: { id: string }) => t.id)).toContain(created.body.id);
    });

    it('призначення на іншого користувача — сповіщення і аудит (FR-3.2)', async () => {
      const { agent } = await loggedInUser();
      const { user: colleague } = await loggedInUser('colleague@test.ua');

      const res = await agent.post('/tasks', { title: 'Для колеги', assigneeId: colleague.id });
      expect(res.status).toBe(201);

      const notification = await ctx.prisma.notification.findFirst({
        where: { userId: colleague.id, type: 'task_assigned' },
      });
      expect(notification).not.toBeNull();
      const audit = await ctx.prisma.auditLog.findFirst({ where: { action: 'task.assign', entityId: res.body.id } });
      expect(audit).not.toBeNull();
    });
  });

  describe('Завершення — результат обовʼязковий для ДЗВІНОК/КП/ДОГОВІР (FR-3.5)', () => {
    it('CALL без результату — 400', async () => {
      const { agent, user } = await loggedInUser();
      const task = await makeTask(ctx.prisma, user.id, { type: 'CALL' });

      const res = await agent.post(`/tasks/${task.id}/complete`, {});
      expect(res.status).toBe(400);
    });

    it('CALL з результатом — 200, DONE, і запис в аудиті', async () => {
      const { agent, user } = await loggedInUser();
      const task = await makeTask(ctx.prisma, user.id, { type: 'CALL' });

      const res = await agent.post(`/tasks/${task.id}/complete`, { result: 'Домовились' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('DONE');
      expect(res.body.completedAt).not.toBeNull();
      const audit = await ctx.prisma.auditLog.findFirst({ where: { action: 'task.complete', entityId: task.id } });
      expect(audit).not.toBeNull();
    });

    it('OTHER без результату — 200, результат не обовʼязковий', async () => {
      const { agent, user } = await loggedInUser();
      const task = await makeTask(ctx.prisma, user.id, { type: 'OTHER' });

      const res = await agent.post(`/tasks/${task.id}/complete`, {});
      expect(res.status).toBe(201);
    });

    it('вже закриту задачу завершити повторно не можна — 400', async () => {
      const { agent, user } = await loggedInUser();
      const task = await makeTask(ctx.prisma, user.id, { type: 'OTHER', status: 'DONE', completedAt: new Date() });

      const res = await agent.post(`/tasks/${task.id}/complete`, {});
      expect(res.status).toBe(400);
    });
  });

  describe('Скасування — причина обовʼязкова завжди', () => {
    it('без причини — 400', async () => {
      const { agent, user } = await loggedInUser();
      const task = await makeTask(ctx.prisma, user.id, { type: 'OTHER' });

      const res = await agent.post(`/tasks/${task.id}/cancel`, {});
      expect(res.status).toBe(400);
    });

    it('з причиною — 200, CANCELLED, і запис в аудиті', async () => {
      const { agent, user } = await loggedInUser();
      const task = await makeTask(ctx.prisma, user.id, { type: 'OTHER' });

      const res = await agent.post(`/tasks/${task.id}/cancel`, { reason: 'Клієнт відмовився' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('CANCELLED');
      expect(res.body.cancelReason).toBe('Клієнт відмовився');
      const audit = await ctx.prisma.auditLog.findFirst({ where: { action: 'task.cancel', entityId: task.id } });
      expect(audit).not.toBeNull();
    });
  });

  describe('Перенесення строку — пресети (FR-8.2) і відкат (FR-8.8/FR-7.3)', () => {
    it('«завтра» зсуває dueAt і лишає запис в аудиті', async () => {
      const { agent, user } = await loggedInUser();
      const task = await makeTask(ctx.prisma, user.id, { dueAt: new Date('2026-01-16T21:59:59.000Z') });

      const res = await agent.post(`/tasks/${task.id}/snooze`, { preset: 'tomorrow' });

      expect(res.status).toBe(201);
      expect(new Date(res.body.dueAt).getTime()).toBeGreaterThan(new Date(task.dueAt!).getTime());
      const audits = await ctx.prisma.auditLog.findMany({ where: { action: 'task.snooze', entityId: task.id } });
      expect(audits).toHaveLength(1);
    });

    it('«Скасувати» — повторний виклик snooze лишає ДВІ записи в аудиті (FR-7.3)', async () => {
      const { agent, user } = await loggedInUser();
      const task = await makeTask(ctx.prisma, user.id, { dueAt: new Date('2026-01-16T21:59:59.000Z') });

      await agent.post(`/tasks/${task.id}/snooze`, { preset: 'nextweek' });
      await agent.post(`/tasks/${task.id}/snooze`, { preset: 'custom', date: '2026-01-16' }); // відкат до вихідної дати

      const audits = await ctx.prisma.auditLog.findMany({ where: { action: 'task.snooze', entityId: task.id } });
      expect(audits).toHaveLength(2);
    });
  });

  describe('Перепризначення (FR-3.2)', () => {
    it('автор, поточний виконавець або ADMIN можуть перепризначити задачу з виконавцем', async () => {
      const { agent: authorAgent, user: author } = await loggedInUser('author@test.ua');
      const { user: assignee } = await loggedInUser('assignee@test.ua');
      const { user: another } = await loggedInUser('another@test.ua');
      const task = await makeTask(ctx.prisma, author.id, { assigneeId: assignee.id });

      const res = await authorAgent.patch(`/tasks/${task.id}`, {
        updatedAt: task.updatedAt.toISOString(),
        assigneeId: another.id,
      });
      expect(res.status).toBe(200);
      expect(res.body.assignee.id).toBe(another.id);
    });

    it('стороння людина (не автор, не виконавець, не ADMIN) перепризначити не може — 403', async () => {
      const { user: author } = await loggedInUser('author2@test.ua');
      const { user: assignee } = await loggedInUser('assignee2@test.ua');
      const { agent: strangerAgent, user: stranger } = await loggedInUser('stranger@test.ua');
      const task = await makeTask(ctx.prisma, author.id, { assigneeId: assignee.id });

      const res = await strangerAgent.patch(`/tasks/${task.id}`, {
        updatedAt: task.updatedAt.toISOString(),
        assigneeId: stranger.id,
      });
      expect(res.status).toBe(403);
    });

    it('задачу з пулу (без виконавця) може взяти собі будь-хто — «Взяти в роботу»', async () => {
      const { user: author } = await loggedInUser('author3@test.ua');
      const { agent: takerAgent, user: taker } = await loggedInUser('taker@test.ua');
      const task = await makeTask(ctx.prisma, author.id, { assigneeId: null });

      const res = await takerAgent.patch(`/tasks/${task.id}`, {
        updatedAt: task.updatedAt.toISOString(),
        assigneeId: taker.id,
      });
      expect(res.status).toBe(200);
      expect(res.body.assignee.id).toBe(taker.id);
    });

    it('PATCH зі застарілим updatedAt — 409', async () => {
      const { agent, user } = await loggedInUser();
      const task = await makeTask(ctx.prisma, user.id);
      const stale = new Date(task.updatedAt.getTime() - 1000).toISOString();

      const res = await agent.patch(`/tasks/${task.id}`, { updatedAt: stale, title: 'Спроба' });
      expect(res.status).toBe(409);
    });
  });

  describe('Деталізація стрічки активності (backlog)', () => {
    it('task_updated пише diff «було/стало», а не лише перелік полів', async () => {
      const { agent, user } = await loggedInUser();
      const client = await makeClient(ctx.prisma);
      const task = await makeTask(ctx.prisma, user.id, { clientId: client.id, title: 'Стара назва' });

      await agent.patch(`/tasks/${task.id}`, { updatedAt: task.updatedAt.toISOString(), title: 'Нова назва' });

      const activity = await ctx.prisma.activityEvent.findFirstOrThrow({
        where: { clientId: client.id, type: 'task_updated' },
      });
      const changed = (activity.payload as { changed: Array<{ field: string; from: unknown; to: unknown }> }).changed;
      expect(changed).toContainEqual({ field: 'title', from: 'Стара назва', to: 'Нова назва' });
    });
  });

  describe("Видалення — м'яке, автор або ADMIN (FR-3.8)", () => {
    it('стороння людина (USER) видалити чужу задачу не може — 403', async () => {
      const { user: author } = await loggedInUser('author4@test.ua');
      const { agent: strangerAgent } = await loggedInUser('stranger2@test.ua');
      const task = await makeTask(ctx.prisma, author.id);

      const res = await strangerAgent.delete(`/tasks/${task.id}`);
      expect(res.status).toBe(403);
    });

    it('автор видаляє свою задачу', async () => {
      const { agent, user } = await loggedInUser();
      const task = await makeTask(ctx.prisma, user.id);

      const res = await agent.delete(`/tasks/${task.id}`);
      expect(res.status).toBe(200);
      const row = await ctx.prisma.task.findUnique({ where: { id: task.id } });
      expect(row?.deletedAt).not.toBeNull();
    });

    it('ADMIN видаляє чужу задачу', async () => {
      const { user: author } = await loggedInUser('author5@test.ua');
      const { agent: adminAgent } = await loggedInUser('admin5@test.ua', 'ADMIN');
      const task = await makeTask(ctx.prisma, author.id);

      const res = await adminAgent.delete(`/tasks/${task.id}`);
      expect(res.status).toBe(200);
    });
  });

  describe('Список і фільтри', () => {
    it('assigneeId=me повертає лише мої задачі', async () => {
      const { agent, user } = await loggedInUser();
      const { user: other } = await loggedInUser('other-task@test.ua');
      const mine = await makeTask(ctx.prisma, user.id, { assigneeId: user.id });
      const foreign = await makeTask(ctx.prisma, other.id, { assigneeId: other.id });

      const res = await agent.get('/tasks?assigneeId=me');
      expect(res.status).toBe(200);
      const ids = res.body.items.map((t: { id: string }) => t.id);
      expect(ids).toContain(mine.id);
      expect(ids).not.toContain(foreign.id);
    });

    it('clientId повертає задачі клієнта; створення через API лишає слід у стрічці активності (FR-2.16)', async () => {
      const { agent } = await loggedInUser();
      const client = await makeClient(ctx.prisma);

      const created = await agent.post('/tasks', { title: 'Підготувати КП', clientId: client.id });
      expect(created.status).toBe(201);

      const res = await agent.get(`/tasks?clientId=${client.id}`);
      expect(res.status).toBe(200);
      expect(res.body.items.map((t: { id: string }) => t.id)).toContain(created.body.id);

      const activity = await ctx.prisma.activityEvent.findMany({ where: { clientId: client.id, type: 'task_created' } });
      expect(activity).toHaveLength(1);
    });

    it('dueAfter+dueBefore — діапазон дат (backlog «Календар задач»)', async () => {
      const { agent, user } = await loggedInUser();
      const inRange = await makeTask(ctx.prisma, user.id, { dueAt: new Date('2026-09-15T20:59:59Z') });
      const before = await makeTask(ctx.prisma, user.id, { dueAt: new Date('2026-08-31T20:59:59Z') });
      const after = await makeTask(ctx.prisma, user.id, { dueAt: new Date('2026-10-01T21:00:00Z') });

      const res = await agent.get('/tasks?dueAfter=2026-08-31T21:00:00.000Z&dueBefore=2026-09-30T20:59:59.999Z');

      expect(res.status).toBe(200);
      const ids = res.body.items.map((t: { id: string }) => t.id);
      expect(ids).toContain(inRange.id);
      expect(ids).not.toContain(before.id);
      expect(ids).not.toContain(after.id);
    });
  });

  describe('Права доступу (NFR-37)', () => {
    it('USER може створювати, читати й завершувати задачі', async () => {
      const { agent } = await loggedInUser();
      const created = await agent.post('/tasks', { title: 'Перевірка прав' });
      expect(created.status).toBe(201);

      const list = await agent.get('/tasks');
      expect(list.status).toBe(200);
    });
  });
});
