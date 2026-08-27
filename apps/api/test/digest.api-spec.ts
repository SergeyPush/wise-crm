import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TestApp, createTestApp, resetData } from './helpers/app';
import { makeClient, makeTask, makeUser } from './helpers/factories';
import { DigestService } from '../src/modules/digest/digest.service';
import { OverdueTasksService } from '../src/modules/digest/overdue-tasks.service';

/**
 * Крон-джоби викликаються напряму (а не через очікування реального
 * розкладу) — так само, як TelegramDeliveryService.processPending()
 * у telegram-delivery.api-spec.ts.
 */
describe('Дайджест і прострочені задачі (FR-4.5, FR-4.5.2, FR-5.2.2)', () => {
  let ctx: TestApp;
  let digest: DigestService;
  let overdue: OverdueTasksService;

  beforeAll(async () => {
    ctx = await createTestApp();
    digest = ctx.app.get(DigestService);
    overdue = ctx.app.get(OverdueTasksService);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetData(ctx.prisma);
  });

  describe('OverdueTasksService — одноразове HIGH-сповіщення', () => {
    it('задача прострочена > 3 днів отримує HIGH-сповіщення один раз', async () => {
      const user = await makeUser(ctx.prisma);
      const client = await makeClient(ctx.prisma);
      const task = await makeTask(ctx.prisma, user.id, {
        clientId: client.id,
        assigneeId: user.id,
        dueAt: new Date(Date.now() - 4 * 24 * 3_600_000),
      });

      await overdue.notifyNewlyOverdue();
      await overdue.notifyNewlyOverdue(); // повторний прогін — не дублює

      const notifications = await ctx.prisma.notification.findMany({
        where: { userId: user.id, type: 'task_overdue', entityId: task.id },
      });
      expect(notifications).toHaveLength(1);
      expect(notifications[0]!.priority).toBe('HIGH');
    });

    it('задача прострочена лише 1 день — сповіщення немає', async () => {
      const user = await makeUser(ctx.prisma);
      const client = await makeClient(ctx.prisma);
      await makeTask(ctx.prisma, user.id, {
        clientId: client.id,
        assigneeId: user.id,
        dueAt: new Date(Date.now() - 1 * 24 * 3_600_000),
      });

      await overdue.notifyNewlyOverdue();

      const notifications = await ctx.prisma.notification.findMany({ where: { userId: user.id, type: 'task_overdue' } });
      expect(notifications).toHaveLength(0);
    });
  });

  describe('DigestService — ранковий дайджест', () => {
    it('порожній дайджест не відправляється (FR-4.5.2)', async () => {
      const user = await makeUser(ctx.prisma);

      await digest.buildAndSendDigest();

      const notifications = await ctx.prisma.notification.findMany({ where: { userId: user.id, type: 'digest' } });
      expect(notifications).toHaveLength(0);
    });

    it('прострочена задача і нерозподілений лід дають непорожній дайджест', async () => {
      const user = await makeUser(ctx.prisma);
      const client = await makeClient(ctx.prisma, { assigneeId: user.id });
      await makeTask(ctx.prisma, user.id, {
        clientId: client.id,
        assigneeId: user.id,
        dueAt: new Date(Date.now() - 24 * 3_600_000),
      });
      await makeClient(ctx.prisma); // нерозподілений — без assigneeId

      await digest.buildAndSendDigest();

      const notifications = await ctx.prisma.notification.findMany({ where: { userId: user.id, type: 'digest' } });
      expect(notifications).toHaveLength(1);
      expect(notifications[0]!.body).toContain('Прострочені: 1');
      expect(notifications[0]!.body).toContain('Нерозподілені ліди: 1');
    });

    it('ADMIN отримує окреме зведення по всіх менеджерах', async () => {
      const admin = await makeUser(ctx.prisma, { email: 'admin@test.ua', role: 'ADMIN' });
      const manager = await makeUser(ctx.prisma, { email: 'manager@test.ua' });
      const client = await makeClient(ctx.prisma);
      await makeTask(ctx.prisma, manager.id, {
        clientId: client.id,
        assigneeId: manager.id,
        dueAt: new Date(Date.now() - 24 * 3_600_000),
      });

      await digest.buildAndSendDigest();

      const summary = await ctx.prisma.notification.findMany({
        where: { userId: admin.id, type: 'leads_inactive_digest' },
      });
      expect(summary).toHaveLength(1);
      expect(summary[0]!.body).toContain('Прострочено всього: 1');
    });
  });
});
