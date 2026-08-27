import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Stage } from '@prisma/client';
import { ErrorCode, can } from 'shared';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/app.exception';
import { PaginationQueryDto, paginated } from '../../common/dto/pagination.dto';
import { normalizePhone } from '../../common/utils/phone.util';
import { isValidEdrpou, isValidRnokpp } from '../../common/utils/validators.util';
import { ActivityService, diffChanged } from '../activity/activity.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  AddTagDto,
  AssigneesDto,
  BulkClientsDto,
  ChangeStatusDto,
  ClientDuplicatesQueryDto,
  ContactDto,
  ContactLogDto,
  CreateClientDto,
  ListClientsQueryDto,
  UpdateClientDto,
} from './dto/client.dto';

const CARD_INCLUDE = {
  status: true,
  source: true,
  lostReason: true,
  assignees: { include: { user: { select: { id: true, fullName: true, isActive: true } } } },
  contacts: true,
  tags: { include: { tag: true } },
} satisfies Prisma.ClientInclude;

const LIST_SELECT = {
  id: true,
  displayName: true,
  type: true,
  needsQualification: true,
  taxSystem: true,
  isVatPayer: true,
  edrpou: true,
  rnokpp: true,
  createdAt: true,
  updatedAt: true,
  lastActivityAt: true,
  deletedAt: true,
  status: { select: { code: true, label: true, color: true, stage: true } },
  source: { select: { code: true, label: true } },
  assignees: { select: { role: true, user: { select: { id: true, fullName: true } } } },
  tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
  contacts: { where: { isPrimary: true }, take: 1, select: { phone: true, email: true } },
} satisfies Prisma.ClientSelect;

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(q: ListClientsQueryDto, actor: AuthUser) {
    // FR-8.1 «Відновити»: архів бачить лише той, хто може видаляти/відновлювати —
    // той самий client:delete, що й на DELETE /clients/:id.
    if (q.deleted && !can(actor.role, 'client:delete')) {
      throw new AppException(403, ErrorCode.FORBIDDEN, 'Недостатньо прав');
    }

    const where: Prisma.ClientWhereInput = {
      deletedAt: q.deleted ? { not: null } : null,
      ...(q.statusId ? { statusId: q.statusId } : {}),
      ...(q.stage ? { status: { stage: q.stage as Stage } } : {}),
      ...(q.sourceId ? { sourceId: q.sourceId } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.tagId ? { tags: { some: { tagId: q.tagId } } } : {}),
      ...(q.assigneeId === 'none'
        ? { assignees: { none: {} } }
        : q.assigneeId
          ? { assignees: { some: { userId: q.assigneeId } } }
          : {}),
      ...(q.q ? { OR: this.buildSearchOr(q.q) } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        select: LIST_SELECT,
        orderBy: q.orderBy(['displayName', 'createdAt', 'lastActivityAt', 'updatedAt'], {
          createdAt: 'desc',
        }),
        skip: q.skip,
        take: q.limit,
      }),
      this.prisma.client.count({ where }),
    ]);
    return paginated(items, total, q as PaginationQueryDto);
  }

  /** FR-2.10: одним инпутом — назва, ЄДРПОУ/РНОКПП, телефон, email; телефон — по нормализованной колонке. */
  private buildSearchOr(q: string): Prisma.ClientWhereInput[] {
    const or: Prisma.ClientWhereInput[] = [
      { displayName: { contains: q, mode: 'insensitive' } },
      { legalName: { contains: q, mode: 'insensitive' } },
      { edrpou: { contains: q } },
      { rnokpp: { contains: q } },
      {
        contacts: {
          some: {
            OR: [
              { fullName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q } },
            ],
          },
        },
      },
    ];
    const normalized = normalizePhone(q);
    if (normalized) or.push({ contacts: { some: { phoneNormalized: normalized } } });
    return or;
  }

  async get(id: string) {
    // Независимые запросы — параллельно, а не один за другим
    const [client, lastStatusChange] = await Promise.all([
      this.prisma.client.findFirst({ where: { id, deletedAt: null }, include: CARD_INCLUDE }),
      this.prisma.clientStatusHistory.findFirst({
        where: { clientId: id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);
    if (!client) throw new AppException(404, ErrorCode.NOT_FOUND, 'Клієнта не знайдено');

    return { ...client, statusSince: lastStatusChange?.createdAt ?? client.createdAt };
  }

  async create(dto: CreateClientDto, actorId: string) {
    if (!dto.phone && !dto.email) {
      throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Вкажіть телефон або email');
    }

    const defaultStatus = await this.prisma.clientStatus.findFirst({
      where: { isDefaultForNew: true },
    });
    if (!defaultStatus) {
      throw new AppException(500, ErrorCode.INTERNAL, 'Не налаштовано стартовий статус ліда');
    }

    const assigneeId = dto.assigneeId ?? actorId;
    const assignee = await this.prisma.user.findUnique({ where: { id: assigneeId } });
    if (!assignee || !assignee.isActive) {
      throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Відповідального не знайдено');
    }

    const clientId = await this.prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          displayName: dto.displayName,
          statusId: defaultStatus.id,
          sourceId: dto.sourceId,
          assignees: { create: { userId: assigneeId, role: 'PRIMARY' } },
          ...(dto.phone || dto.email
            ? {
                contacts: {
                  create: {
                    phone: dto.phone,
                    phoneNormalized: normalizePhone(dto.phone),
                    email: dto.email,
                    isPrimary: true,
                  },
                },
              }
            : {}),
        },
      });
      await this.activity.log(
        { clientId: client.id, actorId, type: 'client_created', payload: { displayName: dto.displayName } },
        tx,
      );
      return client.id;
    });

    return this.get(clientId);
  }

  async update(id: string, dto: UpdateClientDto, actorId: string) {
    const current = await this.prisma.client.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new AppException(404, ErrorCode.NOT_FOUND, 'Клієнта не знайдено');

    if (dto.edrpou && !isValidEdrpou(dto.edrpou)) {
      throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Некоректний ЄДРПОУ');
    }
    if (dto.rnokpp && !isValidRnokpp(dto.rnokpp)) {
      throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Некоректний РНОКПП');
    }

    const { updatedAt: dtoUpdatedAt, vatRegDate, contractDate, ...rest } = dto;
    const staleAt = new Date(dtoUpdatedAt);
    const data: Prisma.ClientUncheckedUpdateInput = {
      ...rest,
      ...(vatRegDate !== undefined ? { vatRegDate: new Date(vatRegDate) } : {}),
      ...(contractDate !== undefined ? { contractDate: new Date(contractDate) } : {}),
    };

    // FR-W3: карточка без имени перестаёт требовать уточнения, когда его вписали
    if (dto.displayName && dto.displayName !== current.displayName) {
      data.needsQualification = false;
    }

    await this.prisma.$transaction(async (tx) => {
      // NFR-46: атомарная проверка конкурентности прямо в UPDATE, а не read-then-write —
      // иначе два параллельных PATCH с одним и тем же устаревшим updatedAt оба проходят
      // проверку «снаружи», и второй молча перезаписывает первый.
      const result = await tx.client.updateMany({ where: { id, updatedAt: staleAt }, data });
      if (result.count === 0) {
        throw new AppException(
          409,
          ErrorCode.CONFLICT_STALE_DATA,
          'Дані змінено іншим користувачем, оновіть сторінку',
        );
      }
      // Backlog «Деталізація стрічки активності»: diff по значеннях, а не
      // лише перелік імен полів — current уже під рукою (fetched вище), data
      // містить фінальні (сконвертовані) значення, що йдуть у БД.
      const changed = diffChanged(Object.keys(data), current as unknown as Record<string, unknown>, data as Record<string, unknown>);
      await this.activity.log({ clientId: id, actorId, type: 'field_changed', payload: { changed } }, tx);
    });

    return this.get(id);
  }

  async remove(id: string, actorId: string, ip?: string) {
    const client = await this.prisma.client.findFirst({ where: { id, deletedAt: null } });
    if (!client) throw new AppException(404, ErrorCode.NOT_FOUND, 'Клієнта не знайдено');

    await this.prisma.client.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({ actorId, action: 'client.delete', entityType: 'client', entityId: id, ip });
    return { ok: true };
  }

  /** FR-8.1 «Відновити» — пара до архівації, той самий client:delete (перевіряє guard). */
  async restore(id: string, actorId: string, ip?: string) {
    const client = await this.prisma.client.findFirst({ where: { id, deletedAt: { not: null } } });
    if (!client) throw new AppException(404, ErrorCode.NOT_FOUND, 'Архівного клієнта не знайдено');

    await this.prisma.client.update({ where: { id }, data: { deletedAt: null } });
    await this.audit.log({ actorId, action: 'client.restore', entityType: 'client', entityId: id, ip });
    return this.get(id);
  }

  async duplicates(q: ClientDuplicatesQueryDto) {
    if (!q.phone && !q.email && !q.edrpou && !q.rnokpp) return [];
    const normalized = normalizePhone(q.phone);

    const or: Prisma.ClientWhereInput[] = [];
    if (q.edrpou) or.push({ edrpou: q.edrpou });
    if (q.rnokpp) or.push({ rnokpp: q.rnokpp });
    if (normalized) or.push({ contacts: { some: { phoneNormalized: normalized } } });
    if (q.email) or.push({ contacts: { some: { email: q.email.toLowerCase() } } });
    if (!or.length) return [];

    const clients = await this.prisma.client.findMany({
      where: { deletedAt: null, OR: or },
      take: 5,
      select: {
        id: true,
        displayName: true,
        lastActivityAt: true,
        status: { select: { label: true, color: true } },
        assignees: {
          where: { role: 'PRIMARY' },
          take: 1,
          select: { user: { select: { fullName: true } } },
        },
      },
    });
    return clients.map((c) => ({
      id: c.id,
      displayName: c.displayName,
      status: c.status,
      primaryAssignee: c.assignees[0]?.user.fullName ?? null,
      lastActivityAt: c.lastActivityAt,
    }));
  }

  /** «Взяти в роботу» (FR-2.0.3): назначить себя PRIMARY, прежнего — уведомить. */
  async claim(id: string, actorId: string) {
    const client = await this.prisma.client.findFirst({ where: { id, deletedAt: null } });
    if (!client) throw new AppException(404, ErrorCode.NOT_FOUND, 'Клієнта не знайдено');

    await this.prisma.$transaction(async (tx) => {
      // Читаем prevPrimary внутри транзакции, а не до неё: иначе параллельный
      // claim() того же клиента другим пользователем уже успевает удалить
      // строку, и наш delete() падает необработанным P2025.
      const prevPrimary = await tx.clientAssignee.findFirst({ where: { clientId: id, role: 'PRIMARY' } });
      if (prevPrimary?.userId === actorId) return;

      if (prevPrimary) {
        // deleteMany, а не delete: не бросает исключение, если строку уже
        // убрал конкурентный вызов.
        await tx.clientAssignee.deleteMany({ where: { clientId: id, userId: prevPrimary.userId } });
      }

      try {
        await tx.clientAssignee.upsert({
          where: { clientId_userId: { clientId: id, userId: actorId } },
          create: { clientId: id, userId: actorId, role: 'PRIMARY' },
          update: { role: 'PRIMARY' },
        });
      } catch (e) {
        // Партиционный уникальный индекс (ровно один PRIMARY) — сюда попадает
        // только настоящая гонка «двое забрали клиента в одну и ту же миллисекунду».
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new AppException(
            409,
            ErrorCode.CONFLICT_STALE_DATA,
            'Клієнта щойно взяв інший користувач, оновіть сторінку',
          );
        }
        throw e;
      }

      await this.activity.log(
        {
          clientId: id,
          actorId,
          type: 'assignee_changed',
          payload: { action: 'claim', from: prevPrimary?.userId ?? null, to: actorId },
        },
        tx,
      );
      await this.audit.log(
        {
          actorId,
          action: 'client.claim',
          entityType: 'client',
          entityId: id,
          payload: { from: prevPrimary?.userId ?? null, to: actorId },
        },
        tx,
      );
      if (prevPrimary && prevPrimary.userId !== actorId) {
        await this.notifications.notifyUser(
          prevPrimary.userId,
          {
            type: 'client_reassigned',
            title: `Клієнта «${client.displayName}» взято в роботу іншим менеджером`,
            entityType: 'client',
            entityId: id,
            link: `/clients/${id}`,
          },
          tx,
        );
      }
    });

    return this.get(id);
  }

  /** PUT — заміна всього складу відповідальних (FR-2.0). */
  async setAssignees(id: string, dto: AssigneesDto, actorId: string) {
    const client = await this.prisma.client.findFirst({ where: { id, deletedAt: null } });
    if (!client) throw new AppException(404, ErrorCode.NOT_FOUND, 'Клієнта не знайдено');

    const secondaries = [...new Set(dto.secondaryIds ?? [])].filter((u) => u !== dto.primaryId);
    const userIds = [dto.primaryId, ...secondaries];
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } } });
    if (users.length !== userIds.length) {
      throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Один з користувачів не знайдений');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.clientAssignee.deleteMany({ where: { clientId: id } });
      await tx.clientAssignee.create({ data: { clientId: id, userId: dto.primaryId, role: 'PRIMARY' } });
      if (secondaries.length) {
        await tx.clientAssignee.createMany({
          data: secondaries.map((userId) => ({ clientId: id, userId, role: 'SECONDARY' as const })),
        });
      }
      await this.activity.log(
        { clientId: id, actorId, type: 'assignee_changed', payload: { primaryId: dto.primaryId, secondaries } },
        tx,
      );
      await this.audit.log(
        {
          actorId,
          action: 'client.assignees_change',
          entityType: 'client',
          entityId: id,
          payload: { primaryId: dto.primaryId, secondaries },
        },
        tx,
      );
    });

    return this.get(id);
  }

  /** FR-2.8: причина обов'язкова лише коли цього вимагає цільовий статус. */
  async changeStatus(id: string, dto: ChangeStatusDto, actorId: string) {
    const client = await this.prisma.client.findFirst({ where: { id, deletedAt: null } });
    if (!client) throw new AppException(404, ErrorCode.NOT_FOUND, 'Клієнта не знайдено');

    const target = await this.prisma.clientStatus.findUnique({ where: { id: dto.statusId } });
    if (!target) throw new AppException(404, ErrorCode.NOT_FOUND, 'Статус не знайдено');
    if (target.requiresReason && !dto.reasonId) {
      throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Вкажіть причину');
    }

    // Мітки — одразу в payload, а не lookup з фронту по id: стрічка активності
    // (backlog «Деталізація стрічки») має лишатись читабельною, навіть якщо
    // статус чи причину пізніше перейменують або видалять.
    const [fromStatus, reason] = await Promise.all([
      this.prisma.clientStatus.findUnique({ where: { id: client.statusId } }),
      dto.reasonId ? this.prisma.lostReason.findUnique({ where: { id: dto.reasonId } }) : null,
    ]);

    await this.prisma.$transaction(async (tx) => {
      await tx.clientStatusHistory.create({
        data: {
          clientId: id,
          fromId: client.statusId,
          toId: dto.statusId,
          reasonId: dto.reasonId,
          comment: dto.comment,
          userId: actorId,
        },
      });
      await tx.client.update({ where: { id }, data: { statusId: dto.statusId } });
      await this.activity.log(
        {
          clientId: id,
          actorId,
          type: 'status_changed',
          payload: {
            fromId: client.statusId,
            toId: dto.statusId,
            reasonId: dto.reasonId ?? null,
            fromLabel: fromStatus?.label ?? null,
            toLabel: target.label,
            reasonLabel: reason?.label ?? null,
            comment: dto.comment ?? null,
          },
        },
        tx,
      );
      // FR-7.3/FR-8.8: «Скасувати» на фронті — повторний виклик цього ж
      // ендпоінта з попереднім statusId, тож відкат природно лишає другий
      // запис в аудиті без окремої compensating-інфраструктури.
      await this.audit.log(
        {
          actorId,
          action: 'client.status_change',
          entityType: 'client',
          entityId: id,
          payload: { fromId: client.statusId, toId: dto.statusId, reasonId: dto.reasonId ?? null },
        },
        tx,
      );

      // FR-4.1: «зміна статусу мого клієнта» — усім відповідальним, крім того,
      // хто сам змінив статус (не сповіщаємо людину про її власну дію).
      const assignees = await tx.clientAssignee.findMany({ where: { clientId: id }, select: { userId: true } });
      for (const assignee of assignees) {
        if (assignee.userId === actorId) continue;
        await this.notifications.notifyUser(
          assignee.userId,
          {
            type: 'status_changed',
            title: `Статус клієнта «${client.displayName}» змінено на «${target.label}»`,
            entityType: 'client',
            entityId: id,
            link: `/clients/${id}`,
          },
          tx,
        );
      }
    });

    return this.get(id);
  }

  /** FR-2.2.1: фиксация контакта без предварительно поставленной задачи. */
  async contactLog(id: string, dto: ContactLogDto, actorId: string) {
    const client = await this.prisma.client.findFirst({ where: { id, deletedAt: null } });
    if (!client) throw new AppException(404, ErrorCode.NOT_FOUND, 'Клієнта не знайдено');

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          title: 'Зафіксовано контакт',
          type: 'CALL',
          status: 'DONE',
          clientId: id,
          authorId: actorId,
          assigneeId: actorId,
          dueAt: now,
          completedAt: now,
          result: dto.result,
        },
      });
      await this.activity.log(
        { clientId: id, actorId, type: 'contact_logged', entityType: 'task', entityId: task.id, payload: { result: dto.result } },
        tx,
      );
      return task;
    });
  }

  async listActivity(id: string, cursor?: string, limit = 25) {
    const client = await this.prisma.client.findFirst({ where: { id, deletedAt: null } });
    if (!client) throw new AppException(404, ErrorCode.NOT_FOUND, 'Клієнта не знайдено');

    const items = await this.prisma.activityEvent.findMany({
      where: { clientId: id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { actor: { select: { id: true, fullName: true } } },
    });
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    return { items: page, nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null };
  }

  async addContact(clientId: string, dto: ContactDto, actorId: string) {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, deletedAt: null } });
    if (!client) throw new AppException(404, ErrorCode.NOT_FOUND, 'Клієнта не знайдено');
    if (!dto.fullName && !dto.phone && !dto.email) {
      throw new AppException(400, ErrorCode.VALIDATION_FAILED, "Заповніть ПІБ, телефон або email");
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.clientContact.updateMany({ where: { clientId }, data: { isPrimary: false } });
      }
      const contact = await tx.clientContact.create({
        data: { ...dto, clientId, phoneNormalized: normalizePhone(dto.phone) },
      });
      // fullName у payload — стрічка (backlog «Деталізація») інакше не могла б
      // показати, яку саме контактну особу додано: сама подія лише має entityId.
      await this.activity.log(
        { clientId, actorId, type: 'contact_added', entityType: 'contact', entityId: contact.id, payload: { fullName: contact.fullName } },
        tx,
      );
      return contact;
    });
  }

  async updateContact(clientId: string, contactId: string, dto: ContactDto, actorId: string) {
    const contact = await this.prisma.clientContact.findFirst({ where: { id: contactId, clientId } });
    if (!contact) throw new AppException(404, ErrorCode.NOT_FOUND, 'Контакт не знайдено');

    return this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) {
        await tx.clientContact.updateMany({ where: { clientId }, data: { isPrimary: false } });
      }
      const data = { ...dto, ...(dto.phone !== undefined ? { phoneNormalized: normalizePhone(dto.phone) } : {}) };
      const updated = await tx.clientContact.update({ where: { id: contactId }, data });
      const changed = diffChanged(Object.keys(dto), contact as unknown as Record<string, unknown>, data as Record<string, unknown>);
      await this.activity.log(
        {
          clientId,
          actorId,
          type: 'field_changed',
          entityType: 'contact',
          entityId: contactId,
          payload: { changed, fullName: updated.fullName ?? contact.fullName },
        },
        tx,
      );
      return updated;
    });
  }

  async removeContact(clientId: string, contactId: string, actorId: string) {
    const contact = await this.prisma.clientContact.findFirst({ where: { id: contactId, clientId } });
    if (!contact) throw new AppException(404, ErrorCode.NOT_FOUND, 'Контакт не знайдено');

    await this.prisma.clientContact.delete({ where: { id: contactId } });
    await this.activity.log({
      clientId,
      actorId,
      type: 'contact_removed',
      entityType: 'contact',
      entityId: contactId,
      payload: { fullName: contact.fullName },
    });
    return { ok: true };
  }

  /** «Додати тег» з ПКМ (FR-8.1) — idempotent, повторний виклик тим же tagId нічого не ламає. */
  async addTag(clientId: string, dto: AddTagDto, actorId: string) {
    const client = await this.prisma.client.findFirst({ where: { id: clientId, deletedAt: null } });
    if (!client) throw new AppException(404, ErrorCode.NOT_FOUND, 'Клієнта не знайдено');
    const tag = await this.prisma.tag.findUnique({ where: { id: dto.tagId } });
    if (!tag) throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Тег не знайдено');

    await this.prisma.$transaction(async (tx) => {
      await tx.clientTag.upsert({
        where: { clientId_tagId: { clientId, tagId: dto.tagId } },
        create: { clientId, tagId: dto.tagId },
        update: {},
      });
      await this.activity.log({ clientId, actorId, type: 'tag_added', entityType: 'tag', entityId: dto.tagId, payload: { name: tag.name } }, tx);
    });

    return this.get(clientId);
  }

  async removeTag(clientId: string, tagId: string, actorId: string) {
    await this.prisma.clientTag.deleteMany({ where: { clientId, tagId } });
    await this.activity.log({ clientId, actorId, type: 'tag_removed', entityType: 'tag', entityId: tagId });
    return this.get(clientId);
  }

  /**
   * Масові дії над виділенням (FR-2.13, FR-8.3): один і той самий реєстр дій,
   * що й у ПКМ по одному запису (FR-8.4) — тут лише застосування до кожного id.
   * Крутиться поштучно поверх існуючих методів (не одна SQL-транзакція на весь
   * пакет), щоб перевикористати їхню валідацію й побічні ефекти (лента, аудит,
   * сповіщення) без дублювання; часткова невдача не відкатує вже застосоване —
   * викликач бачить, що саме не пройшло, і повторює для решти.
   */
  async bulk(dto: BulkClientsDto, actor: AuthUser) {
    this.validateBulkPayload(dto, actor);

    const failed: Array<{ id: string; error: string }> = [];
    let succeeded = 0;

    for (const id of dto.ids) {
      try {
        await this.applyBulkAction(id, dto, actor.id);
        succeeded += 1;
      } catch (e) {
        if (e instanceof AppException) {
          failed.push({ id, error: e.message });
        } else {
          // Неочікувана помилка (не AppException) — не ховаємо мовчки за
          // generic-повідомленням: інакше системний збій (обрив з'єднання,
          // баг) виглядає в UI як «не пройшла валідація» і не лишає сліду в логах
          this.logger.error({ err: e, clientId: id, action: dto.action }, 'Масова дія: неочікувана помилка на записі');
          failed.push({ id, error: 'Не вдалося виконати дію' });
        }
      }
    }

    return { succeeded, failed };
  }

  private validateBulkPayload(dto: BulkClientsDto, actor: AuthUser): void {
    const requiresUserId = dto.action === 'setPrimary' || dto.action === 'addSecondary' || dto.action === 'removeSecondary';
    // FR-2.13: setPrimary/addSecondary/removeSecondary — це «змінити відповідального»
    // (client:assign), не «оновити картку» (client:update, яким захищений сам
    // ендпоінт) — той самий поділ прав, що й на одиничних /claim, /assignees.
    // Сьогодні у USER й ADMIN обидва права завжди збігаються, але перевірка тут
    // не дає їм розійтися мовчки, якщо матриця прав колись зміниться.
    if (requiresUserId && !can(actor.role, 'client:assign')) {
      throw new AppException(403, ErrorCode.FORBIDDEN, 'Недостатньо прав');
    }
    if (requiresUserId && !dto.userId) {
      throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Вкажіть користувача');
    }
    if (dto.action === 'setStatus' && !dto.statusId) {
      throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Вкажіть статус');
    }
    if (dto.action === 'addTag' && !dto.tagId) {
      throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Вкажіть тег');
    }
  }

  private async applyBulkAction(id: string, dto: BulkClientsDto, actorId: string): Promise<void> {
    switch (dto.action) {
      case 'setStatus':
        await this.changeStatus(id, { statusId: dto.statusId!, reasonId: dto.reasonId, comment: dto.comment }, actorId);
        return;
      case 'addTag':
        await this.addTag(id, { tagId: dto.tagId! }, actorId);
        return;
      case 'setPrimary': {
        // FR-2.13: заміняє лише PRIMARY, SECONDARY лишаються як були
        const secondaries = await this.prisma.clientAssignee.findMany({
          where: { clientId: id, role: 'SECONDARY' },
          select: { userId: true },
        });
        await this.setAssignees(id, { primaryId: dto.userId!, secondaryIds: secondaries.map((s) => s.userId) }, actorId);
        return;
      }
      case 'addSecondary': {
        const client = await this.prisma.client.findFirst({ where: { id, deletedAt: null } });
        if (!client) throw new AppException(404, ErrorCode.NOT_FOUND, 'Клієнта не знайдено');
        // upsert: якщо userId вже PRIMARY — роль не чіпаємо, немає сенсу «підвищувати до помічника»
        await this.prisma.clientAssignee.upsert({
          where: { clientId_userId: { clientId: id, userId: dto.userId! } },
          create: { clientId: id, userId: dto.userId!, role: 'SECONDARY' },
          update: {},
        });
        await this.activity.log({ clientId: id, actorId, type: 'assignee_changed', payload: { action: 'addSecondary', userId: dto.userId } });
        return;
      }
      case 'removeSecondary': {
        await this.prisma.clientAssignee.deleteMany({ where: { clientId: id, userId: dto.userId!, role: 'SECONDARY' } });
        await this.activity.log({ clientId: id, actorId, type: 'assignee_changed', payload: { action: 'removeSecondary', userId: dto.userId } });
        return;
      }
    }
  }
}
