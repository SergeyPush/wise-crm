import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Agent } from './helpers/agent';
import { TestApp, createTestApp } from './helpers/app';
import { DEFAULT_PASSWORD, makeUser } from './helpers/factories';

// Довідники в DICTIONARY_TABLES не труркейтяться між тестами (сидяться один
// раз) — тому кожен запис тут з випадковим кодом, щоб тести не заважали одне одному.
describe('Довідники: CRUD трьох редагованих (розділ 3 плану)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  async function loggedInUser(role: 'ADMIN' | 'USER') {
    const email = `dict-${role}-${randomUUID().slice(0, 8)}@test.ua`;
    await makeUser(ctx.prisma, { email, role });
    const agent = new Agent(ctx.url);
    await agent.login(email, DEFAULT_PASSWORD);
    return agent;
  }

  it('USER отримує 403 на створення тега', async () => {
    const agent = await loggedInUser('USER');
    const res = await agent.post('/dictionaries/tags', { name: `tag-${randomUUID().slice(0, 8)}` });
    expect(res.status).toBe(403);
  });

  it('ADMIN створює тег і редагує колір', async () => {
    const agent = await loggedInUser('ADMIN');
    const name = `tag-${randomUUID().slice(0, 8)}`;
    const created = await agent.post('/dictionaries/tags', { name, color: 'blue' });
    expect(created.status).toBe(201);
    expect(created.body.name).toBe(name);

    const updated = await agent.patch(`/dictionaries/tags/${created.body.id}`, { color: 'red' });
    expect(updated.status).toBe(200);
    expect(updated.body.color).toBe('red');
  });

  it('ADMIN створює джерело ліда з code+label, без label — 400', async () => {
    const agent = await loggedInUser('ADMIN');
    const code = `SRC_${randomUUID().slice(0, 6).toUpperCase()}`;

    const bad = await agent.post('/dictionaries/lead-sources', { code });
    expect(bad.status).toBe(400);

    const ok = await agent.post('/dictionaries/lead-sources', { code, label: 'Тестове джерело' });
    expect(ok.status).toBe(201);
  });

  it('системне джерело «Сайт» не можна деактивувати', async () => {
    const agent = await loggedInUser('ADMIN');
    const website = await ctx.prisma.leadSource.findFirstOrThrow({ where: { isSystem: true } });

    const res = await agent.patch(`/dictionaries/lead-sources/${website.id}`, { isActive: false });
    expect(res.status).toBe(400);
  });

  it('невідомий kind у POST — 400 (statuses редагується тільки міграцією)', async () => {
    const agent = await loggedInUser('ADMIN');
    const res = await agent.post('/dictionaries/statuses', { code: 'X', label: 'Y' });
    expect(res.status).toBe(400);
  });
});
