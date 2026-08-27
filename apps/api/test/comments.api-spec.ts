import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Agent } from './helpers/agent';
import { TestApp, createTestApp, resetData } from './helpers/app';
import { DEFAULT_PASSWORD, makeClient, makeUser } from './helpers/factories';

describe('Коментарі (FR-8.1 «Додати коментар»)', () => {
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

  it('коментар до клієнта створюється і лишає подію в стрічці', async () => {
    const { agent } = await loggedInUser();
    const client = await makeClient(ctx.prisma);

    const res = await agent.post('/comments', { entityType: 'client', entityId: client.id, body: 'Передзвонив, все ок' });

    expect(res.status).toBe(201);
    const activity = await ctx.prisma.activityEvent.findMany({ where: { clientId: client.id, type: 'comment' } });
    expect(activity).toHaveLength(1);
  });

  it('порожнє тіло — 400', async () => {
    const { agent } = await loggedInUser();
    const client = await makeClient(ctx.prisma);

    const res = await agent.post('/comments', { entityType: 'client', entityId: client.id, body: '' });
    expect(res.status).toBe(400);
  });

  it('невідомий клієнт — 404', async () => {
    const { agent } = await loggedInUser();
    const res = await agent.post('/comments', { entityType: 'client', entityId: '00000000-0000-0000-0000-000000000000', body: 'Текст' });
    expect(res.status).toBe(404);
  });

  it('@згадка створює сповіщення згаданому (FR-2.17), автору себе — ні', async () => {
    const { agent, user: author } = await loggedInUser('author@test.ua');
    const mentioned = await makeUser(ctx.prisma, { email: 'mentioned@test.ua', fullName: 'Згаданий' });
    const client = await makeClient(ctx.prisma);

    const res = await agent.post('/comments', {
      entityType: 'client',
      entityId: client.id,
      body: '@Згаданий, гляньте будь ласка',
      mentionedUserIds: [mentioned.id, author.id],
    });

    expect(res.status).toBe(201);
    expect(res.body.mentions).toEqual([mentioned.id]);
    const notifications = await ctx.prisma.notification.findMany({ where: { userId: mentioned.id, type: 'mention' } });
    expect(notifications).toHaveLength(1);
    const selfNotified = await ctx.prisma.notification.findMany({ where: { userId: author.id, type: 'mention' } });
    expect(selfNotified).toHaveLength(0);
  });
});
