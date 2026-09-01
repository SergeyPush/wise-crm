import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Stage, TaskType } from '@prisma/client';
import ExcelJS from 'exceljs';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TelegramService } from '../telegram/telegram.service';
import { ExportClientsQueryDto, ExportTasksQueryDto } from './dto/export.dto';

// FR-E2: реквізити текстом — інакше Excel зжере провідний нуль у ЄДРПОУ.
const TEXT_FORMAT = { numFmt: '@' };

@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly telegram: TelegramService,
    private readonly config: ConfigService,
  ) {}

  async exportClients(query: ExportClientsQueryDto, actor: AuthUser): Promise<Buffer> {
    const where = this.clientsWhere(query);

    const clients = await this.prisma.client.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        status: true,
        source: true,
        lostReason: true,
        contacts: true,
        assignees: { include: { user: { select: { fullName: true } } } },
      },
    });
    const clientIds = clients.map((c) => c.id);
    const [tasks, history] = await Promise.all([
      this.prisma.task.findMany({
        where: { clientId: { in: clientIds }, deletedAt: null },
        include: {
          assignee: { select: { fullName: true } },
          author: { select: { fullName: true } },
          client: { select: { displayName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.clientStatusHistory.findMany({
        where: { clientId: { in: clientIds } },
        include: {
          from: true,
          to: true,
          reason: true,
          user: { select: { fullName: true } },
          client: { select: { displayName: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const workbook = new ExcelJS.Workbook();
    this.addClientsSheet(workbook, clients);
    this.addContactsSheet(workbook, clients);
    this.addTasksSheet(workbook, tasks);
    this.addHistorySheet(workbook, history);

    await this.auditExport(actor, 'clients', clients.length, this.isUnfiltered(query));
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async exportTasks(query: ExportTasksQueryDto, actor: AuthUser): Promise<Buffer> {
    const where = this.tasksWhere(query);
    const tasks = await this.prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        assignee: { select: { fullName: true } },
        author: { select: { fullName: true } },
        client: { select: { displayName: true } },
      },
    });

    const workbook = new ExcelJS.Workbook();
    this.addTasksSheet(workbook, tasks);

    await this.auditExport(actor, 'tasks', tasks.length, this.isUnfiltered(query));
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  // ──────────────────────────── where-клоузи ────────────────────────────

  // Право 'export:run' з 01.09.2026 є лише в ADMIN (packages/shared/permissions.ts),
  // тому звуження вибірки за actor тут більше не потрібне — лишається лише
  // фільтр за query-параметрами.
  private clientsWhere(q: ExportClientsQueryDto): Prisma.ClientWhereInput {
    const where: Prisma.ClientWhereInput = {
      deletedAt: null,
      ...(q.statusId ? { statusId: q.statusId } : {}),
      ...(q.stage ? { status: { stage: q.stage as Stage } } : {}),
      ...(q.sourceId ? { sourceId: q.sourceId } : {}),
      ...(q.tagId ? { tags: { some: { tagId: q.tagId } } } : {}),
      ...(q.q ? { displayName: { contains: q.q, mode: 'insensitive' } } : {}),
    };
    if (q.assigneeId === 'none') {
      where.assignees = { none: {} };
    } else if (q.assigneeId) {
      where.assignees = { some: { userId: q.assigneeId } };
    }
    return where;
  }

  private tasksWhere(q: ExportTasksQueryDto): Prisma.TaskWhereInput {
    const where: Prisma.TaskWhereInput = {
      deletedAt: null,
      ...(q.clientId ? { clientId: q.clientId } : {}),
      ...(q.type ? { type: q.type as TaskType } : {}),
      ...(q.status ? { status: q.status as Prisma.TaskWhereInput['status'] } : {}),
    };
    if (q.assigneeId === 'none') {
      where.assigneeId = null;
    } else if (q.assigneeId) {
      where.assigneeId = q.assigneeId;
    }
    return where;
  }

  private isUnfiltered(q: ExportClientsQueryDto | ExportTasksQueryDto): boolean {
    return Object.values(q).every((v) => v === undefined);
  }

  // ──────────────────────────── FR-E6: повна вивантаження ────────────────────────────

  /** ADMIN без фільтра — подія безпеки: аудит завжди, сповіщення — лише для повної вивантаженні. */
  private async auditExport(actor: AuthUser, entity: 'clients' | 'tasks', count: number, unfiltered: boolean): Promise<void> {
    const isFullExport = actor.role === 'ADMIN' && unfiltered;
    await this.audit.log({
      actorId: actor.id,
      action: 'export.run',
      entityType: entity,
      payload: { count, full: isFullExport },
    });
    if (!isFullExport) return;

    const label = entity === 'clients' ? 'клієнтів' : 'задач';
    const otherAdmins = await this.prisma.user.findMany({
      where: { role: 'ADMIN', isActive: true, id: { not: actor.id } },
      select: { id: true },
    });
    const message = `${actor.fullName} вивантажив(ла) повний експорт даних (${count} ${label})`;

    if (otherAdmins.length) {
      for (const admin of otherAdmins) {
        await this.notifications.notifyUser(admin.id, {
          type: 'full_export',
          title: message,
          entityType: entity,
          priority: 'HIGH',
        });
      }
      return;
    }
    // Єдиний ADMIN у системі — сповіщати нікого через in-app, інакше контроль
    // існує лише на папері (FR-E6). Дублюємо в Telegram-групу моніторингу.
    const alertChatId = this.config.get<string>('ALERT_TELEGRAM_CHAT_ID');
    if (alertChatId && this.telegram.isEnabled) {
      await this.telegram.send(alertChatId, `⚠️ ${message}`).catch(() => {});
    }
  }

  // ──────────────────────────── аркуші ────────────────────────────

  private addClientsSheet(workbook: ExcelJS.Workbook, clients: ClientRow[]): void {
    const sheet = workbook.addWorksheet('Клієнти', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = [
      { header: 'ID', key: 'id', width: 20, style: TEXT_FORMAT },
      { header: 'Назва', key: 'displayName', width: 30 },
      { header: 'Юр. назва', key: 'legalName', width: 30 },
      { header: 'Тип', key: 'type', width: 12 },
      { header: 'ЄДРПОУ', key: 'edrpou', width: 12, style: TEXT_FORMAT },
      { header: 'РНОКПП', key: 'rnokpp', width: 14, style: TEXT_FORMAT },
      { header: 'ІПН ПДВ', key: 'vatNumber', width: 14, style: TEXT_FORMAT },
      { header: 'Платник ПДВ', key: 'isVatPayer', width: 12 },
      { header: 'Система оподаткування', key: 'taxSystem', width: 16 },
      { header: 'Найманих працівників', key: 'employeeCount', width: 12 },
      { header: 'Документів/міс', key: 'documentsPerMonth', width: 14 },
      { header: 'Дія.City', key: 'isDiiaCity', width: 10 },
      { header: 'Юр. адреса', key: 'legalAddress', width: 30 },
      { header: 'Факт. адреса', key: 'actualAddress', width: 30 },
      { header: 'Статус', key: 'status', width: 18 },
      { header: 'Джерело', key: 'source', width: 16 },
      { header: 'Причина відмови', key: 'lostReason', width: 18 },
      { header: 'Тариф, ₴/міс', key: 'monthlyFee', width: 12 },
      { header: '№ договору', key: 'contractNo', width: 14, style: TEXT_FORMAT },
      { header: 'Дата договору', key: 'contractDate', width: 14 },
      { header: 'Відповідальний', key: 'primaryAssignee', width: 24 },
      { header: 'Створено', key: 'createdAt', width: 18 },
    ];
    for (const c of clients) {
      const primary = c.assignees.find((a) => a.role === 'PRIMARY');
      sheet.addRow({
        id: c.id,
        displayName: c.displayName,
        legalName: c.legalName,
        type: c.type,
        edrpou: c.edrpou,
        rnokpp: c.rnokpp,
        vatNumber: c.vatNumber,
        isVatPayer: c.isVatPayer ? 'так' : 'ні',
        taxSystem: c.taxSystem,
        employeeCount: c.employeeCount,
        documentsPerMonth: c.documentsPerMonth,
        isDiiaCity: c.isDiiaCity ? 'так' : 'ні',
        legalAddress: c.legalAddress,
        actualAddress: c.actualAddress,
        status: c.status.label,
        source: c.source?.label ?? '',
        lostReason: c.lostReason?.label ?? '',
        monthlyFee: c.monthlyFee ? Number(c.monthlyFee) : null,
        contractNo: c.contractNo,
        contractDate: c.contractDate,
        primaryAssignee: primary?.user.fullName ?? '',
        createdAt: c.createdAt,
      });
    }
    this.finalize(sheet);
  }

  private addContactsSheet(workbook: ExcelJS.Workbook, clients: ClientRow[]): void {
    const sheet = workbook.addWorksheet('Контакти', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = [
      { header: 'Клієнт', key: 'client', width: 30 },
      { header: 'ПІБ', key: 'fullName', width: 24 },
      { header: 'Посада', key: 'position', width: 18 },
      { header: 'Телефон', key: 'phone', width: 16, style: TEXT_FORMAT },
      { header: 'Email', key: 'email', width: 24 },
      { header: 'Основний', key: 'isPrimary', width: 10 },
    ];
    for (const c of clients) {
      for (const contact of c.contacts) {
        sheet.addRow({
          client: c.displayName,
          fullName: contact.fullName,
          position: contact.position,
          phone: contact.phone,
          email: contact.email,
          isPrimary: contact.isPrimary ? 'так' : 'ні',
        });
      }
    }
    this.finalize(sheet);
  }

  private addTasksSheet(workbook: ExcelJS.Workbook, tasks: TaskRow[]): void {
    const sheet = workbook.addWorksheet('Задачі', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = [
      { header: 'Клієнт', key: 'client', width: 30 },
      { header: 'Назва', key: 'title', width: 30 },
      { header: 'Тип', key: 'type', width: 12 },
      { header: 'Статус', key: 'status', width: 14 },
      { header: 'Пріоритет', key: 'priority', width: 10 },
      { header: 'Виконавець', key: 'assignee', width: 20 },
      { header: 'Автор', key: 'author', width: 20 },
      { header: 'Термін', key: 'dueAt', width: 18 },
      { header: 'Виконано', key: 'completedAt', width: 18 },
      { header: 'Результат', key: 'result', width: 30 },
      { header: 'Причина скасування', key: 'cancelReason', width: 30 },
      { header: 'Створено', key: 'createdAt', width: 18 },
    ];
    for (const t of tasks) {
      sheet.addRow({
        client: t.client?.displayName ?? '',
        title: t.title,
        type: t.type,
        status: t.status,
        priority: t.priority,
        assignee: t.assignee?.fullName ?? '',
        author: t.author?.fullName ?? '',
        dueAt: t.dueAt,
        completedAt: t.completedAt,
        result: t.result,
        cancelReason: t.cancelReason,
        createdAt: t.createdAt,
      });
    }
    this.finalize(sheet);
  }

  private addHistorySheet(workbook: ExcelJS.Workbook, history: HistoryRow[]): void {
    const sheet = workbook.addWorksheet('Історія статусів', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = [
      { header: 'Клієнт', key: 'client', width: 30 },
      { header: 'З статусу', key: 'from', width: 18 },
      { header: 'В статус', key: 'to', width: 18 },
      { header: 'Причина', key: 'reason', width: 18 },
      { header: 'Коментар', key: 'comment', width: 30 },
      { header: 'Хто змінив', key: 'user', width: 20 },
      { header: 'Коли', key: 'createdAt', width: 18 },
    ];
    for (const h of history) {
      sheet.addRow({
        client: h.client.displayName,
        from: h.from?.label ?? '',
        to: h.to.label,
        reason: h.reason?.label ?? '',
        comment: h.comment,
        user: h.user.fullName,
        createdAt: h.createdAt,
      });
    }
    this.finalize(sheet);
  }

  private finalize(sheet: ExcelJS.Worksheet): void {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
    sheet.getRow(1).font = { bold: true };
  }
}

type ClientRow = Prisma.ClientGetPayload<{
  include: {
    status: true;
    source: true;
    lostReason: true;
    contacts: true;
    assignees: { include: { user: { select: { fullName: true } } } };
  };
}>;

type TaskRow = Prisma.TaskGetPayload<{
  include: {
    assignee: { select: { fullName: true } };
    author: { select: { fullName: true } };
    client: { select: { displayName: true } };
  };
}>;

type HistoryRow = Prisma.ClientStatusHistoryGetPayload<{
  include: {
    from: true;
    to: true;
    reason: true;
    user: { select: { fullName: true } };
    client: { select: { displayName: true } };
  };
}>;
