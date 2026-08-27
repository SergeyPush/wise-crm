import { Injectable, Logger } from '@nestjs/common';
import { Priority } from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AlertsService } from '../../common/alerts/alerts.service';

const OVERDUE_DAYS = 3; // FR-4.5: «Задача прострочена > 3 днів» — HIGH

/**
 * Окреме одноразове сповіщення на задачу (не плутати з дайджестом, де це
 * лише агрегована цифра, FR-4.5.2). Одноразовість без нової колонки в схемі:
 * перевіряємо, чи вже є Notification цього типу для цієї задачі — дедуплікація,
 * що переживає рестарт процесу (FR-4.4: одноразова, не щоденний повтор).
 */
@Injectable()
export class OverdueTasksService {
  private readonly logger = new Logger(OverdueTasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly alerts: AlertsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, { timeZone: 'Europe/Kyiv' })
  async notifyNewlyOverdue(): Promise<void> {
    await this.alerts.guardJob('digest.notifyNewlyOverdue', () => this.doNotifyNewlyOverdue());
  }

  private async doNotifyNewlyOverdue(): Promise<void> {
    const threshold = new Date(Date.now() - OVERDUE_DAYS * 24 * 3_600_000);
    const tasks = await this.prisma.task.findMany({
      where: {
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        assigneeId: { not: null },
        dueAt: { lt: threshold },
        deletedAt: null,
      },
      select: { id: true, title: true, assigneeId: true },
    });

    let notified = 0;
    for (const task of tasks) {
      if (!task.assigneeId) continue;
      const already = await this.prisma.notification.findFirst({
        where: { userId: task.assigneeId, type: 'task_overdue', entityId: task.id },
      });
      if (already) continue;

      await this.notifications.notifyUser(task.assigneeId, {
        type: 'task_overdue',
        title: `Задача прострочена більше ${OVERDUE_DAYS} днів: ${task.title}`,
        entityType: 'task',
        entityId: task.id,
        link: `/tasks/${task.id}`,
        priority: Priority.HIGH,
      });
      notified++;
    }
    if (notified) this.logger.log(`Нових прострочень (> ${OVERDUE_DAYS} днів): ${notified}`);
  }
}
