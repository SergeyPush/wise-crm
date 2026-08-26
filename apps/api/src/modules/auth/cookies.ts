import { FastifyReply } from 'fastify';
import { AUTH, COOKIE } from 'shared';

/**
 * Cookie ставится host-only (без атрибута Domain) — тогда она вообще не уходит
 * в запросы к wisexpert.com.ua (03-tech-stack.md, «Размещение»).
 */
function base(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
  };
}

export function setAuthCookies(
  reply: FastifyReply,
  tokens: { accessToken: string; refreshToken: string; csrfToken: string },
  secure: boolean,
): void {
  reply.setCookie(COOKIE.ACCESS, tokens.accessToken, {
    ...base(secure),
    maxAge: AUTH.ACCESS_TTL_SEC,
  });
  reply.setCookie(COOKIE.REFRESH, tokens.refreshToken, {
    ...base(secure),
    // refresh уходит только на свои эндпоинты — меньше поверхность утечки
    path: '/api/v1/auth',
    maxAge: AUTH.REFRESH_TTL_SEC,
  });
  // CSRF-токен читаемый: фронт копирует его в заголовок (double-submit, NFR-15)
  reply.setCookie(COOKIE.CSRF, tokens.csrfToken, {
    ...base(secure),
    httpOnly: false,
    maxAge: AUTH.REFRESH_TTL_SEC,
  });
}

export function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie(COOKIE.ACCESS, { path: '/' });
  reply.clearCookie(COOKIE.REFRESH, { path: '/api/v1/auth' });
  reply.clearCookie(COOKIE.CSRF, { path: '/' });
}
