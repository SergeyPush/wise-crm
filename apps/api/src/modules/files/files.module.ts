import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FilesCleanupService } from './files-cleanup.service';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { StorageService } from './storage.service';

@Module({
  // AuditService приходит из глобального AuditModule (см. app.module.ts)
  imports: [ActivityModule, NotificationsModule],
  controllers: [FilesController],
  providers: [FilesService, StorageService, FilesCleanupService],
})
export class FilesModule {}
