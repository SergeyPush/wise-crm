import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Agent } from './helpers/agent';
import { TestApp, createTestApp, resetData } from './helpers/app';
import { DEFAULT_PASSWORD, makeClient, makeUser } from './helpers/factories';

describe('Клієнти та воронка (етап 2)', () => {
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

  async function websiteSourceId(): Promise<string> {
    const source = await ctx.prisma.leadSource.findFirstOrThrow({ where: { isSystem: true } });
    return source.id;
  }

  describe('Права доступу (NFR-37)', () => {
    it('USER може створювати й читати, але не може видаляти клієнта', async () => {
      const { agent } = await loggedInUser();
      const sourceId = await websiteSourceId();

      const created = await agent.post('/clients', { displayName: 'ТОВ Тест', phone: '0671234567', sourceId });
      expect(created.status).toBe(201);

      const del = await agent.delete(`/clients/${created.body.id}`);
      expect(del.status).toBe(403);
    });

    it('ADMIN може видаляти клієнта (мʼяко)', async () => {
      const { agent } = await loggedInUser('boss@test.ua', 'ADMIN');
      const client = await makeClient(ctx.prisma);

      const res = await agent.delete(`/clients/${client.id}`);
      expect(res.status).toBe(200);

      const row = await ctx.prisma.client.findUnique({ where: { id: client.id } });
      expect(row?.deletedAt).not.toBeNull();
    });
  });

  describe('Створення ліда — 4 поля (FR-2.0.4)', () => {
    it('статус проставляється по isDefaultForNew, відповідальний — поточний користувач', async () => {
      const { agent, user } = await loggedInUser();
      const sourceId = await websiteSourceId();

      const res = await agent.post('/clients', { displayName: 'ФОП Іванов', phone: '0671234567', sourceId });

      expect(res.status).toBe(201);
      expect(res.body.status.code).toBe('NEW');
      expect(res.body.assignees).toHaveLength(1);
      expect(res.body.assignees[0]).toMatchObject({ role: 'PRIMARY', user: { id: user.id } });
      expect(res.body.contacts[0]).toMatchObject({ phone: '0671234567', phoneNormalized: '+380671234567' });
    });

    it('без телефону і email — 400', async () => {
      const { agent } = await loggedInUser();
      const sourceId = await websiteSourceId();

      const res = await agent.post('/clients', { displayName: 'Без контакту', sourceId });
      expect(res.status).toBe(400);
    });
  });

  describe('Список: фільтри та пагінація (FR-2.10, FR-2.11)', () => {
    it('assigneeId=none повертає пул нерозподілених', async () => {
      const { agent } = await loggedInUser();
      const pooled = await makeClient(ctx.prisma, { displayName: 'З пулу' });
      await makeClient(ctx.prisma, { displayName: 'Призначений', assigneeId: (await loggedInUser('other@test.ua')).user.id });

      const res = await agent.get('/clients?assigneeId=none&limit=50');

      expect(res.status).toBe(200);
      expect(res.body.items.map((c: { id: string }) => c.id)).toContain(pooled.id);
      expect(res.body.items.every((c: { assignees: unknown[] }) => c.assignees.length === 0)).toBe(true);
    });

    it('поле total і форма пагінації відповідають контракту', async () => {
      const { agent } = await loggedInUser();
      await makeClient(ctx.prisma);
      await makeClient(ctx.prisma);

      const res = await agent.get('/clients?limit=1&page=1');

      expect(res.body).toMatchObject({ total: 2, page: 1, limit: 1 });
      expect(res.body.items).toHaveLength(1);
    });

    it('пошук знаходить клієнта за 0671234567, якщо збережено +38 (067) 123-45-67', async () => {
      const { agent } = await loggedInUser();
      const client = await makeClient(ctx.prisma, { displayName: 'ТОВ Знайди мене' });
      await ctx.prisma.clientContact.create({
        data: {
          clientId: client.id,
          phone: '+38 (067) 123-45-67',
          phoneNormalized: '+380671234567',
          isPrimary: true,
        },
      });

      const res = await agent.get('/clients?q=0671234567');

      expect(res.status).toBe(200);
      expect(res.body.items.map((c: { id: string }) => c.id)).toContain(client.id);
    });
  });

  describe('Оновлення картки: конкурентність (NFR-46)', () => {
    it('PATCH із застарілим updatedAt повертає 409', async () => {
      const { agent } = await loggedInUser();
      const client = await makeClient(ctx.prisma);
      const stale = new Date(client.updatedAt.getTime() - 1000).toISOString();

      const res = await agent.patch(`/clients/${client.id}`, { updatedAt: stale, notes: 'Спроба' });

      expect(res.status).toBe(409);
    });

    it('PATCH з актуальним updatedAt застосовується і повертає повний обʼєкт', async () => {
      const { agent } = await loggedInUser();
      const client = await makeClient(ctx.prisma);

      const res = await agent.patch(`/clients/${client.id}`, {
        updatedAt: client.updatedAt.toISOString(),
        notes: 'Оновлено',
      });

      expect(res.status).toBe(200);
      expect(res.body.notes).toBe('Оновлено');
    });

    it('зміна displayName знімає прапор needsQualification (FR-W3)', async () => {
      const { agent } = await loggedInUser();
      const client = await ctx.prisma.client.create({
        data: {
          displayName: 'ФОП · +380671234567',
          needsQualification: true,
          statusId: (await ctx.prisma.clientStatus.findFirstOrThrow({ where: { isDefaultForNew: true } })).id,
        },
      });

      const res = await agent.patch(`/clients/${client.id}`, {
        updatedAt: client.updatedAt.toISOString(),
        displayName: 'ФОП Petrenko',
      });

      expect(res.body.needsQualification).toBe(false);
    });
  });

  describe('Зміна статусу (FR-2.7, FR-2.8)', () => {
    it('перехід у статус з requiresReason без причини — 400', async () => {
      const { agent } = await loggedInUser();
      const client = await makeClient(ctx.prisma);
      const lost = await ctx.prisma.clientStatus.findFirstOrThrow({ where: { code: 'LOST' } });

      const res = await agent.post(`/clients/${client.id}/status`, { statusId: lost.id });
      expect(res.status).toBe(400);
    });

    it('з причиною — записує client_status_history і activity_events однією транзакцією', async () => {
      const { agent } = await loggedInUser();
      const client = await makeClient(ctx.prisma);
      const lost = await ctx.prisma.clientStatus.findFirstOrThrow({ where: { code: 'LOST' } });
      const reason = await ctx.prisma.lostReason.findFirstOrThrow({});

      const res = await agent.post(`/clients/${client.id}/status`, { statusId: lost.id, reasonId: reason.id });

      expect(res.status).toBe(201);
      expect(res.body.status.code).toBe('LOST');

      const history = await ctx.prisma.clientStatusHistory.findMany({ where: { clientId: client.id } });
      expect(history).toHaveLength(1);
      const activity = await ctx.prisma.activityEvent.findMany({
        where: { clientId: client.id, type: 'status_changed' },
      });
      expect(activity).toHaveLength(1);
    });
  });

  describe('«Взяти в роботу» (FR-2.0.3)', () => {
    it('змінює PRIMARY і сповіщає попереднього відповідального', async () => {
      const { user: prevOwner } = await loggedInUser('prev@test.ua');
      const { agent: newOwnerAgent, user: newOwner } = await loggedInUser('new@test.ua');
      const client = await makeClient(ctx.prisma, { assigneeId: prevOwner.id });

      const res = await newOwnerAgent.post(`/clients/${client.id}/claim`);

      expect(res.status).toBe(201);
      const primary = res.body.assignees.find((a: { role: string }) => a.role === 'PRIMARY');
      expect(primary.user.id).toBe(newOwner.id);

      const notification = await ctx.prisma.notification.findFirst({
        where: { userId: prevOwner.id, type: 'client_reassigned' },
      });
      expect(notification).not.toBeNull();
    });

    it('одночасний claim() двома користувачами не падає 500-ю, а лишає рівно одного PRIMARY', async () => {
      const { agent: agentA } = await loggedInUser('claimer-a@test.ua');
      const { agent: agentB } = await loggedInUser('claimer-b@test.ua');
      const client = await makeClient(ctx.prisma); // без відповідального — пул

      const [resA, resB] = await Promise.all([
        agentA.post(`/clients/${client.id}/claim`),
        agentB.post(`/clients/${client.id}/claim`),
      ]);

      // Або обидва встигли послідовно (201/201), або другий зловив конфлікт (409) —
      // головне, що не необроблений 500 від подвійного delete/unique-конфлікту.
      expect([resA.status, resB.status].sort()).not.toContain(500);
      const primaries = await ctx.prisma.clientAssignee.findMany({ where: { clientId: client.id, role: 'PRIMARY' } });
      expect(primaries).toHaveLength(1);
    });
  });

  describe('«Зафіксувати контакт» (FR-2.2.1)', () => {
    it('створює вже закриту задачу-дзвінок', async () => {
      const { agent } = await loggedInUser();
      const client = await makeClient(ctx.prisma);

      const res = await agent.post(`/clients/${client.id}/contact-log`, { result: 'Домовились про дзвінок завтра' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ type: 'CALL', status: 'DONE', result: 'Домовились про дзвінок завтра' });
      expect(res.body.completedAt).not.toBeNull();
    });
  });

  describe('Склад відповідальних (FR-2.0)', () => {
    it('PUT замінює весь склад: один PRIMARY, решта SECONDARY', async () => {
      const { agent, user: primary } = await loggedInUser();
      const { user: secondary } = await loggedInUser('helper@test.ua');
      const client = await makeClient(ctx.prisma);

      const res = await agent.put(`/clients/${client.id}/assignees`, {
        primaryId: primary.id,
        secondaryIds: [secondary.id],
      });

      expect(res.status).toBe(200);
      const byRole = Object.fromEntries(
        res.body.assignees.map((a: { role: string; user: { id: string } }) => [a.role, a.user.id]),
      );
      expect(byRole.PRIMARY).toBe(primary.id);
      expect(byRole.SECONDARY).toBe(secondary.id);
    });

    it('невідомий userId у складі — 400', async () => {
      const { agent } = await loggedInUser();
      const client = await makeClient(ctx.prisma);

      const res = await agent.put(`/clients/${client.id}/assignees`, {
        primaryId: '00000000-0000-0000-0000-000000000000',
      });

      expect(res.status).toBe(400);
    });
  });

  describe('Попередження про дублі (FR-2.2)', () => {
    it('знаходить клієнта за нормалізованим телефоном', async () => {
      const { agent } = await loggedInUser();
      const client = await makeClient(ctx.prisma, { displayName: 'Дубль-кандидат' });
      await ctx.prisma.clientContact.create({
        data: { clientId: client.id, phone: '0671234567', phoneNormalized: '+380671234567', isPrimary: true },
      });

      const res = await agent.get('/clients/duplicates?phone=%2B38%20(067)%20123-45-67');

      expect(res.status).toBe(200);
      expect(res.body.map((d: { id: string }) => d.id)).toContain(client.id);
    });

    it('без жодного параметра повертає порожній список, а не всю базу', async () => {
      const { agent } = await loggedInUser();
      await makeClient(ctx.prisma);

      const res = await agent.get('/clients/duplicates');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });
});
