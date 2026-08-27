import { Module } from '@nestjs/common';
import { TelegramDeliveryService } from './telegram-delivery.service';
import { TelegramWebhookController } from './telegram-webhook.controller';
import { TelegramService } from './telegram.service';

@Module({
  controllers: [TelegramWebhookController],
  providers: [TelegramService, TelegramDeliveryService],
  exports: [TelegramService],
})
export class TelegramModule {}
