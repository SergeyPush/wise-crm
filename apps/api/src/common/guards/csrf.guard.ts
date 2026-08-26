import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { COOKIE, CSRF_HEADER, ErrorCode } from 'shared';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AppException } from '../app.exception';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit токен на мутациях (NFR-15). SameSite=Lax уже отсекает
 * кросс-сайтовые POST из форм, но не покрывает случай поддомена, поэтому
 * второй заслон — заголовок, недоступный чужому origin.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    if (SAFE_METHODS.has(req.method)) return true;

    // Публичные эндпоинты (заявка с сайта, логин) защищены своими средствами:
    // токеном формы и rate limit'ом — cookie у них ещё нет.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const cookieToken = req.cookies?.[COOKIE.CSRF];
    const headerToken = req.headers[CSRF_HEADER];
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      throw new AppException(403, ErrorCode.CSRF_INVALID, 'Помилка захисту від CSRF. Оновіть сторінку');
    }
    return true;
  }
}
