import { Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, Req, Res, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ErrorCode } from 'shared';
import { AppException } from '../../common/app.exception';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { ListFilesQueryDto, UploadFileFieldsDto } from './dto/file.dto';
import { FilesService } from './files.service';

@ApiTags('files')
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get()
  @RequirePermission('client:read')
  @ApiOperation({ summary: 'Документи: фільтр за категорією + пошук за іменем (FR-F5)' })
  list(@Query() query: ListFilesQueryDto) {
    return this.files.list(query);
  }

  @Post()
  @RequirePermission('file:upload')
  @ApiOperation({ summary: 'multipart, один файл = один запит (FR-F7)' })
  async upload(@Req() req: FastifyRequest, @CurrentUser() actor: AuthUser) {
    const { file, rawFields } = await this.parseMultipart(req);

    const fields = plainToInstance(UploadFileFieldsDto, rawFields, { enableImplicitConversion: true });
    const errors = validateSync(fields, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length) {
      throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Некоректні поля форми', errors);
    }

    return this.files.upload(fields, file, actor.id);
  }

  @Get(':id/download')
  @RequirePermission('client:read')
  @ApiOperation({ summary: 'Перевірка прав, Content-Disposition (FR-F10, FR-F11)' })
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { stream, attachment, disposition } = await this.files.prepareDownload(id, actor);
    // RFC 5987: ascii-фолбек у filename= для старих клієнтів, кирилиця — у filename*=
    const asciiFallback = attachment.originalName.replace(/[^\x20-\x7E]/g, '_');
    res.header(
      'Content-Disposition',
      `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
    );
    res.header('X-Content-Type-Options', 'nosniff'); // NFR-19
    res.header('Content-Type', attachment.mimeType);
    return new StreamableFile(stream);
  }

  // Без @RequirePermission('file:delete') — правило «автор ≤24 год або ADMIN»
  // зав'язане на об'єкт (владіння), матриця прав без контексту завжди відмовляє
  // USER (як task:delete, tasks.controller.ts). Тут лише перевірка автентифікації,
  // повна перевірка — у сервісі через can(..., {isOwner, ageHours}).
  @Delete(':id')
  @RequirePermission()
  @ApiOperation({ summary: "М'яке видалення: автор ≤24 год або ADMIN (FR-F12)" })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) {
    return this.files.remove(id, actor);
  }

  /** @fastify/multipart: поле може йти до або після файлу в тілі — тому один прохід по всіх частинах. */
  private async parseMultipart(
    req: FastifyRequest,
  ): Promise<{ file: { buffer: Buffer; filename: string }; rawFields: Record<string, string> }> {
    const rawFields: Record<string, string> = {};
    let file: { buffer: Buffer; filename: string } | undefined;

    try {
      for await (const part of req.parts()) {
        if (part.type === 'file') {
          file = { buffer: await part.toBuffer(), filename: part.filename };
        } else {
          rawFields[part.fieldname] = String(part.value);
        }
      }
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'FST_REQ_FILE_TOO_LARGE') {
        throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Файл більший за 25 МБ');
      }
      throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Не вдалося прочитати файл');
    }

    if (!file) throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Файл не передано');
    return { file, rawFields };
  }
}
