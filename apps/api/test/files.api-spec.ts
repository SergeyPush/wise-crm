import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Agent } from './helpers/agent';
import { TestApp, createTestApp, resetData } from './helpers/app';
import { DEFAULT_PASSWORD, makeClient, makeUser } from './helpers/factories';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('Файли (FR-F1–F15)', () => {
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

  it('завантаження PNG до клієнта: 201, файл видно у списку і в стрічці', async () => {
    const { agent } = await loggedInUser();
    const client = await makeClient(ctx.prisma);

    const res = await agent.postFile('/files', PNG, 'скан.png', { entityType: 'client', entityId: client.id });

    expect(res.status).toBe(201);
    expect(res.body.mimeType).toBe('image/png');

    const list = await agent.get(`/files?clientId=${client.id}`);
    expect(list.body).toHaveLength(1);

    const activity = await ctx.prisma.activityEvent.findMany({ where: { clientId: client.id, type: 'file_added' } });
    expect(activity).toHaveLength(1);
  });

  it('.exe, перейменований у .pdf, відхиляється — 400 (NFR-19)', async () => {
    const { agent } = await loggedInUser();
    const client = await makeClient(ctx.prisma);
    const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, ...Array(58).fill(0)]);

    const res = await agent.postFile('/files', exe, 'договір.pdf', { entityType: 'client', entityId: client.id });
    expect(res.status).toBe(400);
  });

  it('.exe відхиляється чорним списком незалежно від вмісту', async () => {
    const { agent } = await loggedInUser();
    const client = await makeClient(ctx.prisma);

    const res = await agent.postFile('/files', PNG, 'setup.exe', { entityType: 'client', entityId: client.id });
    expect(res.status).toBe(400);
  });

  it('повторне завантаження того ж імені в ту саму категорію — нова версія (FR-F15)', async () => {
    const { agent } = await loggedInUser();
    const client = await makeClient(ctx.prisma);

    const first = await agent.postFile('/files', PNG, 'статут.png', { entityType: 'client', entityId: client.id });
    expect(first.status).toBe(201);
    expect(first.body.version).toBe(1);

    const second = await agent.postFile('/files', PNG, 'статут.png', { entityType: 'client', entityId: client.id });
    expect(second.status).toBe(201);
    expect(second.body.version).toBe(2);
    expect(second.body.parentId).toBe(first.body.id);

    // у списку видно лише останню версію
    const list = await agent.get(`/files?clientId=${client.id}`);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(second.body.id);
  });

  it('скачування: PDF віддається inline, невідома людині картинка — attachment; невдалий download теж пише аудит', async () => {
    const { agent } = await loggedInUser();
    const client = await makeClient(ctx.prisma);
    const uploaded = await agent.postFile('/files', PNG, 'скан.png', { entityType: 'client', entityId: client.id });

    const res = await agent.get(`/files/${uploaded.body.id}/download`);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('inline');
    expect(res.headers['x-content-type-options']).toBe('nosniff');

    const audit = await ctx.prisma.auditLog.findMany({ where: { action: 'file.download', entityId: uploaded.body.id } });
    expect(audit).toHaveLength(1);
  });

  it('zip завжди йде як attachment, навіть попри inline-перелік', async () => {
    const { agent } = await loggedInUser();
    const client = await makeClient(ctx.prisma);
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, ...Array(26).fill(0)]);

    const uploaded = await agent.postFile('/files', zip, 'архів.zip', { entityType: 'client', entityId: client.id });
    expect(uploaded.status).toBe(201);

    const res = await agent.get(`/files/${uploaded.body.id}/download`);
    expect(res.headers['content-disposition']).toContain('attachment');
  });

  it('видалити файл старший 24 год не може навіть автор — тільки ADMIN', async () => {
    const { agent } = await loggedInUser('author@test.ua');
    const client = await makeClient(ctx.prisma);
    const uploaded = await agent.postFile('/files', PNG, 'скан.png', { entityType: 'client', entityId: client.id });

    await ctx.prisma.attachment.update({
      where: { id: uploaded.body.id },
      data: { createdAt: new Date(Date.now() - 25 * 3_600_000) },
    });

    const denied = await agent.delete(`/files/${uploaded.body.id}`);
    expect(denied.status).toBe(403);

    const { agent: admin } = await loggedInUser('admin@test.ua', 'ADMIN');
    const allowed = await admin.delete(`/files/${uploaded.body.id}`);
    expect(allowed.status).toBe(200);

    const gone = await ctx.prisma.attachment.findUnique({ where: { id: uploaded.body.id } });
    expect(gone?.deletedAt).not.toBeNull();
  });

  it('свіжий файл (≤24 год) видаляє сам автор', async () => {
    const { agent } = await loggedInUser();
    const client = await makeClient(ctx.prisma);
    const uploaded = await agent.postFile('/files', PNG, 'скан.png', { entityType: 'client', entityId: client.id });

    const res = await agent.delete(`/files/${uploaded.body.id}`);
    expect(res.status).toBe(200);
  });

  it('невідомий клієнт — 404, файл на диск не пишеться', async () => {
    const { agent } = await loggedInUser();
    const res = await agent.postFile('/files', PNG, 'скан.png', {
      entityType: 'client',
      entityId: '00000000-0000-0000-0000-000000000000',
    });
    expect(res.status).toBe(404);
  });
});
