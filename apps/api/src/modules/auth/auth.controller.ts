import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import { AUTH, COOKIE, ErrorCode } from 'shared';
import { Public } from '../../common/decorators/public.decorator';
import { AppException } from '../../common/app.exception';
import { AuthService } from './auth.service';
import { CompleteResetDto, LoginDto } from './dto/auth.dto';
import { clearAuthCookies, setAuthCookies } from './cookies';

const LOGIN_IP_LIMIT = Number(
  process.env.LOGIN_IP_LIMIT_PER_MIN ?? AUTH.LOGIN_ATTEMPTS_PER_IP_PER_MIN,
);

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly cookieSecure: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.cookieSecure = config.get<boolean>('COOKIE_SECURE') ?? false;
  }

  private meta(req: FastifyRequest) {
    return { ip: req.ip, userAgent: req.headers['user-agent'] };
  }

  @Public()
  // Лимит по IP мягкий (FR-1.5): офис за одним NAT, жёсткий блокирует коллег.
  // В тестах поднимается через env: там весь прогон идёт с одного адреса.
  @Throttle({ default: { limit: LOGIN_IP_LIMIT, ttl: 60_000 } })
  @Post('login')
  @ApiOperation({ summary: 'Вхід: email + пароль' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.auth.login(dto.email, dto.password, this.meta(req));
    setAuthCookies(reply, result, this.cookieSecure);
    return { user: result.user };
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Ротація refresh-токена' })
  async refresh(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const token = req.cookies?.[COOKIE.REFRESH];
    if (!token) throw new AppException(401, ErrorCode.UNAUTHORIZED, 'Сесія недійсна');
    const tokens = await this.auth.refresh(token, this.meta(req));
    setAuthCookies(reply, tokens, this.cookieSecure);
    return { ok: true };
  }

  @Public()
  @Post('logout')
  @ApiOperation({ summary: 'Вихід: відкликає поточний refresh' })
  async logout(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.auth.logout(req.cookies?.[COOKIE.REFRESH]);
    clearAuthCookies(reply);
    return { ok: true };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('complete-reset')
  @ApiOperation({ summary: 'Встановлення пароля за одноразовим посиланням (FR-1.3)' })
  async completeReset(@Body() dto: CompleteResetDto, @Req() req: FastifyRequest) {
    await this.auth.completePasswordReset(dto.token, dto.newPassword, req.ip);
    return { ok: true };
  }

  @Public()
  @Get('csrf')
  @ApiOperation({ summary: 'Видача CSRF-токена до входу (форма логіну теж мутація)' })
  csrf(@Res({ passthrough: true }) reply: FastifyReply) {
    // Токен нужен фронту до логина: без него первая же мутация упрётся в guard
    const token = randomBytes(24).toString('base64url');
    reply.setCookie(COOKIE.CSRF, token, {
      httpOnly: false,
      secure: this.cookieSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: AUTH.REFRESH_TTL_SEC,
    });
    return { csrfToken: token };
  }
}
