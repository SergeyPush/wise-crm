import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Agent } from './helpers/agent';
import { TestApp, createTestApp, resetData } from './helpers/app';
import { DEFAULT_PASSWORD, makeUser } from './helpers/factories';

// TELEGRAM_BOT_TOKEN не заданий у тестовому оточенні (test/helpers/setup.ts) —
// TelegramService свідомо вимикається, а не падає. Тут перевіряємо саме ці
// «канал вимкнено» гілки; happy path з реальним ботом вимагав би моку Telegraf.
describe('Профіль: Telegram-тумблер (FR-4.2, FR-4.4)', () => {
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

  async function loggedInUser() {
    await makeUser(ctx.prisma, { email: 'staff@test.ua' });
    const agent = new Agent(ctx.url);
    await agent.login('staff@test.ua', DEFAULT_PASSWORD);
    return agent;
  }

  it('діплінк недоступний без TELEGRAM_BOT_TOKEN — 400, а не 500', async () => {
    const agent = await loggedInUser();
    const res = await agent.post('/me/telegram/link');
    expect(res.status).toBe(400);
  });

  it('тестове повідомлення без підключеного chatId — 400', async () => {
    const agent = await loggedInUser();
    const res = await agent.post('/me/telegram/test');
    expect(res.status).toBe(400);
  });

  it('увімкнути тумблер без попереднього діплінку (немає chatId) — 400', async () => {
    const agent = await loggedInUser();
    const res = await agent.patch('/me', { telegramEnabled: true });
    expect(res.status).toBe(400);
  });

  it('вимкнути тумблер можна завжди, навіть без chatId', async () => {
    const agent = await loggedInUser();
    const res = await agent.patch('/me', { telegramEnabled: false });
    expect(res.status).toBe(200);
    expect(res.body.telegramEnabled).toBe(false);
  });
});

describe('Профіль: час дайджесту за юзером (backlog 27.08.2026)', () => {
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

  async function loggedInUser() {
    const user = await makeUser(ctx.prisma, { email: 'digest-staff@test.ua' });
    const agent = new Agent(ctx.url);
    await agent.login('digest-staff@test.ua', DEFAULT_PASSWORD);
    return { agent, user };
  }

  it('дефолт digestHour — 8, і його можна змінити через PATCH /me', async () => {
    const { agent } = await loggedInUser();

    const me = await agent.get('/me');
    expect(me.body.digestHour).toBe(8);

    const updated = await agent.patch('/me', { digestHour: 21 });
    expect(updated.status).toBe(200);
    expect(updated.body.digestHour).toBe(21);
  });

  it('поза межами 0-23 — 400', async () => {
    const { agent } = await loggedInUser();
    const res = await agent.patch('/me', { digestHour: 24 });
    expect(res.status).toBe(400);
  });

  it('«Надіслати зараз» — і одразу зʼявляється сповіщення, незалежно від digestHour', async () => {
    const { agent, user } = await loggedInUser();

    const res = await agent.post('/me/digest/test');
    expect(res.status).toBe(201);

    const notification = await ctx.prisma.notification.findFirst({ where: { userId: user.id, type: 'digest' } });
    expect(notification).not.toBeNull();
    expect(notification!.title).toContain('тест');
  });
});
