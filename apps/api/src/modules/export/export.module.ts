import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { TelegramModule } from '../telegram/telegram.module';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

@Module({
  // AuditService приходит из глобального AuditModule (см. app.module.ts)
  imports: [NotificationsModule, TelegramModule],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
