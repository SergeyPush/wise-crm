import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

      await digest.buildAndSendDigest(8); // digestHour дефолтний — 8

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

      await digest.buildAndSendDigest(8); // digestHour дефолтний — 8

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

      await digest.buildAndSendDigest(8); // digestHour дефолтний — 8

      const summary = await ctx.prisma.notification.findMany({
        where: { userId: admin.id, type: 'leads_inactive_digest' },
      });
      expect(summary).toHaveLength(1);
      expect(summary[0]!.body).toContain('Прострочено всього: 1');
    });

    it('digestHour за юзером — тік на чужу годину нічого не шле, на свою — шле (backlog 27.08.2026)', async () => {
      const user = await makeUser(ctx.prisma, { digestHour: 9 });
      const client = await makeClient(ctx.prisma, { assigneeId: user.id });
      await makeTask(ctx.prisma, user.id, {
        clientId: client.id,
        assigneeId: user.id,
        dueAt: new Date(Date.now() - 24 * 3_600_000),
      });

      await digest.buildAndSendDigest(8); // не його година
      expect(await ctx.prisma.notification.count({ where: { userId: user.id, type: 'digest' } })).toBe(0);

      await digest.buildAndSendDigest(9); // його година
      expect(await ctx.prisma.notification.count({ where: { userId: user.id, type: 'digest' } })).toBe(1);
    });

    it('зведення ADMIN рахує всю команду, а не лише тих, у кого digestHour збігається з цим тіком', async () => {
      const admin = await makeUser(ctx.prisma, { email: 'admin2@test.ua', role: 'ADMIN', digestHour: 8 });
      // Менеджер налаштував собі інший час — але для зведення ADMIN це не має значення
      const manager = await makeUser(ctx.prisma, { email: 'manager2@test.ua', digestHour: 14 });
      const client = await makeClient(ctx.prisma);
      await makeTask(ctx.prisma, manager.id, {
        clientId: client.id,
        assigneeId: manager.id,
        dueAt: new Date(Date.now() - 24 * 3_600_000),
      });

      await digest.buildAndSendDigest(8); // лише година адміна

      const summary = await ctx.prisma.notification.findMany({
        where: { userId: admin.id, type: 'leads_inactive_digest' },
      });
      expect(summary).toHaveLength(1);
      expect(summary[0]!.body).toContain('Прострочено всього: 1');
      // Самому менеджеру о 8:00 нічого не пішло — це не його година
      expect(await ctx.prisma.notification.count({ where: { userId: manager.id, type: 'digest' } })).toBe(0);
    });
  });

  describe('sendDigestNow — «Надіслати зараз» не бреше в тихі часи (знайдено на проді 27.08.2026)', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('HIGH-пріоритет — Telegram-доставка не відкладається до ранку', async () => {
      const user = await makeUser(ctx.prisma);
      await ctx.prisma.user.update({
        where: { id: user.id },
        data: { telegramEnabled: true, telegramChatId: 'test-chat-id' },
      });

      // 22:00 за Києвом (EEST, UTC+3 наприкінці серпня) — тихі часи (20:00-08:00)
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-27T19:00:00.000Z'));

      await digest.sendDigestNow(user.id);

      const notification = await ctx.prisma.notification.findFirst({ where: { userId: user.id, type: 'digest' } });
      expect(notification?.priority).toBe('HIGH');

      const delivery = await ctx.prisma.notificationDelivery.findFirst({
        where: { notificationId: notification!.id, channel: 'TELEGRAM' },
      });
      expect(delivery).not.toBeNull();
      // Якби пріоритет лишився NORMAL (як у каталозі для 'digest'),
      // telegramScheduledAt відклав би це до 8:00 наступного дня
      expect(delivery!.scheduledAt.getTime()).toBeLessThanOrEqual(Date.now());
    });
  });
});
