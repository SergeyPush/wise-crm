/** Форма ответов API задач (apps/api/src/modules/tasks). */
import { Priority, SnoozePreset, TaskStatus, TaskType } from 'shared';

export type TaskItem = {
  id: string;
  title: string;
  description: string | null;
  type: TaskType;
  status: TaskStatus;
  priority: Priority;
  dueAt: string | null;
  completedAt: string | null;
  result: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  client: { id: string; displayName: string } | null;
  assignee: { id: string; fullName: string } | null;
  author: { id: string; fullName: string } | null;
};

export type { SnoozePreset };

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  CALL: 'Дзвінок',
  PROPOSAL: 'КП',
  CONTRACT: 'Договір',
  DOCS: 'Документи',
  MEETING: 'Зустріч',
  OTHER: 'Інше',
};

export const SNOOZE_PRESET_LABELS: Record<SnoozePreset, string> = {
  today: 'Сьогодні',
  tomorrow: 'Завтра',
  in3days: '+3 дні',
  nextweek: 'Наступний тиждень',
  custom: 'Обрати дату…',
};
