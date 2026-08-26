import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type ActivityEntry = {
  clientId?: string | null;
  // status_changed | comment | task_created | file_added | field_changed | contact_logged | web_lead | web_lead_duplicate
  type: string;
  // null — системная подія (заявка з сайту, FR-W5/W6): людини-ініціатора немає
  actorId: string | null;
  entityType?: string;
  entityId?: string;
  payload?: Prisma.InputJsonValue;
};

/**
 * Единый источник ленты клиента (FR-2.16). Пишется в той же транзакции, что
 * и мутация, и заодно обновляет `Client.lastActivityAt` — денормализация,
 * без которой «ліди без активності» (FR-5.2.1) считались бы на лету по всей базе.
 */
@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: ActivityEntry, tx?: Prisma.TransactionClient): Promise<void> {
    const db = tx ?? this.prisma;
    await db.activityEvent.create({
      data: {
        clientId: entry.clientId ?? null,
        type: entry.type,
        actorId: entry.actorId ?? null,
        entityType: entry.entityType,
        entityId: entry.entityId,
        payload: entry.payload ?? {},
      },
    });
    if (entry.clientId) {
      await db.client.update({
        where: { id: entry.clientId },
        data: { lastActivityAt: new Date() },
      });
    }
  }
}
