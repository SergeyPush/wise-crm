import { Body, Controller, Headers, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { FastifyRequest } from 'fastify';
import { Public } from '../../common/decorators/public.decorator';
import { WebLeadsService } from './web-leads.service';

/**
 * FR-W1. Тело принимается как сырой объект (Object как metatype), а не через
 * DTO с `whitelist`: реальные имена полей формы сайта нам ещё не известны
 * (07-open-questions.md), и глобальный `forbidNonWhitelisted` иначе отклонял
 * бы заявку целиком — а ответ здесь обязан быть 200 всегда.
 */
@ApiExcludeController() // публичный эндпоинт без пользовательской авторизации — в Swagger для сотрудников не нужен
@Controller('public/leads')
export class PublicLeadsController {
  constructor(
    private readonly webLeads: WebLeadsService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK) // FR-W1: відповідь завжди 200, навіть коли всередині нічого не сталося
  @Post()
  async create(
    @Body() body: Record<string, unknown>,
    @Headers('x-web-form-token') token: string | undefined,
    @Req() req: FastifyRequest,
  ) {
    const contentLength = Number(req.headers['content-length'] ?? 0);
    const bodyBytes = contentLength || Buffer.byteLength(JSON.stringify(body ?? {}));

    await this.webLeads.handlePublicSubmission(body ?? {}, {
      token,
      expectedToken: this.config.get<string>('WEB_FORM_TOKEN'),
      sourceIp: req.ip,
      bodyBytes,
    });

    // FR-W1: відповідь завжди 200 — сайту не треба знати, що сталося всередині
    return { ok: true };
  }
}
