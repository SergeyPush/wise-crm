import { CLIENT_TYPE_LABELS, TAX_SYSTEM_LABELS } from '../../lib/format';
import { PRIORITY_LABELS, TASK_TYPE_LABELS } from '../tasks/types';

/** Людські назви полів для diff'ів field_changed/task_updated (backlog
 * «Деталізація стрічки активності») — ключі збігаються з UpdateClientDto. */
export const CLIENT_FIELD_LABELS: Record<string, string> = {
  displayName: 'Назва',
  legalName: 'Юридична назва',
  type: 'Тип',
  edrpou: 'ЄДРПОУ',
  rnokpp: 'РНОКПП',
  vatNumber: 'ІПН платника ПДВ',
  isVatPayer: 'Платник ПДВ',
  vatRegDate: 'Дата реєстрації платником ПДВ',
  taxSystem: 'Система оподаткування',
  kved: 'КВЕД',
  employeeCount: 'Кількість працівників',
  documentsPerMonth: 'Документів на місяць',
  isDiiaCity: 'Дія.City',
  businessTypes: 'Види діяльності',
  legalAddress: 'Юридична адреса',
  actualAddress: 'Фактична адреса',
  sourceId: 'Джерело',
  monthlyFee: 'Абонплата',
  contractNo: 'Номер договору',
  contractDate: 'Дата договору',
  notes: 'Нотатки',
};

/** Ключі збігаються з UpdateTaskDto. */
export const TASK_FIELD_LABELS: Record<string, string> = {
  title: 'Заголовок',
  description: 'Опис',
  type: 'Тип',
  priority: 'Пріоритет',
  clientId: 'Клієнт',
  assigneeId: 'Виконавець',
  dueAt: 'Термін',
};

/** Ключі збігаються з ContactDto. */
export const CONTACT_FIELD_LABELS: Record<string, string> = {
  fullName: 'ПІБ',
  position: 'Посада',
  phone: 'Телефон',
  email: 'Email',
  isPrimary: 'Основний контакт',
};

const FIELD_LABELS_BY_ENTITY: Record<string, Record<string, string>> = {
  client: CLIENT_FIELD_LABELS,
  task: TASK_FIELD_LABELS,
  contact: CONTACT_FIELD_LABELS,
};

export function fieldLabel(entityType: string | undefined, field: string): string {
  const map: Record<string, string> = (entityType ? FIELD_LABELS_BY_ENTITY[entityType] : undefined) ?? {};
  return map[field] ?? field;
}

/** Форматує сире значення діфа під людське око — enum'и через існуючі
 * словники лейблів, дати/булеві/масиви окремо, решта — як є. */
export function formatFieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'type' && typeof value === 'string' && value in CLIENT_TYPE_LABELS) return CLIENT_TYPE_LABELS[value] ?? value;
  if (field === 'type' && typeof value === 'string' && value in TASK_TYPE_LABELS)
    return TASK_TYPE_LABELS[value as keyof typeof TASK_TYPE_LABELS] ?? value;
  if (field === 'taxSystem' && typeof value === 'string' && value in TAX_SYSTEM_LABELS)
    return TAX_SYSTEM_LABELS[value as keyof typeof TAX_SYSTEM_LABELS] ?? value;
  if (field === 'priority' && typeof value === 'string' && value in PRIORITY_LABELS)
    return PRIORITY_LABELS[value as keyof typeof PRIORITY_LABELS] ?? value;
  if (typeof value === 'boolean') return value ? 'так' : 'ні';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return new Date(value).toLocaleDateString('uk-UA');
  return String(value);
}
