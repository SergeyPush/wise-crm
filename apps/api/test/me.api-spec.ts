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
