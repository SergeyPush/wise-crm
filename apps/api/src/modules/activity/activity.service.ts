import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * JSON.stringify/parse, а не ручні перевірки на Date/Decimal: обидва мають
 * власний toJSON() (ISO-рядок і рядок відповідно), тому такий round-trip сам
 * приводить значення до чогось, що можна покласти в Prisma.InputJsonValue.
 */
function toJsonSafe(value: unknown): Prisma.InputJsonValue | null {
  // '' прирівнюється до null: форми (EditClientModal тощо) шлють усі поля
  // разом, і незаповнений текстовий інпут — це '', а не відсутній ключ, тоді
  // як у БД те саме поле лежить як null. Без цього diff показував би
  // помилкове «— → —» для кожного поля, яке просто ніколи не заповнювали.
  if (value === undefined || value === '') return null;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue | null;
}

/**
 * Backlog «Деталізація стрічки активності»: field_changed/task_updated
 * раніше писали лише перелік імен змінених полів, без значень — стрічка не
 * відповідала на «що саме змінилось». Порівнює «до» і «після» по списку
 * полів і лишає тільки ті, де значення справді відрізняється.
 */
export function diffChanged(
  fields: string[],
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Array<{ field: string; from: Prisma.InputJsonValue | null; to: Prisma.InputJsonValue | null }> {
  return fields
    // DTO-класи компілюються з useDefineForClassFields (ES2022+ target):
    // кожне оголошене поле стає власною властивістю інстансу зі значенням
    // undefined, навіть якщо клієнт його не надсилав — Object.keys(dto) тоді
    // включає й непослані поля. undefined у «after» — ознака саме такого
    // «поля не було в запиті», а не «поле стерли»: те й інше в Prisma-update
    // однаково не чіпає БД, але для diff-у це саме шум, який треба відсіяти.
    .filter((field) => after[field] !== undefined)
    .map((field) => ({ field, from: toJsonSafe(before[field]), to: toJsonSafe(after[field]) }))
    .filter((c) => JSON.stringify(c.from) !== JSON.stringify(c.to));
}

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
