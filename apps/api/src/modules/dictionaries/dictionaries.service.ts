import { Injectable } from '@nestjs/common';
import { ErrorCode } from 'shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/app.exception';
import { UpsertDictionaryEntryDto } from './dto/dictionary.dto';

export const DICTIONARY_KINDS = [
  'lead-sources',
  'lost-reasons',
  'tags',
  'statuses',
  'task-types',
  'document-categories',
] as const;
export type DictionaryKind = (typeof DICTIONARY_KINDS)[number];

/** Чотири з шести довідників створюються й редагуються через інтерфейс (розділ 3 плану + беклог 28.08.2026). */
const CREATABLE_KINDS = ['lead-sources', 'lost-reasons', 'tags', 'statuses'] as const;
type CreatableKind = (typeof CREATABLE_KINDS)[number];

const UPDATABLE_KINDS = CREATABLE_KINDS;
type UpdatableKind = (typeof UPDATABLE_KINDS)[number];

function assertCreatable(kind: string): asserts kind is CreatableKind {
  if (!(CREATABLE_KINDS as readonly string[]).includes(kind)) {
    throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Цей довідник редагується тільки міграцією');
  }
}

function assertUpdatable(kind: string): asserts kind is UpdatableKind {
  if (!(UPDATABLE_KINDS as readonly string[]).includes(kind)) {
    throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Цей довідник редагується тільки міграцією');
  }
}

@Injectable()
export class DictionariesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(kind: string) {
    switch (kind as DictionaryKind) {
      case 'lead-sources':
        return this.prisma.leadSource.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
      case 'lost-reasons':
        return this.prisma.lostReason.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
      case 'tags':
        return this.prisma.tag.findMany({ orderBy: { name: 'asc' } });
      case 'statuses':
        return this.prisma.clientStatus.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
      case 'task-types':
        return this.prisma.taskTypeRef.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
      case 'document-categories':
        return this.prisma.documentCategory.findMany({
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        });
      default:
        throw new AppException(404, ErrorCode.NOT_FOUND, 'Невідомий довідник');
    }
  }

  async create(kind: string, dto: UpsertDictionaryEntryDto) {
    assertCreatable(kind);
    if (kind === 'tags') {
      if (!dto.name) throw new AppException(400, ErrorCode.VALIDATION_FAILED, "Поле «name» обов'язкове");
      return this.prisma.tag.create({ data: { name: dto.name, color: dto.color ?? 'gray' } });
    }
    if (kind === 'statuses') {
      if (!dto.code || !dto.label || !dto.stage) {
        throw new AppException(400, ErrorCode.VALIDATION_FAILED, "Поля «code», «label» і «stage» обов'язкові");
      }
      // isTerminal/requiresReason/isDefaultForNew — свідомо відсутні в DTO
      // (беклог 28.08.2026): це критичні для логіки поля (dashboard.service.ts,
      // web-leads.service.ts), і ValidationPipe (forbidNonWhitelisted, main.ts)
      // відхилить запит 400-ю, якщо їх все ж надіслати. Нові статуси завжди
      // отримують безпечні дефолти зі схеми — false/false/false.
      return this.prisma.clientStatus.create({
        data: {
          code: dto.code,
          label: dto.label,
          stage: dto.stage,
          color: dto.color ?? 'gray',
          // Без явного sortOrder — у кінець списку, а не 0 (щоб новий статус не
          // вискочив на початок переліку переходів на картці клієнта).
          sortOrder: dto.sortOrder ?? (await this.nextStatusSortOrder()),
        },
      });
    }
    if (!dto.code || !dto.label) {
      throw new AppException(400, ErrorCode.VALIDATION_FAILED, "Поля «code» і «label» обов'язкові");
    }
    const data = { code: dto.code, label: dto.label, sortOrder: dto.sortOrder ?? 0 };
    return kind === 'lead-sources'
      ? this.prisma.leadSource.create({ data })
      : this.prisma.lostReason.create({ data });
  }

  private async nextStatusSortOrder(): Promise<number> {
    const last = await this.prisma.clientStatus.aggregate({ _max: { sortOrder: true } });
    return (last._max.sortOrder ?? 0) + 1;
  }

  async update(kind: string, id: string, dto: UpsertDictionaryEntryDto) {
    assertUpdatable(kind);
    if (kind === 'tags') {
      const tag = await this.prisma.tag.findUnique({ where: { id } });
      if (!tag) throw new AppException(404, ErrorCode.NOT_FOUND, 'Тег не знайдено');
      return this.prisma.tag.update({ where: { id }, data: { name: dto.name, color: dto.color } });
    }
    if (kind === 'statuses') {
      const status = await this.prisma.clientStatus.findUnique({ where: { id } });
      if (!status) throw new AppException(404, ErrorCode.NOT_FOUND, 'Статус не знайдено');
      // code/stage/isTerminal/requiresReason/isDefaultForNew/isActive критичні
      // для логіки воронки й хардкод-пошуків (dashboard.service.ts:
      // code === 'PROPOSAL_SENT', web-leads.service.ts: isDefaultForNew) —
      // з UI можна міняти лише те, що не читає бекенд-логіка: назву, колір, порядок.
      return this.prisma.clientStatus.update({
        where: { id },
        data: {
          label: dto.label ?? status.label,
          color: dto.color ?? status.color,
          sortOrder: dto.sortOrder ?? status.sortOrder,
        },
      });
    }

    const model = kind === 'lead-sources' ? this.prisma.leadSource : this.prisma.lostReason;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (model as any).findUnique({ where: { id } });
    if (!row) throw new AppException(404, ErrorCode.NOT_FOUND, 'Запис не знайдено');
    // «Сайт» проставляється автоматично на кожній заявці (FR-W5) — вимкнути
    // джерело, на яке спирається публічний ендпоінт, означає зламати прийом заявок.
    if (row.isSystem && dto.isActive === false) {
      throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Системне джерело не можна деактивувати');
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (model as any).update({
      where: { id },
      data: { code: dto.code, label: dto.label, sortOrder: dto.sortOrder, isActive: dto.isActive },
    });
  }
}
