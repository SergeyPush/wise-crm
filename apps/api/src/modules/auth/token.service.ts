import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT, jwtVerify } from 'jose';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AUTH } from 'shared';
import { PrismaService } from '../../prisma/prisma.service';

export type AccessPayload = { sub: string; role: string };

/**
 * Access — короткий JWT (15 мин), refresh — случайная строка, в БД лежит
 * только её sha256. Refresh не JWT намеренно: его нужно уметь отозвать
 * мгновенно (смена пароля, сброс админом), а отзыв JWT требует того же
 * обращения к БД — тогда подпись не даёт ничего.
 */
@Injectable()
export class TokenService {
  private readonly accessSecret: Uint8Array;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.accessSecret = new TextEncoder().encode(config.getOrThrow<string>('JWT_ACCESS_SECRET'));
  }

  async signAccess(userId: string, role: string): Promise<string> {
    return new SignJWT({ role })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(`${AUTH.ACCESS_TTL_SEC}s`)
      .sign(this.accessSecret);
  }

  async verifyAccess(token: string): Promise<AccessPayload> {
    const { payload } = await jwtVerify(token, this.accessSecret);
    return { sub: payload.sub as string, role: payload.role as string };
  }

  static hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Новый refresh. familyId связывает цепочку ротаций: повторное использование
   * уже провёрнутого токена означает кражу — отзывается вся семья.
   */
  async issueRefresh(
    userId: string,
    familyId: string | null,
    meta: { ip?: string; userAgent?: string },
  ): Promise<string> {
    const raw = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: TokenService.hash(raw),
        familyId: familyId ?? randomUUID(),
        ip: meta.ip,
        userAgent: meta.userAgent,
        expiresAt: new Date(Date.now() + AUTH.REFRESH_TTL_SEC * 1000),
      },
    });
    return raw;
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const res = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return res.count;
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Свежий CSRF-токен: кладётся в читаемую cookie и сверяется с заголовком. */
  static csrfToken(): string {
    return randomBytes(24).toString('base64url');
  }
}
