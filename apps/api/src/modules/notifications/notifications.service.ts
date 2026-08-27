import { Injectable } from '@nestjs/common';
import { Prisma, Priority } from '@prisma/client';
import { isKyivQuietHours, kyivHour, startOfKyivDay } from 'shared';
import { PrismaService } from '../../prisma/prisma.service';
import { catalogEntry } from './notification-catalog';

export type NotificationInput = {
  type: string;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
  link?: string;
  /** Перекриває дефолт з каталогу — потрібно там, де пріоритет залежить від
   * контексту виклику (задача на сьогодні, задача прострочена > 3 днів, FR-4.5). */
  priority?: Priority;
};

/**
 * FR-4.5: тихі часи 20:00–08:00 за Києвом пропускають лише HIGH.
 * Момент трохи «пливе» на дві ночі переходу літо/зима (±1 год) — той самий
 * компроміс, що й у решті календарних розрахунків (kyiv-date.ts).
 */
function telegramScheduledAt(priority: Priority, now: Date): Date {
  if (priority === Priority.HIGH || !isKyivQuietHours(now)) return now;
  const dayOffset = kyivHour(now) < 8 ? 0 : 1;
  return new Date(startOfKyivDay(now).getTime() + (dayOffset * 24 + 8) * 3_600_000);
}

/**
 * In-app уведомления (FR-4.1) + постановка в Telegram-outbox (FR-4.2, FR-4.4).
 * Сама відправка — окремий процес (`telegram/telegram-delivery.service.ts`,
 * крон): падіння Telegram не повинно відкочувати запит, який породив подію
 * (коментар до `NotificationDelivery` у схемі).
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notifyUser(userId: string, data: NotificationInput, tx?: Prisma.TransactionClient): Promise<void> {
    const db = tx ?? this.prisma;
    const priority = data.priority ?? catalogEntry(data.type).priority;
    const notification = await db.notification.create({ data: { userId, ...data, priority } });
    await this.enqueueTelegram(db, notification.id, userId, data.type, priority);
  }

  /** Заявка с сайта не назначена никому — уведомляются все активные (FR-W5). */
  async notifyAllActive(data: NotificationInput, tx?: Prisma.TransactionClient): Promise<void> {
    const db = tx ?? this.prisma;
    const users = await db.user.findMany({ where: { isActive: true }, select: { id: true } });
    if (!users.length) return;
    const priority = data.priority ?? catalogEntry(data.type).priority;
    // Цикл, а не createMany: кожному повідомленню потрібен власний рядок
    // outbox з посиланням на notificationId — а масштаб (NFR: до 10 користувачів)
    // робить N+1 тут непомітним.
    for (const user of users) {
      const notification = await db.notification.create({ data: { userId: user.id, ...data, priority } });
      await this.enqueueTelegram(db, notification.id, user.id, data.type, priority);
    }
  }

  /** FR-4.1: `since` — дельта для полінгу; без нього — початкові останні 50. */
  async listForUser(userId: string, since?: string) {
    const [items, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId, ...(since ? { createdAt: { gt: new Date(since) } } : {}) },
        orderBy: { createdAt: 'desc' },
        take: since ? undefined : 50,
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items, unreadCount };
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }

  private async enqueueTelegram(
    db: Prisma.TransactionClient,
    notificationId: string,
    userId: string,
    type: string,
    priority: Priority,
  ): Promise<void> {
    if (!catalogEntry(type).telegram) return;
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { telegramEnabled: true, telegramChatId: true },
    });
    if (!user?.telegramEnabled || !user.telegramChatId) return;
    await db.notificationDelivery.create({
      data: { notificationId, channel: 'TELEGRAM', scheduledAt: telegramScheduledAt(priority, new Date()) },
    });
  }
}
