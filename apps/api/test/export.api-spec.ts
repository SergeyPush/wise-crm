import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Agent } from './helpers/agent';
import { TestApp, createTestApp, resetData } from './helpers/app';
import { DEFAULT_PASSWORD, makeClient, makeTask, makeUser } from './helpers/factories';

describe('XLSX-експорт (FR-E1, FR-E2, FR-E6)', () => {
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

  // exceljs типізує Buffer проти іншої версії @types/node, ніж workspace — тому явний cast.
  async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    return workbook;
  }

  it('USER отримує 403 на обидва ендпоінти (рішення 01.09.2026: експорт лише ADMIN)', async () => {
    const { agent } = await loggedInUser('manager@test.ua');
    await makeClient(ctx.prisma, { displayName: 'Клієнт' });

    expect((await agent.get('/export/clients.xlsx')).status).toBe(403);
    expect((await agent.get('/export/tasks.xlsx')).status).toBe(403);
  });

  it('ADMIN отримує усіх клієнтів незалежно від відповідального', async () => {
    const { agent: adminAgent } = await loggedInUser('admin@test.ua', 'ADMIN');
    const other = await makeUser(ctx.prisma, { email: 'other@test.ua' });
    await makeClient(ctx.prisma, { assigneeId: other.id, displayName: 'Клієнт менеджера' });
    await makeClient(ctx.prisma, { displayName: 'Нерозподілений' }); // без відповідального

    const res = await adminAgent.getBinary('/export/clients.xlsx');
    expect(res.status).toBe(200);
    const book = await loadWorkbook(res.body);
    expect(book.getWorksheet('Клієнти')!.rowCount).toBe(3); // шапка + 2 клієнти
  });

  it('файл має чотири аркуші з замороженою шапкою і автофільтром', async () => {
    const { user, agent } = await loggedInUser('full@test.ua', 'ADMIN');
    const client = await makeClient(ctx.prisma, { assigneeId: user.id });
    await makeTask(ctx.prisma, user.id, { clientId: client.id, assigneeId: user.id });

    const res = await agent.getBinary('/export/clients.xlsx');
    const book = await loadWorkbook(res.body);

    expect(book.worksheets.map((s) => s.name)).toEqual(['Клієнти', 'Контакти', 'Задачі', 'Історія статусів']);
    const sheet = book.getWorksheet('Клієнти')!;
    expect(sheet.views[0]?.state).toBe('frozen');
    expect(sheet.autoFilter).toBeTruthy();
  });

  it('/export/tasks.xlsx — окремий файл лише з листом задач', async () => {
    const { user, agent } = await loggedInUser('tasks@test.ua', 'ADMIN');
    const client = await makeClient(ctx.prisma, { assigneeId: user.id });
    await makeTask(ctx.prisma, user.id, { clientId: client.id, assigneeId: user.id, title: 'Подзвонити' });

    const res = await agent.getBinary('/export/tasks.xlsx');
    expect(res.status).toBe(200);
    const book = await loadWorkbook(res.body);
    expect(book.worksheets.map((s) => s.name)).toEqual(['Задачі']);
    expect(book.getWorksheet('Задачі')!.rowCount).toBe(2);
  });

  it('без сесії — 401', async () => {
    const res = await new Agent(ctx.url).get('/export/clients.xlsx');
    expect(res.status).toBe(401);
  });

  it('ADMIN без фільтра (повна вивантаження) — аудит-лог і сповіщення іншому ADMIN (FR-E6)', async () => {
    const { agent: adminAgent } = await loggedInUser('admin1@test.ua', 'ADMIN');
    const { user: otherAdmin } = await loggedInUser('admin2@test.ua', 'ADMIN');
    await makeClient(ctx.prisma);

    const res = await adminAgent.getBinary('/export/clients.xlsx');
    expect(res.status).toBe(200);

    const audit = await ctx.prisma.auditLog.findMany({ where: { action: 'export.run', entityType: 'clients' } });
    expect(audit).toHaveLength(1);
    expect((audit[0]!.payload as { full: boolean }).full).toBe(true);

    const notified = await ctx.prisma.notification.findMany({ where: { userId: otherAdmin.id, type: 'full_export' } });
    expect(notified).toHaveLength(1);
  });

  it('ADMIN з фільтром — аудит без сповіщення (не повна вивантаження)', async () => {
    const { agent } = await loggedInUser('admin3@test.ua', 'ADMIN');
    const status = await ctx.prisma.clientStatus.findFirstOrThrow({ where: { code: 'NEW' } });
    await makeClient(ctx.prisma);

    await agent.get(`/export/clients.xlsx?statusId=${status.id}`);

    const audit = await ctx.prisma.auditLog.findMany({ where: { action: 'export.run', entityType: 'clients' } });
    expect(audit).toHaveLength(1);
    expect((audit[0]!.payload as { full: boolean }).full).toBe(false);
  });
});
