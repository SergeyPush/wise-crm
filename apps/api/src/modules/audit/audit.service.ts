import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type AuditEntry = {
  actorId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  targetUserId?: string;
  payload?: Prisma.InputJsonValue;
  ip?: string;
  viaCli?: boolean;
};

/**
 * Аудит пишется с первого дня, экран просмотра — v1.1 (FR-7.1).
 * Принимает транзакционный клиент: запись обязана попадать в ту же транзакцию,
 * что и мутация, иначе журнал расходится с данными.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
    const db = tx ?? this.prisma;
    await db.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        targetUserId: entry.targetUserId,
        payload: entry.payload ?? {},
        ip: entry.ip,
        viaCli: entry.viaCli ?? false,
      },
    });
  }
}
