import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { ApiError, ErrorCode } from 'shared';
import { AppException } from '../app.exception';
import { AlertsService } from '../alerts/alerts.service';

/**
 * Единый формат ошибки (03-tech-stack.md): { statusCode, code, message, details, requestId }.
 * requestId возвращается клиенту и совпадает с полем в логе (NFR-31.2) —
 * без него жалоба «вчера всё сломалось» не связывается с логом никак.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly alerts: AlertsService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const req = ctx.getRequest<FastifyRequest>();
    const requestId = req.id as string;

    const { statusCode, code, message, details } = this.normalize(exception);

    // SPA-fallback: F5 на /clients/<uuid> должен отдавать приложение, а не 404.
    // Живёт здесь, потому что Nest занимает setNotFoundHandler на init.
    if (statusCode === 404 && this.isAppRoute(req)) {
      void reply.sendFile('index.html');
      return;
    }

    // 5xx — со стеком; 4xx — одной строкой, иначе лог забивают опечатки (NFR-31.1)
    if (statusCode >= 500) {
      this.logger.error({ requestId, code, err: exception }, message);
      // NFR-32/32.1: алерт в Telegram-групу моніторингу, з дедуплікацією за
      // маршрутом+кодом — інакше шторм однакових 5xx засипле групу за хвилину.
      const route = req.routeOptions?.url ?? req.url;
      void this.alerts.fire(
        `5xx:${route}:${code}`,
        `🔴 5xx на ${req.method} ${route}\nКод: ${code}\nrequestId: ${requestId}`,
      );
    } else {
      const security = statusCode === 401 || statusCode === 403 || statusCode === 429;
      this.logger.warn(
        { requestId, code, statusCode, path: req.url, ...(security ? { tag: 'security' } : {}) },
        message,
      );
    }

    const body: ApiError = { statusCode, code, message, requestId };
    if (details !== undefined) body.details = details;
    void reply.status(statusCode).send(body);
  }

  /** Каталог собранного фронта существует только в prod-образе. */
  private static readonly hasSpa = existsSync(join(__dirname, '..', '..', '..', 'public'));

  private isAppRoute(req: FastifyRequest): boolean {
    if (!AllExceptionsFilter.hasSpa) return false;
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    if (req.url.startsWith('/api')) return false;
    // На запрос картинки или шрифта отдавать HTML бессмысленно
    return (req.headers.accept ?? '').includes('text/html');
  }

  private normalize(exception: unknown): {
    statusCode: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    if (exception instanceof AppException) {
      return {
        statusCode: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      // ValidationPipe отдаёт { message: string[] } — разворачиваем в details
      if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, unknown>;
        const raw = obj.message;
        if (Array.isArray(raw)) {
          return {
            statusCode: status,
            code: ErrorCode.VALIDATION_FAILED,
            message: 'Перевірте правильність заповнення полів',
            details: raw,
          };
        }
        return {
          statusCode: status,
          code: (obj.code as string) ?? this.codeByStatus(status),
          message: (raw as string) ?? exception.message,
        };
      }
      return { statusCode: status, code: this.codeByStatus(status), message: String(res) };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          statusCode: HttpStatus.CONFLICT,
          code: ErrorCode.CONFLICT_STALE_DATA,
          message: 'Запис із такими даними вже існує',
          details: exception.meta,
        };
      }
      if (exception.code === 'P2025') {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          code: ErrorCode.NOT_FOUND,
          message: 'Запис не знайдено',
        };
      }
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL,
      message: 'Сталася непередбачена помилка',
    };
  }

  private codeByStatus(status: number): string {
    switch (status) {
      case 400:
        return ErrorCode.VALIDATION_FAILED;
      case 401:
        return ErrorCode.UNAUTHORIZED;
      case 403:
        return ErrorCode.FORBIDDEN;
      case 404:
        return ErrorCode.NOT_FOUND;
      case 429:
        return ErrorCode.RATE_LIMITED;
      default:
        return ErrorCode.INTERNAL;
    }
  }
}
