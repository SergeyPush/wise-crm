import { kyivDateParts } from 'shared';

/** Один день сітки місячного календаря (backlog «Календар задач»). */
export type CalendarCell = {
  /** Опівнічний UTC-момент цього календарного дня Києва — саме такий вигляд
   * очікують startOfKyivDay/endOfKyivDay з shared (той самий трюк, що й у
   * endOfKyivDayPlus): будь-яка мить у межах доби працює однаково коректно. */
  date: Date;
  year: number;
  month: number; // 1-12
  day: number;
  inMonth: boolean;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function dayKey(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Сітка тижнів (Пн—Нд) для місяця year/month (1-12), завжди 6 рядків × 7 —
 * стабільна висота незалежно від того, скільки тижнів захоплює конкретний
 * місяць, щоб перемикання місяців не смикало розмір сітки.
 */
export function buildMonthGrid(year: number, month: number): CalendarCell[] {
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  // getUTCDay(): 0 — неділя. Зсув до понеділка як початку тижня (FR-6, UI макет).
  const firstWeekday = (firstOfMonth.getUTCDay() + 6) % 7;
  const gridStartOffset = -firstWeekday;

  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(Date.UTC(year, month - 1, 1 + gridStartOffset + i));
    const parts = kyivDateParts(date);
    cells.push({ date, ...parts, inMonth: parts.month === month });
  }
  return cells;
}

export const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

export const MONTH_LABELS = [
  'Січень',
  'Лютий',
  'Березень',
  'Квітень',
  'Травень',
  'Червень',
  'Липень',
  'Серпень',
  'Вересень',
  'Жовтень',
  'Листопад',
  'Грудень',
];
