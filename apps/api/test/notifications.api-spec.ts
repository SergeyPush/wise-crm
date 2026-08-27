import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Agent } from './helpers/agent';
import { TestApp, createTestApp, resetData } from './helpers/app';
import { DEFAULT_PASSWORD, makeClient, makeUser } from './helpers/factories';

describe('Сповіщення (FR-4.1) і Telegram-outbox (FR-4.4, FR-4.5)', () => {
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

  async function loggedInUser(email = 'staff@test.ua') {
    const user = await makeUser(ctx.prisma, { email });
    const agent = new Agent(ctx.url);
    await agent.login(email, DEFAULT_PASSWORD);
    return { user, agent };
  }

  it('GET /notifications: список і лічильник непрочитаних', async () => {
    const { agent, user } = await loggedInUser();
    await ctx.prisma.notification.create({ data: { userId: user.id, type: 'mention', title: 'Тест' } });

    const res = await agent.get('/notifications');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.unreadCount).toBe(1);
  });

  it('since= повертає лише те, що зʼявилось пізніше (дельта для полінгу)', async () => {
    const { agent, user } = await loggedInUser();
    const cutoff = new Date();
    await new Promise((r) => setTimeout(r, 5));
    await ctx.prisma.notification.create({ data: { userId: user.id, type: 'mention', title: 'Новіше' } });

    const res = await agent.get(`/notifications?since=${cutoff.toISOString()}`);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].title).toBe('Новіше');
  });

  it('POST /notifications/read-all позначає все прочитаним', async () => {
    const { agent, user } = await loggedInUser();
    await ctx.prisma.notification.createMany({
      data: [
        { userId: user.id, type: 'mention', title: 'A' },
        { userId: user.id, type: 'mention', title: 'B' },
      ],
    });

    const res = await agent.post('/notifications/read-all');
    expect(res.body.updated).toBe(2);

    const after = await agent.get('/notifications');
    expect(after.body.unreadCount).toBe(0);
  });

  it('чужі сповіщення не потрапляють у список', async () => {
    const { agent } = await loggedInUser('me@test.ua');
    const other = await makeUser(ctx.prisma, { email: 'other@test.ua' });
    await ctx.prisma.notification.create({ data: { userId: other.id, type: 'mention', title: 'Не моє' } });

    const res = await agent.get('/notifications');
    expect(res.body.items).toHaveLength(0);
  });

  it('@згадка: telegram=false у каталозі — outbox не заводиться навіть з підключеним ботом', async () => {
    const { agent } = await loggedInUser('author@test.ua');
    const mentioned = await makeUser(ctx.prisma, { email: 'mentioned@test.ua' });
    await ctx.prisma.user.update({
      where: { id: mentioned.id },
      data: { telegramEnabled: true, telegramChatId: '123456' },
    });
    const client = await makeClient(ctx.prisma);

    await agent.post('/comments', {
      entityType: 'client',
      entityId: client.id,
      body: 'привіт',
      mentionedUserIds: [mentioned.id],
    });

    const notification = await ctx.prisma.notification.findFirstOrThrow({
      where: { userId: mentioned.id, type: 'mention' },
    });
    const delivery = await ctx.prisma.notificationDelivery.findFirst({ where: { notificationId: notification.id } });
    expect(delivery).toBeNull();
  });

  it('призначення задачі користувачу з увімкненим Telegram ставить TELEGRAM-доставку в outbox (FR-4.2)', async () => {
    const { agent } = await loggedInUser('boss@test.ua');
    const assignee = await makeUser(ctx.prisma, { email: 'assignee@test.ua' });
    await ctx.prisma.user.update({
      where: { id: assignee.id },
      data: { telegramEnabled: true, telegramChatId: '999' },
    });

    const res = await agent.post('/tasks', { title: 'Подзвонити клієнту', assigneeId: assignee.id });
    expect(res.status).toBe(201);

    const notification = await ctx.prisma.notification.findFirstOrThrow({
      where: { userId: assignee.id, type: 'task_assigned' },
    });
    const delivery = await ctx.prisma.notificationDelivery.findFirstOrThrow({
      where: { notificationId: notification.id },
    });
    expect(delivery.channel).toBe('TELEGRAM');
    expect(delivery.status).toBe('PENDING');
    // FR-4.5: без явного dueAt задача йде на «сьогодні» (endOfKyivDay) — тому HIGH
    expect(notification.priority).toBe('HIGH');
  });

  it('призначення без підключеного Telegram — outbox не заводиться', async () => {
    const { agent } = await loggedInUser('boss2@test.ua');
    const assignee = await makeUser(ctx.prisma, { email: 'assignee2@test.ua' });

    await agent.post('/tasks', { title: 'Подзвонити клієнту', assigneeId: assignee.id });

    const notification = await ctx.prisma.notification.findFirstOrThrow({
      where: { userId: assignee.id, type: 'task_assigned' },
    });
    const delivery = await ctx.prisma.notificationDelivery.findFirst({ where: { notificationId: notification.id } });
    expect(delivery).toBeNull();
  });
});
