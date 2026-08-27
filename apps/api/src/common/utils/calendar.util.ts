// Календарь Europe/Kyiv (FR-3.1.1). Логика границ суток общая для бэка и
// фронта (группировка задач «на клиенте») — живёт в packages/shared, здесь
// только реэкспорт, чтобы не переписывать существующие импорты в модулях.
export {
  startOfKyivDay,
  endOfKyivDay,
  endOfKyivDayPlus,
  endOfNextKyivWeek,
  kyivDateParts,
  kyivHour,
  isKyivQuietHours,
  isKyivWeekday,
} from 'shared';
