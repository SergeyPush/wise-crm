import { Injectable } from '@nestjs/common';
import { ErrorCode } from 'shared';
import { AppException } from '../../common/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { CreateCommentDto } from './dto/comment.dto';

/**
 * Мінімальна версія FR-2.16 (лента): коментар зберігається і одразу пише
 * подію в activity_events, щоб бути видимим у стрічці клієнта без окремого
 * списку. @Згадки і форматування (tiptap) — етап 4 (FR-2.17).
 */
@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  async create(dto: CreateCommentDto, actorId: string) {
    let clientId: string | undefined;
    let taskId: string | undefined;

    if (dto.entityType === 'client') {
      const client = await this.prisma.client.findFirst({ where: { id: dto.entityId, deletedAt: null } });
      if (!client) throw new AppException(404, ErrorCode.NOT_FOUND, 'Клієнта не знайдено');
      clientId = client.id;
    } else {
      const task = await this.prisma.task.findFirst({ where: { id: dto.entityId, deletedAt: null } });
      if (!task) throw new AppException(404, ErrorCode.NOT_FOUND, 'Задачу не знайдено');
      taskId = task.id;
      clientId = task.clientId ?? undefined;
    }

    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.comment.create({
        data: { entityType: dto.entityType, entityId: dto.entityId, clientId, taskId, authorId: actorId, body: dto.body },
      });
      if (clientId) {
        await this.activity.log(
          { clientId, actorId, type: 'comment', entityType: dto.entityType, entityId: dto.entityId, payload: { body: dto.body } },
          tx,
        );
      }
      return comment;
    });
  }
}
