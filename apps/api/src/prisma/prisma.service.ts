import { INestApplication, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ log: [{ emit: 'event', level: 'warn' }, { emit: 'event', level: 'error' }] });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma підключено');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Graceful shutdown (NFR-12): соединение закрывается до выхода процесса. */
  enableShutdownHooks(app: INestApplication): void {
    process.on('beforeExit', () => {
      void app.close();
    });
  }

  /**
   * Полная очистка между API-тестами (09-implementation-plan.md, раздел 5.2).
   * Справочники сидируются один раз, поэтому таблицы-справочники пропускаются.
   */
  async truncateAll(keep: string[] = []): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('truncateAll заборонено у production');
    }
    const rows = await this.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
    `;
    const tables = rows.map((r) => r.tablename).filter((t) => !keep.includes(t));
    if (!tables.length) return;
    const list = tables.map((t) => `"public"."${t}"`).join(', ');
    await this.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  }
}
