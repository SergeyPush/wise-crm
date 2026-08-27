import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { DigestService } from './digest.service';
import { OverdueTasksService } from './overdue-tasks.service';

@Module({
  imports: [NotificationsModule],
  providers: [DigestService, OverdueTasksService],
  // Потрібен MeModule (кнопка «Надіслати зараз» у профілі, backlog 27.08.2026)
  exports: [DigestService],
})
export class DigestModule {}
