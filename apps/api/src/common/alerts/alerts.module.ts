import { Global, Module } from '@nestjs/common';
import { TelegramModule } from '../../modules/telegram/telegram.module';
import { AlertsService } from './alerts.service';

// @Global(), як PrismaModule/AuditModule: алерти потрібні і фільтру винятків,
// і фоновим джобам у декількох модулях — тягнути імпорт скрізь сенсу нема.
@Global()
@Module({
  imports: [TelegramModule],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
