import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, Permission, can } from 'shared';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { AppException } from '../app.exception';
import { AuthUser } from '../decorators/current-user.decorator';

/** Проверка по общей матрице (packages/shared/permissions.ts) — один источник правды. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required?.length) return true;

    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = req.user;
    if (!user) throw new AppException(401, ErrorCode.UNAUTHORIZED, 'Потрібна авторизація');

    // Владение объектом проверяет сервис — здесь только права роли.
    const ok = required.every((p) => can(user.role, p));
    if (!ok) throw new AppException(403, ErrorCode.FORBIDDEN, 'Недостатньо прав');
    return true;
  }
}
