import { Priority } from 'shared';

/** Форма відповіді GET /notifications (apps/api/src/modules/notifications). */
export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  link: string | null;
  priority: Priority;
  readAt: string | null;
  createdAt: string;
};
