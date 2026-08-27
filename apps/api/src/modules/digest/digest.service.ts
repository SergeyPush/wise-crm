import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { APP_SETTINGS } from 'shared';
import { endOfKyivDay, isKyivWeekday, startOfKyivDay } from '../../common/utils/calendar.util';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AlertsService } from '../../common/alerts/alerts.service';

const INACTIVE_DAYS_DEFAULT = 7;

type UserCounts = { overdue: number; dueToday: number; inactiveLeads: number };

/**
 * FR-4.5.2: 08:00 за Києвом, лише будні, і лише якщо є що показати. Накопичене
 * за вихідні й тихі часи саме так і потрапляє в найближчий дайджест — окремої
 * логіки для «в понеділок» не треба, крон просто не спрацьовує в сб/нд.
 * FR-5.2.2: сводне повідомлення відповідальному + окреме зведення для ADMIN.
 */
@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly alerts: AlertsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM, { timeZone: 'Europe/Kyiv' })
  async sendMorningDigest(): Promise<void> {
    // Винесено окремо від buildAndSendDigest(), щоб тести могли викликати
    // основну логіку напряму, не залежачи від того, який зараз день тижня.
    if (!isKyivWeekday()) return;
    // NFR-31.4: падіння джоби не повинно тихо загубитись у unhandledRejection
    await this.alerts.guardJob('digest.sendMorningDigest', () => this.buildAndSendDigest());
  }

  async buildAndSendDigest(): Promise<void> {
    const inactiveDays = await this.inactiveDaysSetting();
    const unassignedPool = await this.prisma.client.count({ where: { assignees: { none: {} }, deletedAt: null } });
    const users = await this.prisma.user.findMany({ where: { isActive: true }, select: { id: true, role: true } });

    const perUser = new Map<string, UserCounts>();
    let sentToUsers = 0;
    for (const user of users) {
      const counts = await this.countsForUser(user.id, inactiveDays);
      perUser.set(user.id, counts);
      if (!counts.overdue && !counts.dueToday && !counts.inactiveLeads && !unassignedPool) continue; // порожній не шлемо
      await this.notifications.notifyUser(user.id, {
        type: 'digest',
        title: 'Ранковий дайджест',
        body: this.renderUserLines(counts, unassignedPool),
        link: '/tasks',
      });
      sentToUsers++;
    }

    const admins = users.filter((u) => u.role === 'ADMIN');
    const totals = [...perUser.values()].reduce(
      (acc, c) => ({ overdue: acc.overdue + c.overdue, inactiveLeads: acc.inactiveLeads + c.inactiveLeads }),
      { overdue: 0, inactiveLeads: 0 },
    );
    if (admins.length && (totals.overdue || totals.inactiveLeads || unassignedPool)) {
      for (const admin of admins) {
        await this.notifications.notifyUser(admin.id, {
          type: 'leads_inactive_digest',
          title: 'Ранковий дайджест: усі менеджери',
          body: `Прострочено всього: ${totals.overdue}. Лідів без активності: ${totals.inactiveLeads}. Нерозподілені: ${unassignedPool}.`,
          link: '/clients?assigneeId=none',
        });
      }
    }

    this.logger.log(`Дайджест: надіслано ${sentToUsers} користувачам, зведення ${admins.length} адмінам`);
  }

  private async inactiveDaysSetting(): Promise<number> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: APP_SETTINGS.LEAD_INACTIVE_DAYS } });
    return typeof row?.value === 'number' ? row.value : INACTIVE_DAYS_DEFAULT;
  }

  private async countsForUser(userId: string, inactiveDays: number): Promise<UserCounts> {
    const now = new Date();
    const inactiveCutoff = new Date(now.getTime() - inactiveDays * 24 * 3_600_000);
    const [overdue, dueToday, inactiveLeads] = await Promise.all([
      this.prisma.task.count({
        where: { assigneeId: userId, status: { in: ['OPEN', 'IN_PROGRESS'] }, dueAt: { lt: now }, deletedAt: null },
      }),
      this.prisma.task.count({
        where: {
          assigneeId: userId,
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          dueAt: { gte: startOfKyivDay(now), lte: endOfKyivDay(now) },
          deletedAt: null,
        },
      }),
      // FR-5.2.1: лише активні стадії (LEAD/IN_WORK) — угода, що вже завершилась, «без активності» не рахується
      this.prisma.client.count({
        where: {
          deletedAt: null,
          assignees: { some: { userId } },
          status: { stage: { in: ['LEAD', 'IN_WORK'] } },
          OR: [{ lastActivityAt: { lt: inactiveCutoff } }, { lastActivityAt: null, createdAt: { lt: inactiveCutoff } }],
        },
      }),
    ]);
    return { overdue, dueToday, inactiveLeads };
  }

  private renderUserLines(counts: UserCounts, unassignedPool: number): string {
    return [
      `Прострочені: ${counts.overdue}`,
      `На сьогодні: ${counts.dueToday}`,
      `Нерозподілені ліди: ${unassignedPool}`,
      `Ліди без активності: ${counts.inactiveLeads}`,
    ].join('\n');
  }
}
