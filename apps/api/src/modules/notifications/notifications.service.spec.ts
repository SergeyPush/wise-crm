import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Priority } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

/** Беклог 28.08.2026: деактивований юзер не повинен отримувати Telegram. */
describe('NotificationsService.enqueueTelegram (через notifyUser)', () => {
  let prisma: {
    notification: { create: ReturnType<typeof vi.fn> };
    notificationDelivery: { create: ReturnType<typeof vi.fn> };
    user: { findUnique: ReturnType<typeof vi.fn> };
  };
  let service: NotificationsService;

  beforeEach(() => {
    prisma = {
      notification: { create: vi.fn().mockResolvedValue({ id: 'notif-1' }) },
      notificationDelivery: { create: vi.fn().mockResolvedValue(undefined) },
      user: { findUnique: vi.fn() },
    };
    service = new NotificationsService(prisma as unknown as PrismaService);
  });

  it('ставить Telegram-доставку активному юзеру з увімкненим Telegram', async () => {
    prisma.user.findUnique.mockResolvedValue({ isActive: true, telegramEnabled: true, telegramChatId: '123' });

    await service.notifyUser('user-1', { type: 'password_reset', title: 't' });

    expect(prisma.notificationDelivery.create).toHaveBeenCalledTimes(1);
  });

  it('НЕ ставить Telegram-доставку деактивованому юзеру, навіть якщо telegramChatId лишився', async () => {
    prisma.user.findUnique.mockResolvedValue({ isActive: false, telegramEnabled: true, telegramChatId: '123' });

    await service.notifyUser('user-1', { type: 'password_reset', title: 't' });

    expect(prisma.notificationDelivery.create).not.toHaveBeenCalled();
  });

  it('не ставить доставку, якщо telegramEnabled вимкнено', async () => {
    prisma.user.findUnique.mockResolvedValue({ isActive: true, telegramEnabled: false, telegramChatId: '123' });

    await service.notifyUser('user-1', { type: 'password_reset', title: 't' });

    expect(prisma.notificationDelivery.create).not.toHaveBeenCalled();
  });

  it('не ставить доставку, якщо в каталозі telegram: false', async () => {
    prisma.user.findUnique.mockResolvedValue({ isActive: true, telegramEnabled: true, telegramChatId: '123' });

    await service.notifyUser('user-1', { type: 'web_lead_repeat', title: 't', priority: Priority.NORMAL });

    expect(prisma.notificationDelivery.create).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
