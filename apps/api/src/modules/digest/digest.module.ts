import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { DigestService } from './digest.service';
import { OverdueTasksService } from './overdue-tasks.service';

@Module({
  imports: [NotificationsModule],
  providers: [DigestService, OverdueTasksService],
})
export class DigestModule {}
