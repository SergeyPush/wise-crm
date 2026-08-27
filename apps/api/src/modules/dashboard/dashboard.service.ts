import { Injectable } from '@nestjs/common';
import { APP_SETTINGS } from 'shared';
import { endOfKyivDay, startOfKyivDay } from '../../common/utils/calendar.util';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardQueryDto } from './dto/dashboard.dto';

const DEFAULT_PROPOSAL_NO_REPLY_DAYS = 5;
const INACTIVE_DAYS_DEFAULT = 7;
const DEFAULT_PERIOD_DAYS = 90; // FR-5.1.4

export type Period = { from: Date; to: Date };

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  resolvePeriod(query: DashboardQueryDto): Period {
    const to = query.to ? new Date(query.to) : new Date();
    if (query.period === 'custom' && query.from) {
      return { from: new Date(query.from), to };
    }
    const days = query.period && query.period !== 'custom' ? Number(query.period) : DEFAULT_PERIOD_DAYS;
    return { from: new Date(to.getTime() - days * 24 * 3_600_000), to };
  }

  // ──────────────────────────── ADMIN (FR-5.1) ────────────────────────────

  async getAdminDashboard(period: Period) {
    const [funnel, newLeads, sourceConversion, leadToContract, avgFunnelDays, contractsSum, overdueByEmployee, unassignedCount, missingTariffDataCount, perManager] =
      await Promise.all([
        this.funnelByStatus(),
        this.prisma.client.count({ where: { deletedAt: null, createdAt: { gte: period.from, lte: period.to } } }),
        this.sourceConversion(period),
        this.leadToContractConversion(period),
        this.avgFunnelDays(),
        this.contractsSum(period),
        this.overdueByEmployee(),
        this.unassignedCount(),
        this.missingTariffDataCount(),
        this.perManagerBreakdown(period),
      ]);

    return {
      period,
      funnel,
      newLeads,
      sourceConversion,
      leadToContract,
      avgFunnelDays,
      contractsSum,
      overdueByEmployee,
      unassignedCount,
      missingTariffDataCount,
      perManager,
    };
  }

  private async funnelByStatus() {
    const statuses = await this.prisma.clientStatus.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
    const counts = await this.prisma.client.groupBy({
      by: ['statusId'],
      where: { deletedAt: null },
      _count: { _all: true },
    });
    const byStatus = new Map(counts.map((c) => [c.statusId, c._count._all]));
    return statuses.map((s) => ({ statusId: s.id, code: s.code, label: s.label, stage: s.stage, count: byStatus.get(s.id) ?? 0 }));
  }

  /** FR-5.1.4: обов'язково абсолютні числа поряд з відсотком — на малих обсягах % без знаменника марний. */
  private async sourceConversion(period: Period) {
    const sources = await this.prisma.leadSource.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
    const wonStatuses = await this.prisma.clientStatus.findMany({ where: { stage: 'WON' }, select: { id: true } });
    const wonIds = wonStatuses.map((s) => s.id);

    return Promise.all(
      sources.map(async (source) => {
        const where = { deletedAt: null, sourceId: source.id, createdAt: { gte: period.from, lte: period.to } };
        const [leads, contracts] = await Promise.all([
          this.prisma.client.count({ where }),
          this.prisma.client.count({ where: { ...where, statusId: { in: wonIds } } }),
        ]);
        return { sourceId: source.id, code: source.code, label: source.label, leads, contracts, pct: leads ? Math.round((contracts / leads) * 100) : 0 };
      }),
    );
  }

  /** FR-5.1: клієнти, створені в періоді, що коли-небудь дійшли до WON (навіть після кінця періоду). */
  private async leadToContractConversion(period: Period) {
    const wonStatuses = await this.prisma.clientStatus.findMany({ where: { stage: 'WON' }, select: { id: true } });
    const wonIds = wonStatuses.map((s) => s.id);
    const where = { deletedAt: null, createdAt: { gte: period.from, lte: period.to } };
    const [leads, contracts] = await Promise.all([
      this.prisma.client.count({ where }),
      this.prisma.client.count({ where: { ...where, statusId: { in: wonIds } } }),
    ]);
    return { leads, contracts, pct: leads ? Math.round((contracts / leads) * 100) : 0 };
  }

  /**
   * FR-5.1.5: від першого входу в LEAD (=Client.createdAt — клієнт завжди
   * створюється в статусі з isDefaultForNew, а він LEAD) до ПЕРШОГО входу
   * в WON. Повернення назад по воронці (FR-2.9) метрику не перераховують —
   * рахуємо мінімальний createdAt за toId зі stage=WON, а не поточний статус.
   */
  private async avgFunnelDays(): Promise<number | null> {
    const wonStatuses = await this.prisma.clientStatus.findMany({ where: { stage: 'WON' }, select: { id: true } });
    const wonIds = new Set(wonStatuses.map((s) => s.id));
    if (!wonIds.size) return null;

    const rows = await this.prisma.clientStatusHistory.findMany({
      where: { toId: { in: [...wonIds] } },
      select: { clientId: true, createdAt: true, client: { select: { createdAt: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const firstWonByClient = new Map<string, { enteredWonAt: Date; clientCreatedAt: Date }>();
    for (const row of rows) {
      if (!firstWonByClient.has(row.clientId)) {
        firstWonByClient.set(row.clientId, { enteredWonAt: row.createdAt, clientCreatedAt: row.client.createdAt });
      }
    }
    if (!firstWonByClient.size) return null;

    const totalDays = [...firstWonByClient.values()].reduce(
      (sum, { enteredWonAt, clientCreatedAt }) => sum + (enteredWonAt.getTime() - clientCreatedAt.getTime()) / 86_400_000,
      0,
    );
    return Math.round((totalDays / firstWonByClient.size) * 10) / 10;
  }

  /** FR-5.1.1: сума `monthlyFee` клієнтів, що ВПЕРШЕ увійшли в WON у періоді. */
  private async contractsSum(period: Period): Promise<number> {
    const wonStatuses = await this.prisma.clientStatus.findMany({ where: { stage: 'WON' }, select: { id: true } });
    const wonIds = new Set(wonStatuses.map((s) => s.id));
    if (!wonIds.size) return 0;

    const rows = await this.prisma.clientStatusHistory.findMany({
      where: { toId: { in: [...wonIds] } },
      select: { clientId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const firstWonAt = new Map<string, Date>();
    for (const row of rows) if (!firstWonAt.has(row.clientId)) firstWonAt.set(row.clientId, row.createdAt);

    const clientIds = [...firstWonAt.entries()]
      .filter(([, at]) => at >= period.from && at <= period.to)
      .map(([id]) => id);
    if (!clientIds.length) return 0;

    const agg = await this.prisma.client.aggregate({ where: { id: { in: clientIds } }, _sum: { monthlyFee: true } });
    return Number(agg._sum.monthlyFee ?? 0);
  }

  private async overdueByEmployee() {
    const rows = await this.prisma.task.groupBy({
      by: ['assigneeId'],
      where: { assigneeId: { not: null }, status: { in: ['OPEN', 'IN_PROGRESS'] }, dueAt: { lt: new Date() }, deletedAt: null },
      _count: { _all: true },
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.assigneeId).filter((id): id is string => !!id) } },
      select: { id: true, fullName: true },
    });
    const nameById = new Map(users.map((u) => [u.id, u.fullName]));
    return rows.map((r) => ({ userId: r.assigneeId as string, fullName: nameById.get(r.assigneeId as string) ?? '', overdueCount: r._count._all }));
  }

  private async unassignedCount(): Promise<number> {
    return this.prisma.client.count({ where: { deletedAt: null, assignees: { none: {} } } });
  }

  /** FR-2.0.5: договори (stage=WON), де хоч одне поле блоку «Для тарифу» не заповнене. */
  private async missingTariffDataCount(): Promise<number> {
    return this.prisma.client.count({
      where: {
        deletedAt: null,
        status: { stage: 'WON' },
        OR: [{ taxSystem: null }, { documentsPerMonth: null }, { employeeCount: null }],
      },
    });
  }

  /** FR-5.1.2: розріз по менеджерах, лише ADMIN. Без «лідерборду» — просто цифри для розмови сам на сам. */
  private async perManagerBreakdown(period: Period) {
    const managers = await this.prisma.user.findMany({ where: { isActive: true }, select: { id: true, fullName: true } });
    const wonStatuses = await this.prisma.clientStatus.findMany({ where: { stage: 'WON' }, select: { id: true } });
    const wonIds = wonStatuses.map((s) => s.id);

    return Promise.all(
      managers.map(async (manager) => {
        const [leadsInWork, contractsInPeriod, overdueCount] = await Promise.all([
          this.prisma.client.count({
            where: { deletedAt: null, assignees: { some: { userId: manager.id } }, status: { stage: { in: ['LEAD', 'IN_WORK'] } } },
          }),
          this.prisma.client.count({
            where: {
              deletedAt: null,
              assignees: { some: { userId: manager.id } },
              statusId: { in: wonIds },
              createdAt: { gte: period.from, lte: period.to },
            },
          }),
          this.prisma.task.count({
            where: { assigneeId: manager.id, status: { in: ['OPEN', 'IN_PROGRESS'] }, dueAt: { lt: new Date() }, deletedAt: null },
          }),
        ]);
        return { userId: manager.id, fullName: manager.fullName, leadsInWork, contractsInPeriod, overdueCount };
      }),
    );
  }

  // ──────────────────────────── USER (FR-5.2) ────────────────────────────

  async getUserDashboard(userId: string) {
    const [inactiveDays, proposalNoReplyDays] = await Promise.all([
      this.settingNumber(APP_SETTINGS.LEAD_INACTIVE_DAYS, INACTIVE_DAYS_DEFAULT),
      this.settingNumber(APP_SETTINGS.PROPOSAL_NO_REPLY_DAYS, DEFAULT_PROPOSAL_NO_REPLY_DAYS),
    ]);

    const now = new Date();
    const [myTasksToday, myOverdue, myClientsByStatus, leadsInactive, proposalsNoReply, unassignedCount] = await Promise.all([
      this.prisma.task.count({
        where: { assigneeId: userId, status: { in: ['OPEN', 'IN_PROGRESS'] }, dueAt: { gte: startOfKyivDay(now), lte: endOfKyivDay(now) }, deletedAt: null },
      }),
      this.prisma.task.count({
        where: { assigneeId: userId, status: { in: ['OPEN', 'IN_PROGRESS'] }, dueAt: { lt: now }, deletedAt: null },
      }),
      this.myClientsByStatus(userId),
      this.leadsInactiveCount(userId, inactiveDays),
      this.proposalsNoReplyCount(userId, proposalNoReplyDays),
      this.unassignedCount(),
    ]);

    return { myTasksToday, myOverdue, myClientsByStatus, leadsInactive, proposalsNoReply, unassignedCount };
  }

  private async myClientsByStatus(userId: string) {
    const statuses = await this.prisma.clientStatus.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
    const counts = await this.prisma.client.groupBy({
      by: ['statusId'],
      where: { deletedAt: null, assignees: { some: { userId } } },
      _count: { _all: true },
    });
    const byStatus = new Map(counts.map((c) => [c.statusId, c._count._all]));
    return statuses.map((s) => ({ statusId: s.id, code: s.code, label: s.label, count: byStatus.get(s.id) ?? 0 })).filter((s) => s.count > 0);
  }

  /** FR-5.2.1: лише активні стадії — угода, що вже завершилась, «без активності» не рахується. */
  private async leadsInactiveCount(userId: string, days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 3_600_000);
    return this.prisma.client.count({
      where: {
        deletedAt: null,
        assignees: { some: { userId } },
        status: { stage: { in: ['LEAD', 'IN_WORK'] } },
        OR: [{ lastActivityAt: { lt: cutoff } }, { lastActivityAt: null, createdAt: { lt: cutoff } }],
      },
    });
  }

  /** FR-5.2: клієнти в PROPOSAL_SENT довше N днів з моменту входу в цей статус. */
  private async proposalsNoReplyCount(userId: string, days: number): Promise<number> {
    const proposalStatus = await this.prisma.clientStatus.findFirst({ where: { code: 'PROPOSAL_SENT' } });
    if (!proposalStatus) return 0;

    const clients = await this.prisma.client.findMany({
      where: { deletedAt: null, statusId: proposalStatus.id, assignees: { some: { userId } } },
      select: { id: true },
    });
    if (!clients.length) return 0;

    const cutoff = new Date(Date.now() - days * 24 * 3_600_000);
    let count = 0;
    for (const client of clients) {
      const last = await this.prisma.clientStatusHistory.findFirst({
        where: { clientId: client.id, toId: proposalStatus.id },
        orderBy: { createdAt: 'desc' },
      });
      if (last && last.createdAt < cutoff) count++;
    }
    return count;
  }

  private async settingNumber(key: string, fallback: number): Promise<number> {
    const row = await this.prisma.appSetting.findUnique({ where: { key } });
    return typeof row?.value === 'number' ? row.value : fallback;
  }
}
