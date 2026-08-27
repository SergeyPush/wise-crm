import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from './storage.service';
import { AlertsService } from '../../common/alerts/alerts.service';

const RETENTION_DAYS = 30; // FR-F12.1

/**
 * FR-F12.1: фізичне видалення через 30 днів після м'якого стирає файл на
 * диску безусловно (кожне вкладення — свій файл, refCount — тільки з
 * дедуплікацією у v1.1). Рядок Attachment лишається — це історія, зникає диск.
 */
@Injectable()
export class FilesCleanupService {
  private readonly logger = new Logger(FilesCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly alerts: AlertsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purgeOldFiles(): Promise<void> {
    await this.alerts.guardJob('files.purgeOldFiles', () => this.doPurgeOldFiles());
  }

  private async doPurgeOldFiles(): Promise<void> {
    const threshold = new Date(Date.now() - RETENTION_DAYS * 24 * 3_600_000);
    const rows = await this.prisma.attachment.findMany({
      where: { deletedAt: { lte: threshold } },
      select: { id: true, storageKey: true },
    });
    for (const row of rows) {
      await this.storage.remove(row.storageKey);
    }
    if (rows.length) this.logger.log(`Фізично видалено файлів: ${rows.length}`);
  }
}
