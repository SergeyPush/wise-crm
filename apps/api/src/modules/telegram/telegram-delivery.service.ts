import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramService } from './telegram.service';
import { AlertsService } from '../../common/alerts/alerts.service';

const MAX_ATTEMPTS = 5;
const BACKOFF_MINUTES = 5; // лінійний бекоф: 5, 10, 15... хвилин між спробами

/**
 * Outbox-процесор (05-files-and-notifications.md, п. 2.5): відправка у
 * зовнішній канал ніколи не йде з HTTP-запиту, який породив подію — тут
 * єдине місце, де `NotificationDelivery.status` рухається PENDING → SENT/FAILED.
 */
@Injectable()
export class TelegramDeliveryService {
  private readonly logger = new Logger(TelegramDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
    private readonly config: ConfigService,
    private readonly alerts: AlertsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processPending(): Promise<void> {
    await this.alerts.guardJob('telegram.processPending', () => this.doProcessPending());
  }

  private async doProcessPending(): Promise<void> {
    if (!this.telegram.isEnabled) return;

    const deliveries = await this.prisma.notificationDelivery.findMany({
      where: { channel: 'TELEGRAM', status: 'PENDING', scheduledAt: { lte: new Date() } },
      include: { notification: { include: { user: { select: { telegramChatId: true } } } } },
      take: 50,
    });

    for (const delivery of deliveries) {
      const chatId = delivery.notification.user.telegramChatId;
      if (!chatId) {
        // Користувач від'єднав Telegram між постановкою в чергу і відправкою.
        await this.prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: { status: 'FAILED', lastError: 'Telegram відключено користувачем' },
        });
        continue;
      }

      try {
        await this.telegram.send(chatId, this.renderText(delivery.notification));
        await this.prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: { status: 'SENT', sentAt: new Date(), attempts: { increment: 1 } },
        });
      } catch (err) {
        const attempts = delivery.attempts + 1;
        const failed = attempts >= MAX_ATTEMPTS;
        await this.prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            attempts,
            lastError: err instanceof Error ? err.message : String(err),
            status: failed ? 'FAILED' : 'PENDING',
            scheduledAt: failed ? undefined : new Date(Date.now() + attempts * BACKOFF_MINUTES * 60_000),
          },
        });
        this.logger.warn({ err, deliveryId: delivery.id, attempts }, 'Не вдалося відправити Telegram-сповіщення');
      }
    }
  }

  /** FR-4.6: тільки тип події, displayName (уже в title/body) і посилання — без ПД. */
  private renderText(notification: { title: string; body: string | null; link: string | null }): string {
    const appUrl = this.config.get<string>('APP_URL');
    const lines = [notification.title];
    if (notification.body) lines.push(notification.body);
    if (notification.link) lines.push(`${appUrl}${notification.link}`);
    return lines.join('\n');
  }
}
