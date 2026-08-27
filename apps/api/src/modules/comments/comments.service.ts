import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode } from 'shared';
import { AppException } from '../../common/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateCommentDto, ListCommentsQueryDto } from './dto/comment.dto';

/** FR-2.16 (лента): коментар одразу пише подію в activity_events. */
@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(filter: ListCommentsQueryDto) {
    const where: Prisma.CommentWhereInput = { deletedAt: null };
    if (filter.entityType && filter.entityId) {
      where.entityType = filter.entityType;
      where.entityId = filter.entityId;
    } else if (filter.clientId) {
      where.clientId = filter.clientId;
    }

    return this.prisma.comment.findMany({
      where,
      // Найновіший унизу — читається як стрічка листування, а не як лог подій
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { id: true, fullName: true } } },
    });
  }

  async create(dto: CreateCommentDto, actorId: string) {
    let clientId: string | undefined;
    let taskId: string | undefined;
    let displayName = '';

    if (dto.entityType === 'client') {
      const client = await this.prisma.client.findFirst({ where: { id: dto.entityId, deletedAt: null } });
      if (!client) throw new AppException(404, ErrorCode.NOT_FOUND, 'Клієнта не знайдено');
      clientId = client.id;
      displayName = client.displayName;
    } else {
      const task = await this.prisma.task.findFirst({ where: { id: dto.entityId, deletedAt: null } });
      if (!task) throw new AppException(404, ErrorCode.NOT_FOUND, 'Задачу не знайдено');
      taskId = task.id;
      clientId = task.clientId ?? undefined;
      displayName = task.title;
    }

    // FR-2.17: усі активні співробітники доступні до згадки без обмежень
    // (FR-0.1 — усі бачать усіх клієнтів), тому єдиний фільтр — «активний,
    // не сам автор» (сам собі коментар не повідомляє).
    const requestedIds = [...new Set(dto.mentionedUserIds ?? [])].filter((id) => id !== actorId);
    const mentionedUsers = requestedIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: requestedIds }, isActive: true },
          select: { id: true },
        })
      : [];
    const mentions = mentionedUsers.map((u) => u.id);

    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.comment.create({
        data: {
          entityType: dto.entityType,
          entityId: dto.entityId,
          clientId,
          taskId,
          authorId: actorId,
          body: dto.body,
          mentions,
        },
      });
      if (clientId) {
        await this.activity.log(
          {
            clientId,
            actorId,
            type: 'comment',
            entityType: dto.entityType,
            entityId: dto.entityId,
            payload: { body: dto.body, mentions },
          },
          tx,
        );
      }
      const link = clientId ? `/clients/${clientId}` : `/tasks/${taskId}`;
      for (const userId of mentions) {
        await this.notifications.notifyUser(
          userId,
          {
            type: 'mention',
            title: `Вас згадали в коментарі до «${displayName}»`,
            body: dto.body.slice(0, 200),
            entityType: dto.entityType,
            entityId: dto.entityId,
            link,
          },
          tx,
        );
      }
      return comment;
    });
  }
}
