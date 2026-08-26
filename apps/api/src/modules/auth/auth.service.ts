import { Injectable, Logger } from '@nestjs/common';
import { ErrorCode, Role } from 'shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/app.exception';
import { AuditService } from '../audit/audit.service';
import { LoginAttemptsService } from './login-attempts.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

export type LoginResult = {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  user: { id: string; email: string; fullName: string; role: Role; mustChangePassword: boolean };
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly attempts: LoginAttemptsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Вход по email и паролю. 2FA в MVP не делается (решение от 26.08.2026,
   * 01-functional-requirements.md, раздел 9) — трение и точка отказа
   * не окупались на масштабе в одного-двух админов.
   */
  async login(
    email: string,
    password: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<LoginResult> {
    await this.attempts.assertNotLocked(email);

    const user = await this.prisma.user.findUnique({ where: { email } });
    // Одинаковый ответ на неизвестный email и неверный пароль:
    // разные тексты позволяют перебрать список сотрудников.
    const invalid = () =>
      new AppException(401, ErrorCode.INVALID_CREDENTIALS, 'Невірна пошта або пароль');

    if (!user) {
      await this.attempts.record(email, meta.ip, false);
      throw invalid();
    }

    const ok = await this.passwords.verify(user.passwordHash, password);
    if (!ok) {
      await this.attempts.record(email, meta.ip, false);
      this.logger.warn({ tag: 'security', userId: user.id, ip: meta.ip }, 'Невдалий вхід');
      throw invalid();
    }

    if (!user.isActive) {
      await this.attempts.record(email, meta.ip, false);
      throw new AppException(403, ErrorCode.ACCOUNT_INACTIVE, 'Обліковий запис деактивовано');
    }

    await this.attempts.record(email, meta.ip, true);

    const accessToken = await this.tokens.signAccess(user.id, user.role);
    const refreshToken = await this.tokens.issueRefresh(user.id, null, meta);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      accessToken,
      refreshToken,
      csrfToken: TokenService.csrfToken(),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role as Role,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  /**
   * Ротация refresh (FR-1.2). Предъявление уже провёрнутого токена означает,
   * что его скопировали, — отзывается вся семья, а не только этот токен.
   */
  async refresh(
    rawToken: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<{ accessToken: string; refreshToken: string; csrfToken: string }> {
    const hash = TokenService.hash(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hash },
      include: { user: true },
    });

    if (!stored) {
      throw new AppException(401, ErrorCode.UNAUTHORIZED, 'Сесія недійсна');
    }

    if (stored.revokedAt || stored.expiresAt < new Date()) {
      if (stored.revokedAt) {
        this.logger.warn(
          { tag: 'security', userId: stored.userId, familyId: stored.familyId },
          'Повторне використання відкликаного refresh-токена',
        );
        await this.tokens.revokeFamily(stored.familyId);
      }
      throw new AppException(401, ErrorCode.UNAUTHORIZED, 'Сесія недійсна');
    }

    if (!stored.user.isActive) {
      throw new AppException(403, ErrorCode.ACCOUNT_INACTIVE, 'Обліковий запис деактивовано');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const accessToken = await this.tokens.signAccess(stored.userId, stored.user.role);
    const refreshToken = await this.tokens.issueRefresh(stored.userId, stored.familyId, meta);
    return { accessToken, refreshToken, csrfToken: TokenService.csrfToken() };
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: TokenService.hash(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Смена своего пароля отзывает все сессии (FR-1.2). */
  async changeOwnPassword(userId: string, current: string, next: string, ip?: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ok = await this.passwords.verify(user.passwordHash, current);
    if (!ok) {
      throw new AppException(400, ErrorCode.INVALID_CREDENTIALS, 'Поточний пароль невірний');
    }
    this.passwords.assertStrong(next);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: await this.passwords.hash(next), mustChangePassword: false },
      });
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log({ actorId: userId, action: 'password.change', targetUserId: userId, ip }, tx);
    });
  }

  /** Смена пароля по одноразовой ссылке (FR-1.3): ссылка живёт 72 часа и сгорает. */
  async completePasswordReset(rawToken: string, newPassword: string, ip?: string): Promise<void> {
    const hash = TokenService.hash(rawToken);
    const token = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: hash } });
    if (!token || token.usedAt || token.expiresAt < new Date()) {
      throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Посилання недійсне або застаріле');
    }
    this.passwords.assertStrong(newPassword);

    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      });
      await tx.user.update({
        where: { id: token.userId },
        data: {
          passwordHash: await this.passwords.hash(newPassword),
          mustChangePassword: false,
        },
      });
      await tx.refreshToken.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.log(
        { actorId: token.userId, action: 'password.reset.complete', targetUserId: token.userId, ip },
        tx,
      );
    });
  }
}
