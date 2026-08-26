import { Module } from '@nestjs/common';
import { PublicLeadsController } from './public-leads.controller';
import { WebLeadsController } from './web-leads.controller';
import { WebLeadsService } from './web-leads.service';
import { ActivityModule } from '../activity/activity.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ActivityModule, NotificationsModule],
  controllers: [PublicLeadsController, WebLeadsController],
  providers: [WebLeadsService],
})
export class WebLeadsModule {}
