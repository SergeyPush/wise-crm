import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from 'shared';
import { ALLOW_ONBOARDING_KEY } from '../decorators/allow-onboarding.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AppException } from '../app.exception';
import { AuthUser } from '../decorators/current-user.decorator';

/**
 * Незавершённый вход дальше настройки не пускает: mustChangePassword —
 * первый вход по одноразовому паролю (FR-1.3, FR-1.6). Проверка на сервере,
 * а не в роутинге фронта: иначе обходится curl'ом.
 */
@Injectable()
export class OnboardingGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const meta = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, meta)) return true;
    if (this.reflector.getAllAndOverride<boolean>(ALLOW_ONBOARDING_KEY, meta)) return true;

    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = req.user;
    if (!user) return true; // отсутствие пользователя — забота JwtAuthGuard

    if (user.mustChangePassword) {
      throw new AppException(
        403,
        ErrorCode.PASSWORD_CHANGE_REQUIRED,
        'Спочатку змініть тимчасовий пароль',
      );
    }
    return true;
  }
}
