import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Agent } from './helpers/agent';
import { TestApp, createTestApp, resetData } from './helpers/app';
import { DEFAULT_PASSWORD, makeClient, makeTask, makeUser } from './helpers/factories';

describe('GET /dashboard (FR-5.1, FR-5.2)', () => {
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

  async function loggedInUser(email: string, role: 'ADMIN' | 'USER' = 'USER') {
    const user = await makeUser(ctx.prisma, { email, role });
    const agent = new Agent(ctx.url);
    await agent.login(email, DEFAULT_PASSWORD);
    return { user, agent };
  }

  it('USER бачить свій розріз (задачі, ліди без активності), а не адмінський', async () => {
    const { agent } = await loggedInUser('user@test.ua');

    const res = await agent.get('/dashboard');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('myTasksToday');
    expect(res.body).toHaveProperty('leadsInactive');
    expect(res.body).not.toHaveProperty('funnel');
  });

  it('ADMIN бачить воронку і конверсію по джерелах', async () => {
    const { agent } = await loggedInUser('admin@test.ua', 'ADMIN');

    const res = await agent.get('/dashboard');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('funnel');
    expect(res.body).toHaveProperty('sourceConversion');
    expect(res.body).toHaveProperty('perManager');
  });

  it('конверсія по джерелах — абсолютні числа поряд з відсотком (FR-5.1.4, критерій готовності етапу 4)', async () => {
    const { agent } = await loggedInUser('admin2@test.ua', 'ADMIN');
    const source = await ctx.prisma.leadSource.findFirstOrThrow({});
    const lead = await makeClient(ctx.prisma);
    await ctx.prisma.client.update({ where: { id: lead.id }, data: { sourceId: source.id } });
    const contract = await makeClient(ctx.prisma, { statusCode: 'WON' });
    await ctx.prisma.client.update({ where: { id: contract.id }, data: { sourceId: source.id } });

    const res = await agent.get('/dashboard?period=90');

    const row = res.body.sourceConversion.find((s: { sourceId: string }) => s.sourceId === source.id);
    expect(row).toMatchObject({ leads: 2, contracts: 1, pct: 50 });
  });

  it('нерозподілені ліди рахуються однаково для USER і ADMIN', async () => {
    await makeClient(ctx.prisma); // без відповідального
    const { agent: userAgent } = await loggedInUser('u2@test.ua');
    const { agent: adminAgent } = await loggedInUser('a2@test.ua', 'ADMIN');

    const userRes = await userAgent.get('/dashboard');
    const adminRes = await adminAgent.get('/dashboard');

    expect(userRes.body.unassignedCount).toBe(1);
    expect(adminRes.body.unassignedCount).toBe(1);
  });

  it('прострочена задача користувача потрапляє в myOverdue', async () => {
    const { user, agent } = await loggedInUser('withtask@test.ua');
    const client = await makeClient(ctx.prisma, { assigneeId: user.id });
    await makeTask(ctx.prisma, user.id, {
      clientId: client.id,
      assigneeId: user.id,
      dueAt: new Date(Date.now() - 24 * 3_600_000),
    });

    const res = await agent.get('/dashboard');
    expect(res.body.myOverdue).toBe(1);
  });
});
