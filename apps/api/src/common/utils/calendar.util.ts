import { endOfDay } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { TIMEZONE } from 'shared';

/**
 * Конец календарного дня Europe/Kyiv как момент UTC (FR-3.1.1). Используется
 * для задач без явного времени: «сьогодні» — это 23:59:59 по Києву, а не по
 * системной таймзоне контейнера.
 */
export function endOfKyivDay(date: Date = new Date()): Date {
  const zoned = toZonedTime(date, TIMEZONE);
  return fromZonedTime(endOfDay(zoned), TIMEZONE);
}
