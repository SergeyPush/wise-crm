import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Agent } from './helpers/agent';
import { TestApp, createTestApp } from './helpers/app';

describe('POST /telegram/webhook — публічний ендпоінт', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('без сесії, без CSRF, з будь-яким тілом — завжди 200 (Telegram довіряється лише secret_token)', async () => {
    const agent = new Agent(ctx.url);
    const res = await agent.postWithoutCsrf('/telegram/webhook', { update_id: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
