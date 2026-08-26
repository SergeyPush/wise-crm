import { Injectable } from '@nestjs/common';
import { ErrorCode } from 'shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/app.exception';

export const DICTIONARY_KINDS = [
  'lead-sources',
  'lost-reasons',
  'tags',
  'statuses',
  'task-types',
  'document-categories',
] as const;
export type DictionaryKind = (typeof DICTIONARY_KINDS)[number];

/**
 * Только чтение (раздел 1 плана). Три из шести — редактируемые справочники
 * (`lead-sources`, `lost-reasons`, `tags`), но экран и `POST`/`PATCH` — этап 4.
 */
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
}
