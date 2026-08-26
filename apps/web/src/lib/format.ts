import dayjs from 'dayjs';
import 'dayjs/locale/uk';
import relativeTime from 'dayjs/plugin/relativeTime';
import { TaxSystem } from 'shared';

dayjs.extend(relativeTime);
dayjs.locale('uk');

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  return dayjs(iso).fromNow();
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
