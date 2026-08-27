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

/** Три из шести справочников редактируются через интерфейс (раздел 3 плана). */
const EDITABLE_KINDS = ['lead-sources', 'lost-reasons', 'tags'] as const;
type EditableKind = (typeof EDITABLE_KINDS)[number];

function assertEditable(kind: string): asserts kind is EditableKind {
  if (!(EDITABLE_KINDS as readonly string[]).includes(kind)) {
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
    assertEditable(kind);
    if (kind === 'tags') {
      if (!dto.name) throw new AppException(400, ErrorCode.VALIDATION_FAILED, "Поле «name» обов'язкове");
      return this.prisma.tag.create({ data: { name: dto.name, color: dto.color ?? 'gray' } });
    }
    if (!dto.code || !dto.label) {
      throw new AppException(400, ErrorCode.VALIDATION_FAILED, "Поля «code» і «label» обов'язкові");
    }
    const data = { code: dto.code, label: dto.label, sortOrder: dto.sortOrder ?? 0 };
    return kind === 'lead-sources'
      ? this.prisma.leadSource.create({ data })
      : this.prisma.lostReason.create({ data });
  }

  async update(kind: string, id: string, dto: UpsertDictionaryEntryDto) {
    assertEditable(kind);
    if (kind === 'tags') {
      const tag = await this.prisma.tag.findUnique({ where: { id } });
      if (!tag) throw new AppException(404, ErrorCode.NOT_FOUND, 'Тег не знайдено');
      return this.prisma.tag.update({ where: { id }, data: { name: dto.name, color: dto.color } });
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
