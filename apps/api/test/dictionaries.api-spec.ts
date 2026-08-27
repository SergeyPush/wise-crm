import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Agent } from './helpers/agent';
import { TestApp, createTestApp } from './helpers/app';
import { DEFAULT_PASSWORD, makeUser } from './helpers/factories';

// Довідники в DICTIONARY_TABLES не труркейтяться між тестами (сидяться один
// раз) — тому кожен запис тут з випадковим кодом, щоб тести не заважали одне одному.
describe('Довідники: CRUD трьох редагованих (розділ 3 плану) + PATCH статусів (backlog 27.08.2026)', () => {
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

  it('POST /dictionaries/statuses — 400 (додавати/видаляти статуси не можна, лише PATCH)', async () => {
    const agent = await loggedInUser('ADMIN');
    const res = await agent.post('/dictionaries/statuses', { code: 'X', label: 'Y' });
    expect(res.status).toBe(400);
  });

  it('ADMIN редагує назву/колір/порядок статусу, структурні поля незмінні (backlog 27.08.2026)', async () => {
    const agent = await loggedInUser('ADMIN');
    const status = await ctx.prisma.clientStatus.findFirstOrThrow({ where: { code: 'NEW' } });

    const res = await agent.patch(`/dictionaries/statuses/${status.id}`, {
      label: 'Нова назва',
      color: 'grape',
      sortOrder: status.sortOrder + 10,
      // code/isActive — легітимні поля DTO (в інших довідниках редаговані),
      // але сервіс має їх ігнорувати саме для статусів — перевіряємо, що
      // структурні поля не змінюються навіть коли їх все ж таки надіслати.
      code: 'HACKED',
      isActive: !status.isActive,
    });

    expect(res.status).toBe(200);
    expect(res.body.label).toBe('Нова назва');
    expect(res.body.color).toBe('grape');
    expect(res.body.sortOrder).toBe(status.sortOrder + 10);
    expect(res.body.code).toBe('NEW');
    expect(res.body.stage).toBe(status.stage);
    expect(res.body.isTerminal).toBe(status.isTerminal);
    expect(res.body.isDefaultForNew).toBe(status.isDefaultForNew);
    expect(res.body.isActive).toBe(status.isActive);
  });

  it('USER отримує 403 на редагування статусу', async () => {
    const agent = await loggedInUser('USER');
    const status = await ctx.prisma.clientStatus.findFirstOrThrow({ where: { code: 'NEW' } });
    const res = await agent.patch(`/dictionaries/statuses/${status.id}`, { label: 'X' });
    expect(res.status).toBe(403);
  });
});
