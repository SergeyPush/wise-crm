import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TestApp, createTestApp, resetData } from './helpers/app';

const TOKEN = 'test-web-form-token'; // виставляється в test/helpers/setup.ts

describe('Публічний прийом заявок з сайту (FR-W1–W9)', () => {
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

  function post(body: Record<string, unknown>, token: string | undefined = TOKEN) {
    const req = request(ctx.url).post('/api/v1/public/leads');
    if (token !== undefined) req.set('x-web-form-token', token);
    return req.send(body);
  }

  it('без токена — 200, але клієнт не створюється', async () => {
    const res = await post({ phone: '0671234567' }, 'wrong-token');

    expect(res.status).toBe(200);
    const leads = await ctx.prisma.webLead.count();
    expect(leads).toBe(0);
  });

  it('з токеном — клієнт у пулі, задача без виконавця, сповіщення всім активним', async () => {
    const staffA = await ctx.prisma.user.create({
      data: { email: 'a@test.ua', fullName: 'Іван', role: 'USER', passwordHash: 'x', isActive: true },
    });
    const staffB = await ctx.prisma.user.create({
      data: { email: 'b@test.ua', fullName: 'Олена', role: 'USER', passwordHash: 'x', isActive: true },
    });

    const res = await post({ phone: '0671234567', OrganisationalForm: 'ФОП' });

    expect(res.status).toBe(200);

    const webLead = await ctx.prisma.webLead.findFirstOrThrow();
    expect(webLead.clientId).not.toBeNull();

    const client = await ctx.prisma.client.findUniqueOrThrow({
      where: { id: webLead.clientId! },
      include: { assignees: true, source: true },
    });
    expect(client.assignees).toHaveLength(0); // пул «Нерозподілені» (FR-2.0.3)
    expect(client.source?.isSystem).toBe(true); // джерело "Сайт" ставить система, не форма

    const task = await ctx.prisma.task.findFirstOrThrow({ where: { clientId: client.id } });
    expect(task).toMatchObject({ title: 'Подзвонити за заявкою', type: 'CALL', assigneeId: null });

    const notifications = await ctx.prisma.notification.findMany({ where: { type: 'web_lead' } });
    expect(notifications.map((n) => n.userId).sort()).toEqual([staffA.id, staffB.id].sort());
  });

  it('повторна заявка з тим самим телефоном не створює другу картку', async () => {
    await post({ phone: '0671234567' });
    const firstLead = await ctx.prisma.webLead.findFirstOrThrow();
    const clientId = firstLead.clientId!;

    await post({ phone: '+38 (067) 123-45-67', question: 'Ще раз про вартість' });

    const clients = await ctx.prisma.client.count();
    expect(clients).toBe(1);

    const duplicateEvent = await ctx.prisma.activityEvent.findFirst({
      where: { clientId, type: 'web_lead_duplicate' },
    });
    expect(duplicateEvent).not.toBeNull();
  });

  it('дві одночасні заявки з одним телефоном створюють лише одну картку (FR-W6)', async () => {
    // Advisory-lock у WebLeadsService.process серіалізує обробку по контакту —
    // без нього обидва запити встигли б не знайти клієнта одне одного і кожен створив би свого.
    const [first, second] = await Promise.all([
      post({ phone: '0671234567' }),
      post({ phone: '+38 (067) 123-45-67' }),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await ctx.prisma.client.count()).toBe(1);

    const leads = await ctx.prisma.webLead.findMany();
    expect(leads).toHaveLength(2);
    expect(leads.filter((l) => l.isDuplicate)).toHaveLength(1);
  });

  it('невідоме значення TaxSystem не валить заявку: поле пусте, подія в стрічці, WebLead.error заповнений', async () => {
    const res = await post({ phone: '0671234567', TaxSystem: 'Щось невідоме' });
    expect(res.status).toBe(200);

    const webLead = await ctx.prisma.webLead.findFirstOrThrow();
    expect(webLead.error).toContain('TaxSystem');

    const client = await ctx.prisma.client.findUniqueOrThrow({ where: { id: webLead.clientId! } });
    expect(client.taxSystem).toBeNull();

    const event = await ctx.prisma.activityEvent.findFirst({
      where: { clientId: client.id, type: 'web_lead_unmapped_field' },
    });
    expect(event).not.toBeNull();
  });

  it('тіло понад 16 КБ і honeypot відхиляються без запису', async () => {
    const big = await post({ phone: '0671234567', notes: 'x'.repeat(20_000) });
    expect(big.status).toBe(200);

    const honeypot = await post({ phone: '0679999999', website: 'https://spam.example' });
    expect(honeypot.status).toBe(200);

    expect(await ctx.prisma.webLead.count()).toBe(0);
  });

  it('payload з test: true зберігається, але клієнта не створює (FR-W8)', async () => {
    const res = await post({ phone: '0671234567', test: true });
    expect(res.status).toBe(200);

    const webLead = await ctx.prisma.webLead.findFirstOrThrow();
    expect(webLead.isTest).toBe(true);
    expect(webLead.clientId).toBeNull();
    expect(await ctx.prisma.client.count()).toBe(0);
  });
});
