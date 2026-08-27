import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestApp, createTestApp, resetData } from './helpers/app';
import { makeUser } from './helpers/factories';
import { TelegramDeliveryService } from '../src/modules/telegram/telegram-delivery.service';
import { TelegramService } from '../src/modules/telegram/telegram.service';

/**
 * TELEGRAM_BOT_TOKEN не задано в тестах — реальний Telegraf ніколи не
 * піднімається (жодних мережевих викликів). Тут мокається лише зовнішня
 * межа (TelegramService.isEnabled/send), сам процесор і БД — справжні.
 */
describe('TelegramDeliveryService — outbox-процесор (05-files-and-notifications.md, п. 2.5)', () => {
  let ctx: TestApp;
  let delivery: TelegramDeliveryService;
  let telegram: TelegramService;

  beforeAll(async () => {
    ctx = await createTestApp();
    delivery = ctx.app.get(TelegramDeliveryService);
    telegram = ctx.app.get(TelegramService);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetData(ctx.prisma);
    vi.spyOn(telegram, 'isEnabled', 'get').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function pendingDelivery(chatId: string | null) {
    const user = await makeUser(ctx.prisma, { email: `tg-${Date.now()}@test.ua` });
    if (chatId) await ctx.prisma.user.update({ where: { id: user.id }, data: { telegramChatId: chatId } });
    const notification = await ctx.prisma.notification.create({
      data: { userId: user.id, type: 'task_assigned', title: 'Нова задача', link: '/tasks/1' },
    });
    const row = await ctx.prisma.notificationDelivery.create({
      data: { notificationId: notification.id, channel: 'TELEGRAM', scheduledAt: new Date(Date.now() - 1000) },
    });
    return row.id;
  }

  it('успішна відправка позначає SENT і викликає send з текстом без ПД', async () => {
    const sendSpy = vi.spyOn(telegram, 'send').mockResolvedValue(undefined);
    const id = await pendingDelivery('111');

    await delivery.processPending();

    expect(sendSpy).toHaveBeenCalledWith('111', expect.stringContaining('Нова задача'));
    const row = await ctx.prisma.notificationDelivery.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('SENT');
    expect(row.sentAt).not.toBeNull();
  });

  it('помилка відправки лишає PENDING з бекофом, поки не вичерпані спроби', async () => {
    vi.spyOn(telegram, 'send').mockRejectedValue(new Error('network down'));
    const id = await pendingDelivery('222');

    await delivery.processPending();

    const row = await ctx.prisma.notificationDelivery.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('PENDING');
    expect(row.attempts).toBe(1);
    expect(row.lastError).toBe('network down');
    expect(row.scheduledAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('5-та невдала спроба переводить у FAILED остаточно', async () => {
    vi.spyOn(telegram, 'send').mockRejectedValue(new Error('down'));
    const id = await pendingDelivery('333');
    await ctx.prisma.notificationDelivery.update({ where: { id }, data: { attempts: 4 } });

    await delivery.processPending();

    const row = await ctx.prisma.notificationDelivery.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('FAILED');
    expect(row.attempts).toBe(5);
  });

  it('користувач відключив Telegram між постановкою в чергу і відправкою — FAILED без спроби send', async () => {
    const sendSpy = vi.spyOn(telegram, 'send').mockResolvedValue(undefined);
    const id = await pendingDelivery(null);

    await delivery.processPending();

    expect(sendSpy).not.toHaveBeenCalled();
    const row = await ctx.prisma.notificationDelivery.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('FAILED');
  });

  it('коли бот вимкнено (isEnabled=false) — процесор нічого не робить', async () => {
    vi.spyOn(telegram, 'isEnabled', 'get').mockReturnValue(false);
    const sendSpy = vi.spyOn(telegram, 'send').mockResolvedValue(undefined);
    await pendingDelivery('444');

    await delivery.processPending();

    expect(sendSpy).not.toHaveBeenCalled();
  });
});
