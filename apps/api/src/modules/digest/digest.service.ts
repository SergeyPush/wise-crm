import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { APP_SETTINGS, kyivHour } from 'shared';
import { endOfKyivDay, isKyivWeekday, startOfKyivDay } from '../../common/utils/calendar.util';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AlertsService } from '../../common/alerts/alerts.service';

const INACTIVE_DAYS_DEFAULT = 7;

type UserCounts = { overdue: number; dueToday: number; inactiveLeads: number };

/**
 * FR-4.5.2 + backlog 27.08.2026 («час дайджесту за юзером»): щогодинний тік
 * замість одного крону о 8:00 — кожен юзер отримує дайджест у свою годину
 * (`User.digestHour`, 0-23 за Києвом, дефолт 8 — той самий час, що й раніше
 * для всіх). Лише будні, і лише якщо є що показати. Накопичене за вихідні й
 * тихі часи саме так і потрапляє в найближчий будній тік — окремої логіки
 * для «в понеділок» не треба, тік у сб/нд просто нічого нікому не шле.
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

  @Cron('0 * * * *', { timeZone: 'Europe/Kyiv' })
  async sendMorningDigest(): Promise<void> {
    // Винесено окремо від buildAndSendDigest(), щоб тести могли викликати
    // основну логіку напряму з конкретною годиною, не залежачи від того,
    // який зараз день тижня чи котра насправді година.
    if (!isKyivWeekday()) return;
    // NFR-31.4: падіння джоби не повинно тихо загубитись у unhandledRejection
    await this.alerts.guardJob('digest.sendMorningDigest', () => this.buildAndSendDigest(kyivHour()));
  }

  /** @param hour Київська година (0-23) — шлеться лише тим, у кого `digestHour` збігається. */
  async buildAndSendDigest(hour: number): Promise<void> {
    const inactiveDays = await this.inactiveDaysSetting();
    const unassignedPool = await this.prisma.client.count({ where: { assignees: { none: {} }, deletedAt: null } });
    const users = await this.prisma.user.findMany({
      where: { isActive: true, digestHour: hour },
      select: { id: true, role: true },
    });

    let sentToUsers = 0;
    for (const user of users) {
      const counts = await this.countsForUser(user.id, inactiveDays);
      if (!counts.overdue && !counts.dueToday && !counts.inactiveLeads && !unassignedPool) continue; // порожній не шлемо
      await this.notifications.notifyUser(user.id, {
        type: 'digest',
        title: 'Ранковий дайджест',
        body: this.renderUserLines(counts, unassignedPool),
        link: '/tasks',
      });
      sentToUsers++;
    }

    // Зведення для ADMIN — по всій команді, а не лише по тих, у кого digestHour
    // збігається з цим тіком: інакше «прострочено всього» залежало б від того,
    // хто ще налаштував собі той самий час, що для менеджерського зведення сенсу не має.
    const admins = users.filter((u) => u.role === 'ADMIN');
    if (admins.length) {
      const totals = await this.globalTotals(inactiveDays);
      if (totals.overdue || totals.inactiveLeads || unassignedPool) {
        for (const admin of admins) {
          await this.notifications.notifyUser(admin.id, {
            type: 'leads_inactive_digest',
            title: 'Ранковий дайджест: усі менеджери',
            body: `Прострочено всього: ${totals.overdue}. Лідів без активності: ${totals.inactiveLeads}. Нерозподілені: ${unassignedPool}.`,
            link: '/clients?assigneeId=none',
          });
        }
      }
    }

    this.logger.log(`Дайджест (${hour}:00): надіслано ${sentToUsers} користувачам, зведення ${admins.length} адмінам`);
  }

  /**
   * «Надіслати зараз» з профілю — ручна перевірка каналу доставки (той самий
   * сенс, що й /me/telegram/test), а не заміна крону. На відміну від
   * buildAndSendDigest() шле завжди, навіть якщо все порожньо — інакше клік
   * без ефекту виглядав би як зламана кнопка, а не «нема прострочень».
   */
  async sendDigestNow(userId: string): Promise<void> {
    const inactiveDays = await this.inactiveDaysSetting();
    const unassignedPool = await this.prisma.client.count({ where: { assignees: { none: {} }, deletedAt: null } });
    const counts = await this.countsForUser(userId, inactiveDays);
    await this.notifications.notifyUser(userId, {
      type: 'digest',
      title: 'Ранковий дайджест (тест)',
      body: this.renderUserLines(counts, unassignedPool),
      link: '/tasks',
    });
  }

  /** Тотали по всій активній команді (не лише по цьому тіку) — для зведення ADMIN. */
  private async globalTotals(inactiveDays: number): Promise<{ overdue: number; inactiveLeads: number }> {
    const now = new Date();
    const inactiveCutoff = new Date(now.getTime() - inactiveDays * 24 * 3_600_000);
    const [overdue, inactiveLeads] = await Promise.all([
      this.prisma.task.count({
        where: { assignee: { isActive: true }, status: { in: ['OPEN', 'IN_PROGRESS'] }, dueAt: { lt: now }, deletedAt: null },
      }),
      this.prisma.client.count({
        where: {
          deletedAt: null,
          assignees: { some: { user: { isActive: true } } },
          status: { stage: { in: ['LEAD', 'IN_WORK'] } },
          OR: [{ lastActivityAt: { lt: inactiveCutoff } }, { lastActivityAt: null, createdAt: { lt: inactiveCutoff } }],
        },
      }),
    ]);
    return { overdue, inactiveLeads };
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
