import { Injectable } from '@nestjs/common';
import { Prisma, Priority, TaskStatus } from '@prisma/client';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { endOfKyivDay, endOfKyivDayPlus, endOfNextKyivWeek, kyivDateParts } from '../../common/utils/calendar.util';
import { ErrorCode, TASK_TYPES_REQUIRING_RESULT, TaskType, can } from 'shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/app.exception';
import { PaginationQueryDto, paginated } from '../../common/dto/pagination.dto';
import { ActivityService, diffChanged } from '../activity/activity.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CancelTaskDto,
  CompleteTaskDto,
  CreateTaskDto,
  ListTasksQueryDto,
  SnoozeTaskDto,
  UpdateTaskDto,
} from './dto/task.dto';

const LIST_SELECT = {
  id: true,
  title: true,
  description: true,
  type: true,
  status: true,
  priority: true,
  dueAt: true,
  completedAt: true,
  result: true,
  cancelReason: true,
  createdAt: true,
  updatedAt: true,
  client: { select: { id: true, displayName: true } },
  assignee: { select: { id: true, fullName: true } },
  author: { select: { id: true, fullName: true } },
} satisfies Prisma.TaskSelect;

const OPEN_STATUSES: TaskStatus[] = ['OPEN', 'IN_PROGRESS'];

/** FR-4.5: «призначено задачу з терміном сьогодні» — HIGH, решта призначень — NORMAL. */
function isDueTodayKyiv(dueAt: Date | null, now: Date = new Date()): boolean {
  if (!dueAt) return false;
  const a = kyivDateParts(dueAt);
  const b = kyivDateParts(now);
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Группировка по срокам считается на клиенте (09-implementation-plan.md) — отдаём плоский список. */
  async list(q: ListTasksQueryDto, actorId: string) {
    const statuses = q.parsedStatuses();
    const where: Prisma.TaskWhereInput = {
      deletedAt: null,
      ...(q.assigneeId === 'none'
        ? { assigneeId: null }
        : q.assigneeId === 'me'
          ? { assigneeId: actorId }
          : q.assigneeId
            ? { assigneeId: q.assigneeId }
            : {}),
      ...(q.clientId ? { clientId: q.clientId } : {}),
      ...(q.authorId ? { authorId: q.authorId } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(statuses ? { status: { in: statuses as TaskStatus[] } } : {}),
      ...(q.dueBefore ? { dueAt: { lte: new Date(q.dueBefore) } } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        select: LIST_SELECT,
        orderBy: q.orderBy(['dueAt', 'createdAt', 'updatedAt'], { dueAt: 'asc' }),
        skip: q.skip,
        take: q.limit,
      }),
      this.prisma.task.count({ where }),
    ]);
    return paginated(items, total, q as PaginationQueryDto);
  }

  async get(id: string) {
    const task = await this.prisma.task.findFirst({ where: { id, deletedAt: null }, select: LIST_SELECT });
    if (!task) throw new AppException(404, ErrorCode.NOT_FOUND, 'Задачу не знайдено');
    return task;
  }

  /** Быстрое добавление («Що зробити? ⏎») и полная форма — один эндпоинт. */
  async create(dto: CreateTaskDto, actorId: string) {
    // undefined — на себя (умолчание), null — явно в пул, uuid — конкретному человеку
    const assigneeId = dto.assigneeId === undefined ? actorId : dto.assigneeId;
    if (assigneeId) {
      const assignee = await this.prisma.user.findUnique({ where: { id: assigneeId } });
      if (!assignee || !assignee.isActive) {
        throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Виконавця не знайдено');
      }
    }
    if (dto.clientId) {
      const client = await this.prisma.client.findFirst({ where: { id: dto.clientId, deletedAt: null } });
      if (!client) throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Клієнта не знайдено');
    }

    const taskId = await this.prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          title: dto.title,
          description: dto.description,
          type: dto.type ?? 'OTHER',
          priority: dto.priority ?? 'NORMAL',
          clientId: dto.clientId,
          assigneeId,
          authorId: actorId,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : endOfKyivDay(),
        },
      });

      if (dto.clientId) {
        await this.activity.log(
          { clientId: dto.clientId, actorId, type: 'task_created', entityType: 'task', entityId: task.id, payload: { title: dto.title } },
          tx,
        );
      }

      // FR-3.2: призначення на іншого — повідомлення і аудит, а не заборона
      if (assigneeId && assigneeId !== actorId) {
        await this.audit.log(
          { actorId, action: 'task.assign', entityType: 'task', entityId: task.id, targetUserId: assigneeId },
          tx,
        );
        await this.notifications.notifyUser(
          assigneeId,
          {
            type: 'task_assigned',
            title: `Нова задача: ${dto.title}`,
            entityType: 'task',
            entityId: task.id,
            link: `/tasks/${task.id}`,
            priority: isDueTodayKyiv(task.dueAt) ? Priority.HIGH : Priority.NORMAL,
          },
          tx,
        );
      }

      return task.id;
    });

    return this.get(taskId);
  }

  async update(id: string, dto: UpdateTaskDto, actor: AuthUser) {
    const current = await this.prisma.task.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new AppException(404, ErrorCode.NOT_FOUND, 'Задачу не знайдено');

    const reassigning = dto.assigneeId !== undefined && dto.assigneeId !== current.assigneeId;
    // FR-3.2: перепризначення задачі, що вже має виконавця, — лише автор,
    // поточний виконавець або ADMIN. Задачу з пулу (без виконавця) взяти
    // може будь-хто — це і є «Взяти в роботу» з FR-8.2, окремого ендпоінта не треба.
    if (reassigning && current.assigneeId) {
      const isAuthor = current.authorId === actor.id;
      const isCurrentAssignee = current.assigneeId === actor.id;
      if (!isAuthor && !isCurrentAssignee && actor.role !== 'ADMIN') {
        throw new AppException(403, ErrorCode.FORBIDDEN, 'Перепризначити може лише автор, виконавець або адміністратор');
      }
    }
    if (dto.assigneeId) {
      const assignee = await this.prisma.user.findUnique({ where: { id: dto.assigneeId } });
      if (!assignee || !assignee.isActive) {
        throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Виконавця не знайдено');
      }
    }

    const { updatedAt: dtoUpdatedAt, dueAt, ...rest } = dto;
    const staleAt = new Date(dtoUpdatedAt);
    const data: Prisma.TaskUncheckedUpdateInput = {
      ...rest,
      ...(dueAt !== undefined ? { dueAt: new Date(dueAt) } : {}),
    };

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.task.updateMany({ where: { id, updatedAt: staleAt }, data });
      if (result.count === 0) {
        throw new AppException(409, ErrorCode.CONFLICT_STALE_DATA, 'Дані змінено іншим користувачем, оновіть сторінку');
      }

      if (current.clientId) {
        // Backlog «Деталізація стрічки активності»: diff по значеннях, а не
        // лише перелік імен полів (той самий підхід, що й clients.service.ts).
        const changed = diffChanged(Object.keys(data), current as unknown as Record<string, unknown>, data as Record<string, unknown>);
        await this.activity.log(
          {
            clientId: current.clientId,
            actorId: actor.id,
            type: reassigning ? 'task_reassigned' : 'task_updated',
            entityType: 'task',
            entityId: id,
            payload: { changed },
          },
          tx,
        );
      }

      if (reassigning) {
        await this.audit.log(
          {
            actorId: actor.id,
            action: 'task.reassign',
            entityType: 'task',
            entityId: id,
            targetUserId: dto.assigneeId ?? undefined,
            payload: { from: current.assigneeId, to: dto.assigneeId ?? null },
          },
          tx,
        );
        if (dto.assigneeId && dto.assigneeId !== actor.id) {
          const effectiveDueAt = dueAt !== undefined ? new Date(dueAt) : current.dueAt;
          await this.notifications.notifyUser(
            dto.assigneeId,
            {
              type: 'task_assigned',
              title: `Задачу передано вам: ${current.title}`,
              entityType: 'task',
              entityId: id,
              link: `/tasks/${id}`,
              priority: isDueTodayKyiv(effectiveDueAt) ? Priority.HIGH : Priority.NORMAL,
            },
            tx,
          );
        }
      }
    });

    return this.get(id);
  }

  /** FR-3.5: результат обов'язковий для ДЗВІНОК/КП/ДОГОВІР. */
  async complete(id: string, dto: CompleteTaskDto, actorId: string) {
    const task = await this.prisma.task.findFirst({ where: { id, deletedAt: null } });
    if (!task) throw new AppException(404, ErrorCode.NOT_FOUND, 'Задачу не знайдено');
    if (!OPEN_STATUSES.includes(task.status)) {
      throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Задача вже закрита');
    }
    if (TASK_TYPES_REQUIRING_RESULT.includes(task.type as TaskType) && !dto.result?.trim()) {
      throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Вкажіть результат');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id },
        data: { status: 'DONE', completedAt: new Date(), result: dto.result },
      });
      if (task.clientId) {
        await this.activity.log(
          { clientId: task.clientId, actorId, type: 'task_completed', entityType: 'task', entityId: id, payload: { result: dto.result ?? null } },
          tx,
        );
      }
      await this.audit.log({ actorId, action: 'task.complete', entityType: 'task', entityId: id }, tx);
    });

    return this.get(id);
  }

  /** Причина обов'язкова завжди, для будь-якого типу (FR-3.5). */
  async cancel(id: string, dto: CancelTaskDto, actorId: string) {
    const task = await this.prisma.task.findFirst({ where: { id, deletedAt: null } });
    if (!task) throw new AppException(404, ErrorCode.NOT_FOUND, 'Задачу не знайдено');
    if (!OPEN_STATUSES.includes(task.status)) {
      throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Задача вже закрита');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: dto.reason } });
      if (task.clientId) {
        await this.activity.log(
          { clientId: task.clientId, actorId, type: 'task_cancelled', entityType: 'task', entityId: id, payload: { reason: dto.reason } },
          tx,
        );
      }
      await this.audit.log({ actorId, action: 'task.cancel', entityType: 'task', entityId: id, payload: { reason: dto.reason } }, tx);
    });

    return this.get(id);
  }

  /** Перенос строку пресетами (FR-8.2) — та сама дія бере участь в оптимістичному відкаті (FR-8.8). */
  async snooze(id: string, dto: SnoozeTaskDto, actorId: string) {
    const task = await this.prisma.task.findFirst({ where: { id, deletedAt: null } });
    if (!task) throw new AppException(404, ErrorCode.NOT_FOUND, 'Задачу не знайдено');

    let newDueAt: Date;
    switch (dto.preset) {
      case 'today':
        newDueAt = endOfKyivDay();
        break;
      case 'tomorrow':
        newDueAt = endOfKyivDayPlus(1);
        break;
      case 'in3days':
        newDueAt = endOfKyivDayPlus(3);
        break;
      case 'nextweek':
        newDueAt = endOfNextKyivWeek();
        break;
      case 'custom':
        if (!dto.date) throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Вкажіть дату');
        newDueAt = endOfKyivDay(new Date(dto.date));
        break;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id }, data: { dueAt: newDueAt } });
      if (task.clientId) {
        await this.activity.log(
          { clientId: task.clientId, actorId, type: 'task_snoozed', entityType: 'task', entityId: id, payload: { from: task.dueAt, to: newDueAt, preset: dto.preset } },
          tx,
        );
      }
      await this.audit.log(
        { actorId, action: 'task.snooze', entityType: 'task', entityId: id, payload: { from: task.dueAt, to: newDueAt } },
        tx,
      );
    });

    return this.get(id);
  }

  /** Мягкое удаление — автор или ADMIN (FR-3.8). Guard проверяет только роль, владение — здесь. */
  async remove(id: string, actor: AuthUser) {
    const task = await this.prisma.task.findFirst({ where: { id, deletedAt: null } });
    if (!task) throw new AppException(404, ErrorCode.NOT_FOUND, 'Задачу не знайдено');

    if (!can(actor.role, 'task:delete', { isOwner: task.authorId === actor.id })) {
      throw new AppException(403, ErrorCode.FORBIDDEN, 'Недостатньо прав');
    }

    await this.prisma.task.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({ actorId: actor.id, action: 'task.delete', entityType: 'task', entityId: id });
    return { ok: true };
  }
}
