import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { COOKIE, ErrorCode, Role } from 'shared';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AppException } from '../app.exception';
import { TokenService } from '../../modules/auth/token.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../decorators/current-user.decorator';

/**
 * Глобальный guard. Токен берётся из httpOnly cookie (NFR-15), не из заголовка:
 * localStorage отпадает как цель XSS. Passport здесь не даёт ничего — стратегия
 * свелась бы к тому же чтению cookie и проверке подписи.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<FastifyRequest & { user?: AuthUser }>();
    const raw = req.cookies?.[COOKIE.ACCESS];
    if (!raw) {
      throw new AppException(401, ErrorCode.UNAUTHORIZED, 'Потрібна авторизація');
    }

    const payload = await this.tokens.verifyAccess(raw).catch(() => null);
    if (!payload) {
      throw new AppException(401, ErrorCode.UNAUTHORIZED, 'Сесія недійсна або застаріла');
    }

    // Роль и активность читаются из БД, а не из токена: деактивация сотрудника
    // должна действовать сразу, а не через 15 минут жизни access-токена (FR-1.9).
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        fullName: true,
        isActive: true,
        isProtected: true,
        mustChangePassword: true,
      },
    });
    if (!user) throw new AppException(401, ErrorCode.UNAUTHORIZED, 'Користувача не знайдено');
    if (!user.isActive) {
      throw new AppException(403, ErrorCode.ACCOUNT_INACTIVE, 'Обліковий запис деактивовано');
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role as Role,
      fullName: user.fullName,
      isProtected: user.isProtected,
      mustChangePassword: user.mustChangePassword,
    };
    return true;
  }
}
