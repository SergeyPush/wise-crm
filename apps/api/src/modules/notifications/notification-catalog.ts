import { Priority } from 'shared';

export type NotificationCatalogEntry = {
  priority: Priority;
  /** FR-4.4: дефолти каналів — «один тумблер», а не матриця «подія × канал». */
  telegram: boolean;
};

/**
 * FR-4.5: пріоритет — властивість події, а не задачі. Тут — статичний
 * дефолт per-type; там, де пріоритет залежить від контексту (задача на
 * сьогодні, задача прострочена > 3 днів), сервіс-джерело передає `priority`
 * явно в `NotificationInput`, і він переважає запис із каталогу.
 */
const NOTIFICATION_CATALOG: Record<string, NotificationCatalogEntry> = {
  password_reset: { priority: Priority.HIGH, telegram: true },
  task_overdue: { priority: Priority.HIGH, telegram: true },
  task_assigned: { priority: Priority.NORMAL, telegram: true },
  web_lead: { priority: Priority.NORMAL, telegram: true },
  web_lead_repeat: { priority: Priority.NORMAL, telegram: false },
  mention: { priority: Priority.NORMAL, telegram: false },
  client_reassigned: { priority: Priority.NORMAL, telegram: false },
  status_changed: { priority: Priority.LOW, telegram: false },
  digest: { priority: Priority.NORMAL, telegram: true },
  leads_inactive_digest: { priority: Priority.NORMAL, telegram: true },
  user_deactivated: { priority: Priority.LOW, telegram: false },
  file_quota_exceeded: { priority: Priority.LOW, telegram: false },
};

const DEFAULT_ENTRY: NotificationCatalogEntry = { priority: Priority.NORMAL, telegram: false };

export function catalogEntry(type: string): NotificationCatalogEntry {
  return NOTIFICATION_CATALOG[type] ?? DEFAULT_ENTRY;
}
