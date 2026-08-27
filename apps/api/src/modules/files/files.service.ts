import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { can, ErrorCode } from 'shared';
import { AppException } from '../../common/app.exception';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { assertSafeFile } from './file-type.util';
import { CLIENT_QUOTA_BYTES, MAX_FILE_BYTES } from './file-limits';
import { StorageService } from './storage.service';
import { ListFilesQueryDto, UploadFileFieldsDto } from './dto/file.dto';

// FR-F11: inline дозволено суворо переліком, не маскою image/* — під маску
// потрапляє image/svg+xml, а SVG виконує скрипти в контексті нашого origin.
const INLINE_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

type UploadedFile = { buffer: Buffer; filename: string };

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly activity: ActivityService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private async resolveClientId(entityType: string, entityId: string): Promise<string | null> {
    if (entityType === 'client') {
      const client = await this.prisma.client.findFirst({ where: { id: entityId, deletedAt: null } });
      if (!client) throw new AppException(404, ErrorCode.NOT_FOUND, 'Клієнта не знайдено');
      return client.id;
    }
    if (entityType === 'task') {
      const task = await this.prisma.task.findFirst({ where: { id: entityId, deletedAt: null } });
      if (!task) throw new AppException(404, ErrorCode.NOT_FOUND, 'Задачу не знайдено');
      return task.clientId ?? null;
    }
    const comment = await this.prisma.comment.findFirst({ where: { id: entityId, deletedAt: null } });
    if (!comment) throw new AppException(404, ErrorCode.NOT_FOUND, 'Коментар не знайдено');
    return comment.clientId ?? null;
  }

  async upload(fields: UploadFileFieldsDto, file: UploadedFile, actorId: string) {
    if (file.buffer.byteLength > MAX_FILE_BYTES) {
      throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Файл більший за 25 МБ');
    }
    if (await this.storage.isDiskAlmostFull()) {
      throw new AppException(400, ErrorCode.VALIDATION_FAILED, 'Диск заповнено — завантаження тимчасово недоступне');
    }

    const clientId = await this.resolveClientId(fields.entityType, fields.entityId);
    const { ext, mime } = await assertSafeFile(file.filename, file.buffer);
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');

    // FR-F15: той самий файл (ім'я + категорія) у того самого клієнта — нова версія
    const previous = clientId
      ? await this.prisma.attachment.findFirst({
          where: {
            clientId,
            categoryId: fields.categoryId ?? null,
            originalName: file.filename,
            deletedAt: null,
          },
          orderBy: { version: 'desc' },
        })
      : null;

    const storageKey = await this.storage.save(file.buffer, ext);

    const attachment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.attachment.create({
        data: {
          entityType: fields.entityType,
          entityId: fields.entityId,
          clientId,
          categoryId: fields.categoryId,
          originalName: file.filename,
          storageKey,
          mimeType: mime,
          sizeBytes: file.buffer.byteLength,
          sha256,
          period: fields.period,
          isPinned: fields.isPinned ?? false,
          parentId: previous?.id,
          version: (previous?.version ?? 0) + 1,
          uploadedById: actorId,
        },
      });
      if (clientId) {
        await this.activity.log(
          {
            clientId,
            actorId,
            type: 'file_added',
            entityType: fields.entityType,
            entityId: fields.entityId,
            payload: { fileId: created.id, originalName: file.filename },
          },
          tx,
        );
      }
      await this.audit.log(
        {
          actorId,
          action: 'file.upload',
          entityType: 'attachment',
          entityId: created.id,
          payload: { originalName: file.filename, sizeBytes: created.sizeBytes },
        },
        tx,
      );
      return created;
    });

    if (clientId) await this.warnIfQuotaExceeded(clientId, file.buffer.byteLength);
    return attachment;
  }

  /** Лічильник, а не жорсткий ліміт (FR-F7) — сповіщення адмінам при першому перетині 1 ГБ. */
  private async warnIfQuotaExceeded(clientId: string, addedBytes: number): Promise<void> {
    const agg = await this.prisma.attachment.aggregate({
      where: { clientId, deletedAt: null },
      _sum: { sizeBytes: true },
    });
    const total = agg._sum.sizeBytes ?? 0;
    const before = total - addedBytes;
    if (before > CLIENT_QUOTA_BYTES || total <= CLIENT_QUOTA_BYTES) return;

    const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { displayName: true } });
    await this.notifications.notifyAllActive({
      type: 'file_quota_exceeded',
      title: `Клієнт «${client?.displayName ?? ''}» перевищив 1 ГБ файлів`,
      entityType: 'client',
      entityId: clientId,
      link: `/clients/${clientId}`,
    });
  }

  async list(filter: ListFilesQueryDto) {
    const where: Prisma.AttachmentWhereInput = { deletedAt: null };
    if (filter.entityType && filter.entityId) {
      where.entityType = filter.entityType;
      where.entityId = filter.entityId;
    } else if (filter.clientId) {
      where.clientId = filter.clientId;
    }
    if (filter.categoryId) where.categoryId = filter.categoryId;
    if (filter.q) where.originalName = { contains: filter.q, mode: 'insensitive' };

    const rows = await this.prisma.attachment.findMany({
      where,
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      include: { category: true, uploadedBy: { select: { id: true, fullName: true } } },
    });
    // FR-F15: у списку видна лише остання версія ланцюга — «голова» це рядок,
    // на який ніхто інший не посилається як на parentId.
    const parentIds = new Set(rows.filter((r) => r.parentId).map((r) => r.parentId as string));
    return rows.filter((r) => !parentIds.has(r.id));
  }

  async prepareDownload(id: string, actor: AuthUser) {
    const attachment = await this.prisma.attachment.findFirst({ where: { id, deletedAt: null } });
    if (!attachment) throw new AppException(404, ErrorCode.NOT_FOUND, 'Файл не знайдено');
    // FR-F12: усі дії з файлами — в аудит-лог, включно зі скачуванням
    await this.audit.log({ actorId: actor.id, action: 'file.download', entityType: 'attachment', entityId: id });
    return {
      stream: this.storage.stream(attachment.storageKey),
      attachment,
      disposition: INLINE_MIMES.has(attachment.mimeType) ? ('inline' as const) : ('attachment' as const),
    };
  }

  async remove(id: string, actor: AuthUser) {
    const attachment = await this.prisma.attachment.findFirst({ where: { id, deletedAt: null } });
    if (!attachment) throw new AppException(404, ErrorCode.NOT_FOUND, 'Файл не знайдено');

    const ageHours = (Date.now() - attachment.createdAt.getTime()) / 3_600_000;
    const isOwner = attachment.uploadedById === actor.id;
    if (!can(actor.role, 'file:delete', { isOwner, ageHours })) {
      throw new AppException(403, ErrorCode.FORBIDDEN, 'Недостатньо прав');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.attachment.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.log({ actorId: actor.id, action: 'file.delete', entityType: 'attachment', entityId: id }, tx);
      if (attachment.clientId) {
        await this.activity.log(
          {
            clientId: attachment.clientId,
            actorId: actor.id,
            type: 'file_removed',
            entityType: 'attachment',
            entityId: id,
            payload: { originalName: attachment.originalName },
          },
          tx,
        );
      }
    });
    return { ok: true };
  }
}
