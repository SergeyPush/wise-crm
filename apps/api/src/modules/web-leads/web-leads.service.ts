import { Injectable, Logger } from '@nestjs/common';
import { ClientType, Prisma, TaxSystem } from '@prisma/client';
import { timingSafeEqual } from 'node:crypto';
import { ErrorCode } from 'shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/app.exception';
import { PaginationQueryDto, paginated } from '../../common/dto/pagination.dto';
import { normalizePhone } from '../../common/utils/phone.util';
import { endOfKyivDay } from '../../common/utils/calendar.util';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { isVatPayerFlag, mapWebFormValue, stringField, toBool, toInt } from './web-form-mapping.util';

const MAX_BODY_BYTES = 16 * 1024; // FR-W1
const HONEYPOT_FIELD = 'website'; // имя должно совпадать с приховане полем на сайті

const TYPE_LABELS: Record<string, string> = {
  COMPANY: 'ТОВ',
  FOP: 'ФОП',
  PERSON: 'Фізособа',
  OTHER: 'Інше',
};

type SubmissionMeta = {
  token?: string;
  expectedToken?: string;
  sourceIp?: string;
  bodyBytes: number;
};

/** Сравнение секрета без утечки по времени: `!==` быстрее «расходится» на несовпадающих байтах. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * FR-W1–W9. Единственный автоматический источник данных в системе после
 * отмены импорта — относиться нужно соответственно: ответ всегда 200,
 * а любая внутренняя ошибка попадает в `WebLead.error`, а не роняет заявку.
 */
@Injectable()
export class WebLeadsService {
  private readonly logger = new Logger(WebLeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  async handlePublicSubmission(body: Record<string, unknown>, meta: SubmissionMeta): Promise<void> {
    // FR-W1: без правильного секрета — тиша, у БД жодного сліду. Заголовок
    // недоступний чужому origin, а лічильник спроб ловить rate limit контролера.
    if (!meta.expectedToken || !meta.token || !safeEqual(meta.token, meta.expectedToken)) return;
    if (meta.bodyBytes > MAX_BODY_BYTES) return;
    if (typeof body[HONEYPOT_FIELD] === 'string' && body[HONEYPOT_FIELD] !== '') return;

    const isTest = body.test === true; // FR-W8: синтетична перевірка живості
    const webLead = await this.prisma.webLead.create({
      data: { rawPayload: body as Prisma.InputJsonValue, sourceIp: meta.sourceIp, isTest },
    });

    if (isTest) return; // зберігається, але клієнта не створює і в пул не потрапляє

    try {
      await this.process(webLead.id, body);
    } catch (err) {
      this.logger.error({ err, webLeadId: webLead.id }, 'Не вдалося обробити заявку з сайту');
      await this.prisma.webLead.update({
        where: { id: webLead.id },
        data: { error: err instanceof Error ? err.message : 'Невідома помилка обробки' },
      });
    }
  }

  /** Повторна обробка впалої заявки (FR-W9) — тим самим шляхом, вручну адміном. */
  async reprocess(id: string) {
    const webLead = await this.prisma.webLead.findUnique({ where: { id } });
    if (!webLead) throw new AppException(404, ErrorCode.NOT_FOUND, 'Заявку не знайдено');
    if (webLead.clientId) {
      throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Заявка вже оброблена');
    }
    await this.prisma.webLead.update({ where: { id }, data: { error: null } });
    await this.process(id, webLead.rawPayload as Record<string, unknown>);
    return this.prisma.webLead.findUnique({ where: { id } });
  }

  async list(q: PaginationQueryDto) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.webLead.findMany({
        orderBy: { receivedAt: 'desc' },
        skip: q.skip,
        take: q.limit,
        include: { client: { select: { id: true, displayName: true } } },
      }),
      this.prisma.webLead.count(),
    ]);
    return paginated(items, total, q);
  }

  private async process(webLeadId: string, body: Record<string, unknown>): Promise<void> {
    const phone = stringField(body.phone);
    const email = stringField(body.email)?.toLowerCase();
    const phoneNormalized = normalizePhone(phone);

    if (!phoneNormalized && !email) {
      await this.prisma.webLead.update({
        where: { id: webLeadId },
        data: { processedAt: new Date(), error: 'Немає телефону чи email — неможливо визначити контакт' },
      });
      return;
    }

    // FR-W6: без сериализации по контакту два одновременных сабмита с одним
    // и тем же номером/поштою (двойной клик, ретрай сайта) могут оба не найти
    // существующего клиента и создать два — advisory-lock на ключ контакта
    // ставит вторую транзакцию в очередь до коммита первой.
    const lockKey = phoneNormalized ?? (email as string);
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`;

      const existing = await tx.client.findFirst({
        where: {
          deletedAt: null,
          contacts: {
            some: {
              OR: [
                ...(phoneNormalized ? [{ phoneNormalized }] : []),
                ...(email ? [{ email }] : []),
              ],
            },
          },
        },
        include: { assignees: { where: { role: 'PRIMARY' } } },
      });

      if (existing) {
        await this.handleRepeat(
          tx,
          existing.id,
          existing.displayName,
          existing.assignees[0]?.userId ?? null,
          webLeadId,
          body,
        );
        return null;
      }

      return this.createLead(tx, webLeadId, body, { phone, email, phoneNormalized });
    });

    if (created) {
      // FR-W5: заявка нікому не назначена — сповіщаються всі активні. Поза
      // транзакцією: якщо розсилка впаде, це не повинно відкочувати клієнта.
      await this.notifications.notifyAllActive({
        type: 'web_lead',
        title: `Нова заявка з сайту: ${created.displayName}`,
        entityType: 'client',
        entityId: created.clientId,
        link: `/clients/${created.clientId}`,
      });
    }
  }

  /** FR-W6: повторне звернення тієї ж людини не створює другу картку. */
  private async handleRepeat(
    tx: Prisma.TransactionClient,
    clientId: string,
    displayName: string,
    primaryUserId: string | null,
    webLeadId: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    await tx.webLead.update({
      where: { id: webLeadId },
      data: { clientId, isDuplicate: true, processedAt: new Date() },
    });
    await this.activity.log(
      { clientId, actorId: null, type: 'web_lead_duplicate', payload: body as Prisma.InputJsonValue },
      tx,
    );

    const hasOpenCall = await tx.task.findFirst({
      where: { clientId, type: 'CALL', status: { in: ['OPEN', 'IN_PROGRESS'] }, deletedAt: null },
    });
    if (!hasOpenCall) {
      await tx.task.create({
        data: {
          title: 'Подзвонити за заявкою',
          type: 'CALL',
          clientId,
          assigneeId: primaryUserId,
          dueAt: endOfKyivDay(),
        },
      });
    }

    if (primaryUserId) {
      await this.notifications.notifyUser(
        primaryUserId,
        {
          type: 'web_lead_repeat',
          title: `Повторне звернення: ${displayName}`,
          entityType: 'client',
          entityId: clientId,
          link: `/clients/${clientId}`,
        },
        tx,
      );
    }
    // Якщо відповідального немає — лід і так підніметься нагору пулу:
    // сортування пулу йде по lastActivityAt, а log() вище його вже оновив.
  }

  private async createLead(
    tx: Prisma.TransactionClient,
    webLeadId: string,
    body: Record<string, unknown>,
    contact: { phone?: string; email?: string; phoneNormalized: string | null },
  ): Promise<{ clientId: string; displayName: string }> {
    const defaultStatus = await tx.clientStatus.findFirst({ where: { isDefaultForNew: true } });
    const websiteSource = await tx.leadSource.findFirst({ where: { isSystem: true } });
    if (!defaultStatus || !websiteSource) {
      throw new Error('Не налаштовано стартовий статус клієнта або системне джерело "Сайт"');
    }

    const unmapped: Array<{ field: string; rawValue: string }> = [];
    const [type, taxSystem, businessTypesRaw, diyaCityRaw] = await Promise.all([
      this.mapKnownField(tx, 'OrganisationalForm', body.OrganisationalForm, unmapped),
      this.mapKnownField(tx, 'TaxSystem', body.TaxSystem, unmapped),
      // Мультиселект на сайті: formatData() склеює вибрані варіанти через ', ' —
      // мапити треба токен за токеном, інакше кожна комбінація потребувала б
      // окремого рядка в WebFormMapping.
      this.mapMultiValueField(tx, 'OrganizationalType', body.OrganizationalType, unmapped),
      // FR-W4: раніше isDiiaCity рахувався напряму з body.DiyaCity через toBool(),
      // а сайт шле коди 'startup'/'general_resident' — жоден з них не збігався
      // з очікуваними рядками ('так'/'yes'/...), тому прапорець завжди був false.
      // Тепер іде тим самим шляхом мапінгу, що й решта полів (спостережуваність
      // невідомих значень безкоштовно додається).
      this.mapKnownField(tx, 'DiyaCity', body.DiyaCity, unmapped),
    ]);

    const name = stringField(body.name);
    const displayName =
      name ?? this.buildDisplayName(type, contact.phone ?? contact.phoneNormalized ?? undefined, contact.email);
    const question = stringField(body.question);

    const client = await tx.client.create({
      data: {
        displayName,
        needsQualification: !name, // FR-W3
        type: (type ?? 'OTHER') as ClientType,
        taxSystem: taxSystem as TaxSystem | null,
        isVatPayer: isVatPayerFlag(body.AdditionalInfo),
        employeeCount: toInt(body.NumberOfEmployees),
        documentsPerMonth: toInt(body.DocumentQuantity),
        isDiiaCity: toBool(diyaCityRaw ?? undefined),
        businessTypes: businessTypesRaw ? businessTypesRaw.split(',').map((s) => s.trim()).filter(Boolean) : [],
        statusId: defaultStatus.id,
        sourceId: websiteSource.id, // FR-W5: джерело ставить система, не форма
        contacts: {
          create: {
            phone: contact.phone,
            phoneNormalized: contact.phoneNormalized,
            email: contact.email,
            isPrimary: true,
          },
        },
      },
    });

    await tx.webLead.update({
      where: { id: webLeadId },
      data: {
        clientId: client.id,
        processedAt: new Date(),
        error: unmapped.length
          ? unmapped.map((u) => `не вдалося розпізнати \`${u.field}\`: ${u.rawValue}`).join('; ')
          : null,
      },
    });

    // FR-W5: задача на сьогодні, без виконавця — піде разом з лідом тому, хто його візьме
    await tx.task.create({
      data: {
        title: 'Подзвонити за заявкою',
        type: 'CALL',
        clientId: client.id,
        assigneeId: null,
        dueAt: endOfKyivDay(),
        sourceKey: `web-lead:${webLeadId}`,
      },
    });

    if (question) {
      await tx.comment.create({
        data: { entityType: 'client', entityId: client.id, clientId: client.id, body: question },
      });
    }

    await this.activity.log(
      { clientId: client.id, actorId: null, type: 'web_lead', payload: body as Prisma.InputJsonValue },
      tx,
    );
    for (const u of unmapped) {
      await this.activity.log(
        {
          clientId: client.id,
          actorId: null,
          type: 'web_lead_unmapped_field',
          payload: { field: u.field, rawValue: u.rawValue },
        },
        tx,
      );
    }

    return { clientId: client.id, displayName };
  }

  private async mapKnownField(
    tx: Prisma.TransactionClient,
    field: string,
    rawValue: unknown,
    unmapped: Array<{ field: string; rawValue: string }>,
  ): Promise<string | null> {
    const raw = stringField(rawValue);
    if (!raw) return null; // поле не заповнене формою — не помилка
    const mapped = await mapWebFormValue(tx, field, raw);
    if (!mapped) unmapped.push({ field, rawValue: raw }); // FR-W2: значення невідоме, заявка не падає
    return mapped;
  }

  /**
   * FR-W4: для мультиселектів сайту (formatData() склеює вибрані варіанти
   * через ', '). Кожен токен мапиться окремо — комбінація «Продажі,
   * Виробництво» інакше довелось би заводити як свій рядок у WebFormMapping.
   * Немаплені токени йдуть в `unmapped` поштучно, а не всією рядком.
   */
  private async mapMultiValueField(
    tx: Prisma.TransactionClient,
    field: string,
    rawValue: unknown,
    unmapped: Array<{ field: string; rawValue: string }>,
  ): Promise<string | null> {
    const raw = stringField(rawValue);
    if (!raw) return null;
    const tokens = raw.split(',').map((s) => s.trim()).filter(Boolean);
    const mappedTokens: string[] = [];
    for (const token of tokens) {
      const mapped = await mapWebFormValue(tx, field, token);
      if (mapped) mappedTokens.push(mapped);
      else unmapped.push({ field, rawValue: token });
    }
    return mappedTokens.length ? mappedTokens.join(', ') : null;
  }

  private buildDisplayName(type: string | null, phone?: string, email?: string): string {
    const label = (type && TYPE_LABELS[type]) || 'Лід';
    if (phone) return `${label} · ${phone}`;
    if (email) return `${label} · ${email.split('@')[0]}`;
    return label;
  }
}
