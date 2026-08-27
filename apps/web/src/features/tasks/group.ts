import { endOfKyivDay, endOfKyivDayPlus, startOfKyivDay } from 'shared';
import { TaskItem } from './types';

/**
 * Группировка по срокам считається на клієнті (09-implementation-plan.md,
 * етап 3) — бекенд віддає плоский список. «Пізніше» додано понад чотири
 * групи з макета 06-ui-layout.md: без нього задачі за межами тижня мовчки
 * потрапляли б у «Цього тижня» — оманливо.
 */
export type TaskGroup = 'overdue' | 'today' | 'week' | 'later' | 'none';

export const GROUP_LABELS: Record<TaskGroup, string> = {
  overdue: 'Прострочені',
  today: 'Сьогодні',
  week: 'Цього тижня',
  later: 'Пізніше',
  none: 'Без терміну',
};

export const GROUP_ORDER: TaskGroup[] = ['overdue', 'today', 'week', 'later', 'none'];

/** Згорнуті за замовчуванням — щоб на екран одразу лізло лише те, що горить. */
export const GROUP_COLLAPSED_BY_DEFAULT: Record<TaskGroup, boolean> = {
  overdue: false,
  today: false,
  week: true,
  later: true,
  none: true,
};

export function groupOf(task: TaskItem, now: Date = new Date()): TaskGroup {
  if (!task.dueAt) return 'none';
  const due = new Date(task.dueAt);
  if (due < startOfKyivDay(now)) return 'overdue';
  if (due <= endOfKyivDay(now)) return 'today';
  if (due <= endOfKyivDayPlus(7, now)) return 'week';
  return 'later';
}

export function groupTasks(tasks: TaskItem[], now: Date = new Date()): Record<TaskGroup, TaskItem[]> {
  const result: Record<TaskGroup, TaskItem[]> = { overdue: [], today: [], week: [], later: [], none: [] };
  for (const t of tasks) result[groupOf(t, now)].push(t);
  return result;
}
