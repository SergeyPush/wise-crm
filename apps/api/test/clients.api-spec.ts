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

  describe('Архівація і відновлення (FR-8.1)', () => {
    it('USER не бачить архів (?deleted=true) і не може відновити', async () => {
      const { agent } = await loggedInUser();
      const client = await makeClient(ctx.prisma);
      await ctx.prisma.client.update({ where: { id: client.id }, data: { deletedAt: new Date() } });

      const list = await agent.get('/clients?deleted=true');
      expect(list.status).toBe(403);

      const restore = await agent.post(`/clients/${client.id}/restore`);
      expect(restore.status).toBe(403);
    });

    it('ADMIN бачить архівного клієнта лише у ?deleted=true, не у звичайному списку', async () => {
      const { agent } = await loggedInUser('boss2@test.ua', 'ADMIN');
      const client = await makeClient(ctx.prisma, { displayName: 'Архівний клієнт' });
      await agent.delete(`/clients/${client.id}`);

      const active = await agent.get('/clients?limit=100');
      expect(active.body.items.map((c: { id: string }) => c.id)).not.toContain(client.id);

      const archived = await agent.get('/clients?deleted=true&limit=100');
      expect(archived.status).toBe(200);
      expect(archived.body.items.map((c: { id: string }) => c.id)).toContain(client.id);
    });

    it('ADMIN відновлює архівного клієнта — знову видно у звичайному списку', async () => {
      const { agent } = await loggedInUser('boss3@test.ua', 'ADMIN');
      const client = await makeClient(ctx.prisma);
      await agent.delete(`/clients/${client.id}`);

      const res = await agent.post(`/clients/${client.id}/restore`);
      expect(res.status).toBe(201);
      expect(res.body.id).toBe(client.id);

      const row = await ctx.prisma.client.findUnique({ where: { id: client.id } });
      expect(row?.deletedAt).toBeNull();
    });

    it('відновлення активного (не видаленого) клієнта — 404', async () => {
      const { agent } = await loggedInUser('boss4@test.ua', 'ADMIN');
      const client = await makeClient(ctx.prisma);

      const res = await agent.post(`/clients/${client.id}/restore`);
      expect(res.status).toBe(404);
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

    it('field_changed пише diff «було/стало», а не лише перелік полів (backlog «Деталізація стрічки»)', async () => {
      const { agent } = await loggedInUser();
      const client = await ctx.prisma.client.create({
        data: { displayName: 'Стара назва', statusId: (await ctx.prisma.clientStatus.findFirstOrThrow({ where: { isDefaultForNew: true } })).id },
      });

      await agent.patch(`/clients/${client.id}`, { updatedAt: client.updatedAt.toISOString(), displayName: 'Нова назва' });

      const activity = await ctx.prisma.activityEvent.findFirstOrThrow({ where: { clientId: client.id, type: 'field_changed' } });
      const changed = (activity.payload as { changed: Array<{ field: string; from: unknown; to: unknown }> }).changed;
      expect(changed).toContainEqual({ field: 'displayName', from: 'Стара назва', to: 'Нова назва' });
    });

    it('field_changed не показує поле, надіслане тим самим значенням', async () => {
      const { agent } = await loggedInUser();
      const client = await ctx.prisma.client.create({
        data: { displayName: 'Назва', notes: 'Нотатка', statusId: (await ctx.prisma.clientStatus.findFirstOrThrow({ where: { isDefaultForNew: true } })).id },
      });

      await agent.patch(`/clients/${client.id}`, { updatedAt: client.updatedAt.toISOString(), displayName: 'Назва', notes: 'Інша нотатка' });

      const activity = await ctx.prisma.activityEvent.findFirstOrThrow({ where: { clientId: client.id, type: 'field_changed' } });
      const changed = (activity.payload as { changed: Array<{ field: string }> }).changed;
      expect(changed.map((c) => c.field)).toEqual(['notes']);
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
      // Мітки статусу й причини одразу в payload (backlog «Деталізація
      // стрічки») — фронт не має ще раз лізти у довідники по id.
      const payload = activity[0]!.payload as { fromLabel: string | null; toLabel: string; reasonLabel: string | null };
      expect(payload.toLabel).toBe(lost.label);
      expect(payload.reasonLabel).toBe(reason.label);
      const audit = await ctx.prisma.auditLog.findMany({
        where: { entityId: client.id, action: 'client.status_change' },
      });
      expect(audit).toHaveLength(1);
    });

    it('сповіщає відповідального, крім того, хто сам змінив статус (FR-4.1)', async () => {
      const { agent, user: actor } = await loggedInUser();
      const other = await makeUser(ctx.prisma, { email: 'assignee@test.ua' });
      const client = await makeClient(ctx.prisma);
      await ctx.prisma.clientAssignee.createMany({
        data: [
          { clientId: client.id, userId: actor.id, role: 'PRIMARY' },
          { clientId: client.id, userId: other.id, role: 'SECONDARY' },
        ],
      });
      const inProgress = await ctx.prisma.clientStatus.findFirstOrThrow({ where: { code: 'IN_PROGRESS' } });

      await agent.post(`/clients/${client.id}/status`, { statusId: inProgress.id });

      const selfNotified = await ctx.prisma.notification.findMany({ where: { userId: actor.id, type: 'status_changed' } });
      expect(selfNotified).toHaveLength(0);
      const otherNotified = await ctx.prisma.notification.findMany({ where: { userId: other.id, type: 'status_changed' } });
      expect(otherNotified).toHaveLength(1);
    });

    it('«Скасувати» — повторна зміна статусу назад лишає ДВІ записи в аудиті (FR-8.8/FR-7.3)', async () => {
      const { agent } = await loggedInUser();
      const client = await makeClient(ctx.prisma); // стартовий статус NEW
      const inProgress = await ctx.prisma.clientStatus.findFirstOrThrow({ where: { code: 'IN_PROGRESS' } });
      const original = await ctx.prisma.clientStatus.findFirstOrThrow({ where: { id: client.statusId } });

      await agent.post(`/clients/${client.id}/status`, { statusId: inProgress.id });
      await agent.post(`/clients/${client.id}/status`, { statusId: original.id }); // відкат

      const audit = await ctx.prisma.auditLog.findMany({
        where: { entityId: client.id, action: 'client.status_change' },
      });
      expect(audit).toHaveLength(2);
      const current = await ctx.prisma.client.findUniqueOrThrow({ where: { id: client.id } });
      expect(current.statusId).toBe(original.id);
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
      const audit = await ctx.prisma.auditLog.findFirst({ where: { entityId: client.id, action: 'client.claim' } });
      expect(audit).not.toBeNull();
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

  describe('Теги з ПКМ (FR-8.1)', () => {
    it('додає тег ідемпотентно і пише подію в стрічку', async () => {
      const { agent } = await loggedInUser();
      const client = await makeClient(ctx.prisma);
      // upsert, не create: Tag — справочник, не чистится между тестами (resetData),
      // повторный прогон против той же test-БД иначе падает на unique(name)
      const tag = await ctx.prisma.tag.upsert({ where: { name: 'VIP' }, create: { name: 'VIP' }, update: {} });

      const first = await agent.post(`/clients/${client.id}/tags`, { tagId: tag.id });
      expect(first.status).toBe(201);
      const second = await agent.post(`/clients/${client.id}/tags`, { tagId: tag.id });
      expect(second.status).toBe(201);

      const rows = await ctx.prisma.clientTag.findMany({ where: { clientId: client.id } });
      expect(rows).toHaveLength(1);

      const del = await agent.delete(`/clients/${client.id}/tags/${tag.id}`);
      expect(del.status).toBe(200);
      expect(await ctx.prisma.clientTag.findMany({ where: { clientId: client.id } })).toHaveLength(0);
    });
  });

  describe('Масові дії над виділенням (FR-2.13, FR-8.3)', () => {
    it('setStatus застосовує статус до кожного клієнта зі списку', async () => {
      const { agent } = await loggedInUser();
      const a = await makeClient(ctx.prisma);
      const b = await makeClient(ctx.prisma);
      const inProgress = await ctx.prisma.clientStatus.findFirstOrThrow({ where: { code: 'IN_PROGRESS' } });

      const res = await agent.post('/clients/bulk', { ids: [a.id, b.id], action: 'setStatus', statusId: inProgress.id });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ succeeded: 2, failed: [] });
      const refreshed = await ctx.prisma.client.findMany({ where: { id: { in: [a.id, b.id] } } });
      expect(refreshed.every((c) => c.statusId === inProgress.id)).toBe(true);
    });

    it('setStatus у requiresReason без причини лишає клієнта в списку failed, а не падає 500-ю', async () => {
      const { agent } = await loggedInUser();
      const client = await makeClient(ctx.prisma);
      const lost = await ctx.prisma.clientStatus.findFirstOrThrow({ where: { code: 'LOST' } });

      const res = await agent.post('/clients/bulk', { ids: [client.id], action: 'setStatus', statusId: lost.id });

      expect(res.status).toBe(201);
      expect(res.body.succeeded).toBe(0);
      expect(res.body.failed).toEqual([{ id: client.id, error: expect.any(String) }]);
    });

    it('setPrimary замінює лише PRIMARY, SECONDARY лишається як був', async () => {
      const { agent } = await loggedInUser();
      const oldPrimary = await makeUser(ctx.prisma, { email: 'old@test.ua' });
      const secondary = await makeUser(ctx.prisma, { email: 'secondary@test.ua' });
      const newPrimary = await makeUser(ctx.prisma, { email: 'new@test.ua' });
      const client = await makeClient(ctx.prisma, { assigneeId: oldPrimary.id });
      await ctx.prisma.clientAssignee.create({ data: { clientId: client.id, userId: secondary.id, role: 'SECONDARY' } });

      const res = await agent.post('/clients/bulk', { ids: [client.id], action: 'setPrimary', userId: newPrimary.id });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ succeeded: 1, failed: [] });
      const assignees = await ctx.prisma.clientAssignee.findMany({ where: { clientId: client.id } });
      const byRole = Object.fromEntries(assignees.map((a) => [a.role, a.userId]));
      expect(byRole.PRIMARY).toBe(newPrimary.id);
      expect(byRole.SECONDARY).toBe(secondary.id);
    });

    it('addSecondary додає помічника, не чіпаючи PRIMARY', async () => {
      const { agent } = await loggedInUser();
      const primary = await makeUser(ctx.prisma, { email: 'primary1@test.ua' });
      const helper = await makeUser(ctx.prisma, { email: 'helper1@test.ua' });
      const client = await makeClient(ctx.prisma, { assigneeId: primary.id });

      const res = await agent.post('/clients/bulk', { ids: [client.id], action: 'addSecondary', userId: helper.id });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ succeeded: 1, failed: [] });
      const assignees = await ctx.prisma.clientAssignee.findMany({ where: { clientId: client.id } });
      const byRole = Object.fromEntries(assignees.map((a) => [a.role, a.userId]));
      expect(byRole.PRIMARY).toBe(primary.id);
      expect(byRole.SECONDARY).toBe(helper.id);
    });

    it('addSecondary — повторний виклик тим самим userId нічого не ламає (ідемпотентно)', async () => {
      const { agent } = await loggedInUser();
      const primary = await makeUser(ctx.prisma, { email: 'primary2@test.ua' });
      const helper = await makeUser(ctx.prisma, { email: 'helper2@test.ua' });
      const client = await makeClient(ctx.prisma, { assigneeId: primary.id });

      await agent.post('/clients/bulk', { ids: [client.id], action: 'addSecondary', userId: helper.id });
      const res = await agent.post('/clients/bulk', { ids: [client.id], action: 'addSecondary', userId: helper.id });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ succeeded: 1, failed: [] });
      const rows = await ctx.prisma.clientAssignee.findMany({ where: { clientId: client.id, userId: helper.id } });
      expect(rows).toHaveLength(1);
    });

    it('removeSecondary прибирає лише SECONDARY, PRIMARY лишається', async () => {
      const { agent } = await loggedInUser();
      const primary = await makeUser(ctx.prisma, { email: 'primary3@test.ua' });
      const helper = await makeUser(ctx.prisma, { email: 'helper3@test.ua' });
      const client = await makeClient(ctx.prisma, { assigneeId: primary.id });
      await ctx.prisma.clientAssignee.create({ data: { clientId: client.id, userId: helper.id, role: 'SECONDARY' } });

      const res = await agent.post('/clients/bulk', { ids: [client.id], action: 'removeSecondary', userId: helper.id });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ succeeded: 1, failed: [] });
      const assignees = await ctx.prisma.clientAssignee.findMany({ where: { clientId: client.id } });
      expect(assignees).toHaveLength(1);
      expect(assignees[0]!.role).toBe('PRIMARY');
      expect(assignees[0]!.userId).toBe(primary.id);
    });

    it('setPrimary/addSecondary/removeSecondary без userId — 400', async () => {
      const { agent } = await loggedInUser();
      const client = await makeClient(ctx.prisma);

      const res = await agent.post('/clients/bulk', { ids: [client.id], action: 'addSecondary' });

      expect(res.status).toBe(400);
    });

    it('addTag ідемпотентно додає тег усім клієнтам зі списку', async () => {
      const { agent } = await loggedInUser();
      const a = await makeClient(ctx.prisma);
      const b = await makeClient(ctx.prisma);
      const tag = await ctx.prisma.tag.upsert({ where: { name: 'Пул-тест' }, create: { name: 'Пул-тест' }, update: {} });

      const res = await agent.post('/clients/bulk', { ids: [a.id, b.id], action: 'addTag', tagId: tag.id });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ succeeded: 2, failed: [] });
      const rows = await ctx.prisma.clientTag.findMany({ where: { tagId: tag.id } });
      expect(rows).toHaveLength(2);
    });

    it('невідомий id клієнта — у failed, решта виконується', async () => {
      const { agent } = await loggedInUser();
      const client = await makeClient(ctx.prisma);
      const tag = await ctx.prisma.tag.upsert({ where: { name: 'Частковий-збій' }, create: { name: 'Частковий-збій' }, update: {} });

      const res = await agent.post('/clients/bulk', {
        ids: [client.id, '00000000-0000-0000-0000-000000000000'],
        action: 'addTag',
        tagId: tag.id,
      });

      expect(res.status).toBe(201);
      expect(res.body.succeeded).toBe(1);
      expect(res.body.failed).toHaveLength(1);
      expect(res.body.failed[0].id).toBe('00000000-0000-0000-0000-000000000000');
    });

    it('без tagId для addTag — 400', async () => {
      const { agent } = await loggedInUser();
      const client = await makeClient(ctx.prisma);

      const res = await agent.post('/clients/bulk', { ids: [client.id], action: 'addTag' });

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
