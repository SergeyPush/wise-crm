import { describe, expect, it } from 'vitest';
import {
  endOfKyivDay,
  endOfKyivDayPlus,
  endOfNextKyivWeek,
  isKyivQuietHours,
  isKyivWeekday,
  kyivDateParts,
  kyivHour,
  startOfKyivDay,
} from './kyiv-date';

/**
 * Класична пастка (09-implementation-plan.md, розділ 5.1): наївний розрахунок
 * у контейнері з TZ=UTC після 21:00 переносить «сьогоднішні» задачі на завтра.
 * Перевіряємо межі доби і перехід на літній/зимовий час окремо.
 */
describe('kyivDateParts', () => {
  it('зимовий час: UTC+2', () => {
    // 2026-01-15 22:30 UTC = 2026-01-16 00:30 Києва
    expect(kyivDateParts(new Date('2026-01-15T22:30:00Z'))).toEqual({ year: 2026, month: 1, day: 16 });
  });

  it('літній час: UTC+3', () => {
    // 2026-07-15 21:30 UTC = 2026-07-16 00:30 Києва
    expect(kyivDateParts(new Date('2026-07-15T21:30:00Z'))).toEqual({ year: 2026, month: 7, day: 16 });
  });
});

describe('startOfKyivDay / endOfKyivDay', () => {
  it('початок доби — 00:00 за Києвом (зима, UTC+2)', () => {
    const start = startOfKyivDay(new Date('2026-01-16T10:00:00Z'));
    expect(start.toISOString()).toBe('2026-01-15T22:00:00.000Z');
  });

  it('кінець доби — 23:59:59 за Києвом (зима, UTC+2)', () => {
    const end = endOfKyivDay(new Date('2026-01-16T10:00:00Z'));
    expect(end.toISOString()).toBe('2026-01-16T21:59:59.000Z');
  });

  it('кінець доби — 23:59:59 за Києвом (літо, UTC+3)', () => {
    const end = endOfKyivDay(new Date('2026-07-16T10:00:00Z'));
    expect(end.toISOString()).toBe('2026-07-16T20:59:59.000Z');
  });

  it('доба після 21:00 за Києвом лишається сьогоднішньою, а не переноситься', () => {
    // 23:30 за Києвом (зима) — це усе ще 16 січня, «кінець дня» не має стрибнути на 17-те
    const localLateEvening = new Date('2026-01-16T21:30:00Z');
    expect(kyivDateParts(localLateEvening)).toEqual({ year: 2026, month: 1, day: 16 });
    expect(endOfKyivDay(localLateEvening).toISOString()).toBe('2026-01-16T21:59:59.000Z');
  });
});

describe('перехід на літній/зимовий час — останні неділі березня й жовтня', () => {
  it('перехід на літній час (29.03.2026, 03:00 → 04:00) не зсуває дедлайн дня', () => {
    // День переходу все одно триває 24 астрономічні години в UTC-обчисленні
    // меж доби — «кінець дня» лишається 23:59:59 за новим (літнім) зсувом.
    const end = endOfKyivDay(new Date('2026-03-29T12:00:00Z'));
    expect(end.toISOString()).toBe('2026-03-29T20:59:59.000Z'); // UTC+3 вже діє
  });

  it('перехід на зимовий час (25.10.2026) — кінець дня за новим (зимовим) зсувом', () => {
    const end = endOfKyivDay(new Date('2026-10-25T12:00:00Z'));
    expect(end.toISOString()).toBe('2026-10-25T21:59:59.000Z'); // UTC+2 вже діє
  });
});

describe('пресети переносу строку (FR-8.2)', () => {
  const today = new Date('2026-01-16T10:00:00Z'); // 12:00 за Києвом, зима

  it('«завтра» — +1 день, кінець дня за Києвом', () => {
    expect(endOfKyivDayPlus(1, today).toISOString()).toBe('2026-01-17T21:59:59.000Z');
  });

  it('«+3 дні»', () => {
    expect(endOfKyivDayPlus(3, today).toISOString()).toBe('2026-01-19T21:59:59.000Z');
  });

  it('«наступний тиждень» — +7 днів', () => {
    expect(endOfNextKyivWeek(today).toISOString()).toBe(endOfKyivDayPlus(7, today).toISOString());
    expect(endOfNextKyivWeek(today).toISOString()).toBe('2026-01-23T21:59:59.000Z');
  });

  it('зсув через межу місяця й переходу на літній час', () => {
    // 28.03.2026 (зима, UTC+2) + 3 дні = 31.03.2026 (уже літо, UTC+3)
    expect(endOfKyivDayPlus(3, new Date('2026-03-28T10:00:00Z')).toISOString()).toBe('2026-03-31T20:59:59.000Z');
  });
});

describe('тихі часи 20:00–08:00 за Києвом (FR-4.5.1)', () => {
  it('19:59 — ще не тихі часи', () => {
    // 2026-01-16T17:59Z = 19:59 Києва (зима, UTC+2)
    expect(kyivHour(new Date('2026-01-16T17:59:00Z'))).toBe(19);
    expect(isKyivQuietHours(new Date('2026-01-16T17:59:00Z'))).toBe(false);
  });

  it('20:00 — вже тихі часи', () => {
    expect(isKyivQuietHours(new Date('2026-01-16T18:00:00Z'))).toBe(true);
  });

  it('07:59 — ще тихі часи, 08:00 — вже ні', () => {
    expect(isKyivQuietHours(new Date('2026-01-16T05:59:00Z'))).toBe(true);
    expect(isKyivQuietHours(new Date('2026-01-16T06:00:00Z'))).toBe(false);
  });
});

describe('isKyivWeekday (FR-4.5.2: дайджест лише в будні)', () => {
  it('п’ятниця — будній день', () => {
    expect(isKyivWeekday(new Date('2026-01-16T10:00:00Z'))).toBe(true); // 16.01.2026 — пʼятниця
  });

  it('субота і неділя — вихідні', () => {
    expect(isKyivWeekday(new Date('2026-01-17T10:00:00Z'))).toBe(false); // субота
    expect(isKyivWeekday(new Date('2026-01-18T10:00:00Z'))).toBe(false); // неділя
  });

  it('пізній вечір п’ятниці за Києвом — все ще будній день, а не субота', () => {
    // 2026-01-16T22:30Z = 00:30 Києва 17.01 (субота) — межа доби, а не UTC
    expect(isKyivWeekday(new Date('2026-01-16T22:30:00Z'))).toBe(false);
  });
});
