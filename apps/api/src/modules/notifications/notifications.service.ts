import { Injectable } from '@nestjs/common';
import { Prisma, Priority } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type NotificationInput = {
  type: string;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
  link?: string;
  priority?: Priority;
};

/**
 * In-app уведомления (FR-4.1). Доставка во внешний канал (Telegram) —
 * отдельный outbox `NotificationDelivery`, заводится на этапе 4 вместе
 * с самой интеграцией; здесь только то, что уже нужно этапу 2 (FR-W5, FR-2.0.3).
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notifyUser(
    userId: string,
    data: NotificationInput,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = tx ?? this.prisma;
    await db.notification.create({ data: { userId, ...data } });
  }

  /** Заявка с сайта не назначена никому — уведомляются все активные (FR-W5). */
  async notifyAllActive(data: NotificationInput, tx?: Prisma.TransactionClient): Promise<void> {
    const db = tx ?? this.prisma;
    const users = await db.user.findMany({ where: { isActive: true }, select: { id: true } });
    if (!users.length) return;
    await db.notification.createMany({
      data: users.map((u) => ({ userId: u.id, ...data })),
    });
  }
}
