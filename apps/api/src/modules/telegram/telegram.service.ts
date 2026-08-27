import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { Telegraf } from 'telegraf';
import type { Update } from 'telegraf/types';
import { PrismaService } from '../../prisma/prisma.service';

const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

/**
 * FR-4.2: підключення бере користувач сам, з профілю, через діплінк
 * (`/start <токен>` у Telegram) — без пароля й OAuth. Токен живе в пам'яті
 * процесу: короткоживучий, некритичний для аудиту (на відміну від скидання
 * пароля — там окрема таблиця `PasswordResetToken`), рестарт просто вимагає
 * згенерувати нове посилання.
 *
 * Без `TELEGRAM_BOT_TOKEN` канал вимкнений цілком — це не помилка конфігурації
 * для дев-оточення й тестів, а стан «зовнішній канал не підключено».
 */
@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  private bot: Telegraf | null = null;
  private botUsername: string | null = null;
  private readonly linkTokens = new Map<string, { userId: string; expiresAt: number }>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN не задано — Telegram-канал вимкнено');
      return;
    }
    const bot = new Telegraf(token);
    bot.start(async (ctx) => {
      const chatId = String(ctx.chat.id);
      const ok = await this.consumeLinkToken(ctx.startPayload, chatId);
      await ctx.reply(
        ok
          ? 'Готово! Сповіщення з WiseCRM тепер приходитимуть сюди.'
          : 'Посилання недійсне або застаріло. Згенеруйте нове в профілі CRM.',
      );
    });
    this.bot = bot;

    try {
      this.botUsername = (await bot.telegram.getMe()).username;
    } catch (err) {
      this.logger.error({ err }, 'Не вдалося отримати профіль бота (getMe) — перевірте токен');
      return;
    }

    await this.registerWebhook(bot);
  }

  /**
   * Без setWebhook Telegram нікуди не надсилає апдейти — /telegram/webhook
   * стоїть, але порожній, і діплінк /start (FR-4.2) мовчки не працює.
   * На localhost реєстрація очікувано провалиться (Telegram вимагає публічний
   * HTTPS) — це нормальний стан дев-оточення, не привід валити старт застосунку.
   */
  private async registerWebhook(bot: Telegraf): Promise<void> {
    const secret = this.config.get<string>('TELEGRAM_WEBHOOK_SECRET');
    const appUrl = this.config.get<string>('APP_URL');
    if (!secret) {
      this.logger.warn('TELEGRAM_WEBHOOK_SECRET не задано — вихідні сповіщення працюють, /start діплінк — ні');
      return;
    }
    try {
      await bot.telegram.setWebhook(`${appUrl}/api/v1/telegram/webhook`, { secret_token: secret });
      this.logger.log(`Telegram webhook зареєстровано: ${appUrl}/api/v1/telegram/webhook`);
    } catch (err) {
      this.logger.warn({ err }, 'Не вдалося зареєструвати Telegram webhook (очікувано на localhost)');
    }
  }

  get isEnabled(): boolean {
    return this.bot !== null && this.botUsername !== null;
  }

  /** FR-4.2: посилання для профілю, одноразове, 15 хв на використання. */
  createLinkToken(userId: string): string | null {
    if (!this.bot || !this.botUsername) return null;
    const token = randomBytes(16).toString('hex');
    this.linkTokens.set(token, { userId, expiresAt: Date.now() + LINK_TOKEN_TTL_MS });
    return `https://t.me/${this.botUsername}?start=${token}`;
  }

  private async consumeLinkToken(token: string | undefined, chatId: string): Promise<boolean> {
    const entry = token ? this.linkTokens.get(token) : undefined;
    if (!entry || entry.expiresAt < Date.now()) return false;
    this.linkTokens.delete(token as string);
    await this.prisma.user.update({
      where: { id: entry.userId },
      data: { telegramChatId: chatId, telegramEnabled: true },
    });
    return true;
  }

  async handleUpdate(update: Update): Promise<void> {
    await this.bot?.handleUpdate(update);
  }

  /** FR-4.4: кнопка «Надіслати тестове сповіщення» в профілі. */
  async sendTestMessage(chatId: string): Promise<void> {
    await this.send(chatId, 'Тестове сповіщення з WiseCRM. Якщо ви це бачите — все працює.');
  }

  async send(chatId: string, text: string): Promise<void> {
    if (!this.bot) throw new Error('Telegram-бот вимкнено (немає TELEGRAM_BOT_TOKEN)');
    await this.bot.telegram.sendMessage(chatId, text);
  }
}
