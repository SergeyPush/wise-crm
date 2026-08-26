import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * FR-W4: значения полей веб-формы мапятся через таблицу `WebFormMapping`,
 * а не хардкодом — варианты в выпадающих списках сайта меняются без нашего
 * участия. Вызывающий код сам решает, что делать с `null` (поле не заповнено
 * заявкою — не помилка) и відсутністю мапінгу (значення є, але невідоме).
 */
export async function mapWebFormValue(
  prisma: PrismaService | Prisma.TransactionClient,
  field: string,
  rawValue: string,
): Promise<string | null> {
  const row = await prisma.webFormMapping.findUnique({
    where: { field_rawValue: { field, rawValue } },
  });
  return row?.mappedValue ?? null;
}

export function stringField(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

export function toInt(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Math.trunc(Number(v));
  return undefined;
}

export function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return ['так', 'yes', 'true', '1'].includes(v.trim().toLowerCase());
  return false;
}

/** FR-W4: `AdditionalInfo` → `Client.isVatPayer`, значення «ПДВ» → true. */
export function isVatPayerFlag(v: unknown): boolean {
  return typeof v === 'string' && v.toLowerCase().includes('пдв');
}
