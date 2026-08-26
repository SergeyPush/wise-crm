import { Injectable } from '@nestjs/common';
import { AUTH, ErrorCode } from 'shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/app.exception';

/**
 * FR-1.5: 10 неудач по одному email → блокировка email на 15 минут,
 * независимо от IP. Лимит по IP отдельный и мягче (20/мин, @nestjs/throttler):
 * офис сидит за одним NAT, и жёсткий IP-лимит блокировал бы коллег
 * из-за чужих опечаток.
 *
 * Счётчик в БД, а не в памяти процесса: иначе лимит обходится рестартом.
 */
@Injectable()
export class LoginAttemptsService {
  constructor(private readonly prisma: PrismaService) {}

  private windowStart(): Date {
    return new Date(Date.now() - AUTH.LOGIN_LOCK_MINUTES * 60_000);
  }

  async assertNotLocked(email: string): Promise<void> {
    const failures = await this.prisma.loginAttempt.count({
      where: { email, success: false, createdAt: { gte: this.windowStart() } },
    });
    if (failures >= AUTH.LOGIN_ATTEMPTS_PER_EMAIL) {
      throw new AppException(
        429,
        ErrorCode.ACCOUNT_LOCKED,
        `Забагато невдалих спроб. Спробуйте за ${AUTH.LOGIN_LOCK_MINUTES} хвилин`,
      );
    }
  }

  async record(email: string, ip: string | undefined, success: boolean): Promise<void> {
    await this.prisma.loginAttempt.create({ data: { email, ip, success } });
    // Успешный вход обнуляет счётчик: иначе девять опечаток днём
    // заблокируют человека вечером после правильного входа.
    if (success) {
      await this.prisma.loginAttempt.deleteMany({ where: { email, success: false } });
    }
  }

  /** Чистка старых записей — крон раз в сутки (запись остаётся в логе, NFR-31.3). */
  async purgeOlderThan(days = 30): Promise<number> {
    const res = await this.prisma.loginAttempt.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - days * 86_400_000) } },
    });
    return res.count;
  }
}
