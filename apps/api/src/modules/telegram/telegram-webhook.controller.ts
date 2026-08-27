import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Update } from 'telegraf/types';
import { Public } from '../../common/decorators/public.decorator';
import { TelegramService } from './telegram.service';

/** Публічний ендпоінт: Telegram довіряється лише заголовку secret_token, не сесії. */
@ApiExcludeController()
@Controller('telegram')
export class TelegramWebhookController {
  constructor(
    private readonly telegram: TelegramService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('webhook')
  async webhook(
    @Body() update: Update,
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
  ) {
    const expected = this.config.get<string>('TELEGRAM_WEBHOOK_SECRET');
    // Тихо ігноруємо замість 403 — зловмиснику не варто підказувати, що ендпоінт існує.
    if (expected && secret === expected) {
      await this.telegram.handleUpdate(update);
    }
    return { ok: true };
  }
}
