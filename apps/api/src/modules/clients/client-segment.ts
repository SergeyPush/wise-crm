import { Prisma, Stage } from '@prisma/client';
import { CLIENT_STATUS_CODE, ClientSegment } from 'shared';

/**
 * Фільтр по статусу для списку/експорту: stage + сегмент «Ліди»/«Клієнти».
 * Обидва фільтри лежать в одному `status`, тому зводимо їх в один об'єкт —
 * два окремих spread'и перезаписали б один одного.
 */
export function statusWhere(stage?: string, segment?: string): Prisma.ClientWhereInput {
  const status: Prisma.ClientStatusWhereInput = {
    ...(stage ? { stage: stage as Stage } : {}),
    ...(segment === ClientSegment.CLIENTS ? { code: CLIENT_STATUS_CODE } : {}),
    ...(segment === ClientSegment.LEADS ? { code: { not: CLIENT_STATUS_CODE } } : {}),
  };
  return Object.keys(status).length ? { status } : {};
}
