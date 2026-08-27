import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { AlertsService } from './alerts.service';
import { TelegramService } from '../../modules/telegram/telegram.service';

/** NFR-32/32.1/31.4: дедуплікація алертів і те, що падіння джоби не тихе. */
describe('AlertsService', () => {
  let telegram: { send: ReturnType<typeof vi.fn>; isEnabled: boolean };
  let config: { get: ReturnType<typeof vi.fn> };
  let alerts: AlertsService;

  beforeEach(() => {
    telegram = { send: vi.fn().mockResolvedValue(undefined), isEnabled: true };
    config = { get: vi.fn().mockReturnValue('123456') }; // ALERT_TELEGRAM_CHAT_ID
    alerts = new AlertsService(config as unknown as ConfigService, telegram as unknown as TelegramService);
  });

  it('шле алерт у Telegram, коли є канал і токен бота', async () => {
    await alerts.fire('key-a', 'перше повідомлення');

    expect(telegram.send).toHaveBeenCalledTimes(1);
    expect(telegram.send).toHaveBeenCalledWith('123456', 'перше повідомлення');
  });

  it('придушує повторний алерт з тим самим ключем у межах вікна (NFR-32.1)', async () => {
    await alerts.fire('key-a', 'перше');
    await alerts.fire('key-a', 'друге, той самий ключ');

    expect(telegram.send).toHaveBeenCalledTimes(1);
    expect(telegram.send).toHaveBeenCalledWith('123456', 'перше');
  });

  it('не придушує різні ключі — це різні інциденти', async () => {
    await alerts.fire('key-a', 'A');
    await alerts.fire('key-b', 'B');

    expect(telegram.send).toHaveBeenCalledTimes(2);
  });

  it('нічого не шле, якщо ALERT_TELEGRAM_CHAT_ID не задано', async () => {
    config.get.mockReturnValue(undefined);

    await alerts.fire('key-a', 'msg');

    expect(telegram.send).not.toHaveBeenCalled();
  });

  it('нічого не шле, якщо Telegram-бот вимкнено (немає токена)', async () => {
    telegram.isEnabled = false;

    await alerts.fire('key-a', 'msg');

    expect(telegram.send).not.toHaveBeenCalled();
  });

  it('падіння send() в Telegram не кидає виняток назовні', async () => {
    telegram.send.mockRejectedValue(new Error('Telegram недоступний'));

    await expect(alerts.fire('key-a', 'msg')).resolves.toBeUndefined();
  });

  describe('guardJob (NFR-31.4)', () => {
    it('не шле алерт, коли джоба відпрацювала без помилок', async () => {
      await alerts.guardJob('job.ok', async () => {});

      expect(telegram.send).not.toHaveBeenCalled();
    });

    it('ловить падіння джоби і шле алерт, а не прокидає виняток', async () => {
      await expect(
        alerts.guardJob('job.broken', async () => {
          throw new Error('щось зламалось');
        }),
      ).resolves.toBeUndefined();

      expect(telegram.send).toHaveBeenCalledTimes(1);
      expect(telegram.send.mock.calls[0][1]).toContain('job.broken');
      expect(telegram.send.mock.calls[0][1]).toContain('щось зламалось');
    });
  });
});
