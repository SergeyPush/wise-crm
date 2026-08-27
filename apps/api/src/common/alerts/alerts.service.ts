import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramService } from '../../modules/telegram/telegram.service';

// NFR-32.1: без вікна одна й та сама помилка 5xx засипле Telegram-групу за хвилину
const DEFAULT_DEDUP_WINDOW_MS = 15 * 60_000;

/**
 * Єдина точка ескалації в Telegram-групу моніторингу (NFR-31.4, NFR-32, NFR-33).
 * Це окремий чат від `telegramChatId` користувачів — `ALERT_TELEGRAM_CHAT_ID`
 * з `.env`, той самий, що вже використовує `ExportService` для FR-E6.
 *
 * Без каналу (немає `ALERT_TELEGRAM_CHAT_ID` або бот вимкнено) метод тихо
 * нічого не шле — подія все одно лишається в логах, це і є друга лінія.
 */
@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);
  // Ключ алерту → час останньої відправки. Живе в пам'яті процесу: рестарт
  // просто скидає дедуплікацію, це прийнятно для сповіщень, а не для аудиту.
  private readonly lastFiredAt = new Map<string, number>();

  constructor(
    private readonly config: ConfigService,
    private readonly telegram: TelegramService,
  ) {}

  /** Шле повідомлення за ключем не частіше, ніж раз на dedup-вікно (NFR-32.1). */
  async fire(key: string, message: string): Promise<void> {
    const now = Date.now();
    const last = this.lastFiredAt.get(key);
    if (last !== undefined && now - last < DEFAULT_DEDUP_WINDOW_MS) return; // придушено дедуплікацією, у лог не дублюємо

    this.lastFiredAt.set(key, now);
    const chatId = this.config.get<string>('ALERT_TELEGRAM_CHAT_ID');
    if (!chatId || !this.telegram.isEnabled) return;
    await this.telegram.send(chatId, message).catch((err: unknown) => {
      this.logger.error({ err }, 'Не вдалося надіслати алерт у Telegram');
    });
  }

  /**
   * NFR-31.4: падіння фонової джоби (крону) не повинно тихо загубитись у
   * unhandledRejection — обгортка ловить, логує і шле алерт одним ключем на джобу.
   */
  async guardJob(jobName: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      // NFR-31.1: лише повідомлення помилки, без тіла/даних, що могли в ній опинитись
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.error({ err, job: jobName }, `Фонова задача впала: ${jobName}`);
      await this.fire(`job:${jobName}`, `🔴 Впала фонова задача «${jobName}»: ${detail}`);
    }
  }
}
