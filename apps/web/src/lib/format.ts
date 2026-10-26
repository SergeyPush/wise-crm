import dayjs from 'dayjs';
import 'dayjs/locale/uk';
import relativeTime from 'dayjs/plugin/relativeTime';
import { TaxSystem, kyivDateParts } from 'shared';

dayjs.extend(relativeTime);
dayjs.locale('uk');

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  return dayjs(iso).fromNow();
}

// дд.мм.рррр по Києву — щоб запис о 00:30 не показувався попереднім днем
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const { year, month, day } = kyivDateParts(new Date(iso));
  return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
}

export const TAX_SYSTEM_LABELS: Record<TaxSystem, string> = {
  GENERAL: 'Загальна',
  EP1: 'ЄП 1 гр.',
  EP2: 'ЄП 2 гр.',
  EP3_5: 'ЄП 3 гр. 5%',
  EP3_3_VAT: 'ЄП 3 гр. 3% + ПДВ',
  EP4: 'ЄП 4 гр.',
};

export const CLIENT_TYPE_LABELS: Record<string, string> = {
  COMPANY: 'ТОВ',
  FOP: 'ФОП',
  PERSON: 'Фізособа',
  OTHER: 'Інше',
};
