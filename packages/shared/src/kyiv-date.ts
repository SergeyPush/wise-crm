// Границы календарных суток Europe/Kyiv (FR-3.1.1) — общий источник для бэка
// (расчёт дедлайнов, «прострочено») и фронта (группировка задач «на клиенте»,
// как того требует 09-implementation-plan.md). Через Intl.DateTimeFormat,
// без date-fns-tz — чтобы не тащить лишнюю зависимость во фронт-бандл.

import { TIMEZONE } from './constants';

/** Числовое значение части форматтера; отсутствовать не может — Intl всегда отдаёт все запрошенные поля. */
function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  const found = parts.find((p) => p.type === type);
  if (!found) throw new Error(`Intl.DateTimeFormat не повернув частину "${type}"`);
  return Number(found.value);
}

/** Смещение зоны относительно UTC в минутах в момент date (учитывает DST). */
function tzOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  // Показания «настенных часов» зоны, прочитанные как UTC, минус реальный
  // момент — и есть смещение зоны в этот момент.
  const asUtc = Date.UTC(
    part(parts, 'year'),
    part(parts, 'month') - 1,
    part(parts, 'day'),
    part(parts, 'hour'),
    part(parts, 'minute'),
    part(parts, 'second'),
  );
  return (asUtc - date.getTime()) / 60_000;
}

/** Календарная дата Y-M-D в Києві на момент date. */
export function kyivDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  return { year: part(parts, 'year'), month: part(parts, 'month'), day: part(parts, 'day') };
}

/**
 * UTC-момент, соответствующий указанному настенному времени в Києві.
 * 00:00 и 23:59:59 никогда не совпадают с моментом перехода на летнее/зимнее
 * время (он в Україні всегда около 3–4 ночи) — одного прохода достаточно.
 */
function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, second: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offset = tzOffsetMinutes(guess, TIMEZONE);
  return new Date(guess.getTime() - offset * 60_000);
}

/** Начало календарного дня Києва (00:00:00) как момент UTC. */
export function startOfKyivDay(date: Date = new Date()): Date {
  const { year, month, day } = kyivDateParts(date);
  return zonedTimeToUtc(year, month, day, 0, 0, 0);
}

/**
 * Конец календарного дня Києва (23:59:59) как момент UTC (FR-3.1.1). Задача
 * без явного времени — это 23:59:59 по Києву, а не по таймзоне контейнера.
 */
export function endOfKyivDay(date: Date = new Date()): Date {
  const { year, month, day } = kyivDateParts(date);
  return zonedTimeToUtc(year, month, day, 23, 59, 59);
}

/** Конец дня, отстоящего от date на days календарных дней Києва (пресети переносу строку, FR-8.2). */
export function endOfKyivDayPlus(days: number, date: Date = new Date()): Date {
  const { year, month, day } = kyivDateParts(date);
  // Арифметика в UTC-«календаре» корректна для сдвига целых дней независимо
  // от зоны: переход через DST не меняет номер календарного дня.
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return zonedTimeToUtc(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate(), 23, 59, 59);
}

/** «Наступний тиждень» (FR-8.2) — +7 календарних днів по Києву, кінець дня. */
export function endOfNextKyivWeek(date: Date = new Date()): Date {
  return endOfKyivDayPlus(7, date);
}
