import { modals } from '@mantine/modals';
import {
  IconCalendarTime,
  IconCheck,
  IconExternalLink,
  IconTrash,
  IconUserCheck,
  IconUserEdit,
  IconX,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { createElement } from 'react';
import { SNOOZE_PRESETS, SnoozePreset } from 'shared';
import { api } from '../../lib/api';
import { useMe } from '../auth/useAuth';
import { Action, divider } from '../registry/types';
import { notifyUndo } from '../registry/undoToast';
import { useCancelTask, useCompleteTask, useDeleteTask, useSnoozeTask, useUpdateTask } from './api';
import { openCancelTaskModal, openCompleteTaskModal, openCustomSnoozeModal } from './TaskModals';
import { SNOOZE_PRESET_LABELS, TaskItem } from './types';

const OPEN_STATUSES = new Set(['OPEN', 'IN_PROGRESS']);

/**
 * FR-8.2 — той самий реєстр живить ПКМ по задачі, кнопку «⋮» і хоткеї.
 * Права рахуються тут один раз (FR-8.4): guard на сервері все одно
 * перевірить — фронт лише ховає недоречне.
 */
export function useTaskActions(): Action<TaskItem>[] {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const complete = useCompleteTask();
  const cancel = useCancelTask();
  const snooze = useSnoozeTask();
  const update = useUpdateTask();
  const del = useDeleteTask();

  const users = useQuery({
    queryKey: ['users', 'lite'],
    queryFn: () => api.get<Array<{ id: string; fullName: string }>>('/users/lite'),
    staleTime: 60_000,
  });

  const snoozeItems: Action<TaskItem>[] = SNOOZE_PRESETS.map((preset: SnoozePreset) => ({
    id: `snooze-${preset}`,
    label: SNOOZE_PRESET_LABELS[preset],
    run: (ctx) => {
      const task = ctx.record;
      if (!task) return;
      const prevDueAt = task.dueAt;

      const apply = (p: SnoozePreset, date?: string) => {
        snooze.mutate({ id: task.id, preset: p, date });
        notifyUndo({
          message: 'Термін перенесено',
          onUndo: () => {
            if (prevDueAt) {
              // «Скасувати» — звичайний повторний виклик snooze(custom) зі старою датою:
              // друга запис в аудиті природна (FR-7.3), окремого compensating-ендпоінта нема.
              snooze.mutate({ id: task.id, preset: 'custom', date: prevDueAt.slice(0, 10) });
            }
          },
        });
      };

      if (preset === 'custom') {
        openCustomSnoozeModal((date) => apply('custom', date));
      } else {
        apply(preset);
      }
    },
  }));

  const reassignItems: Action<TaskItem>[] = (users.data ?? []).map((u) => ({
    id: `reassign-${u.id}`,
    label: u.fullName,
    hidden: (ctx) => ctx.record?.assignee?.id === u.id,
    run: (ctx) => {
      const task = ctx.record;
      if (!task) return;
      update.mutate({ id: task.id, updatedAt: task.updatedAt, assigneeId: u.id });
    },
  }));

  return [
    {
      id: 'open',
      label: 'Відкрити клієнта',
      icon: createElement(IconExternalLink, { size: 14 }),
      hidden: (ctx) => !ctx.record?.client,
      run: (ctx) => {
        if (ctx.record?.client) void navigate({ to: '/clients/$clientId', params: { clientId: ctx.record.client.id } });
      },
    },
    {
      id: 'complete',
      label: 'Завершити',
      icon: createElement(IconCheck, { size: 14 }),
      hidden: (ctx) => !ctx.record || !OPEN_STATUSES.has(ctx.record.status),
      run: (ctx) => {
        const task = ctx.record;
        if (!task) return;
        openCompleteTaskModal(task.type, (result) => complete.mutate({ id: task.id, result }));
      },
    },
    {
      id: 'claim',
      label: 'Взяти в роботу',
      icon: createElement(IconUserCheck, { size: 14 }),
      hidden: (ctx) => !ctx.record || ctx.record.assignee !== null || !OPEN_STATUSES.has(ctx.record.status),
      run: (ctx) => {
        const task = ctx.record;
        if (!task || !me) return;
        update.mutate({ id: task.id, updatedAt: task.updatedAt, assigneeId: me.id });
      },
    },
    {
      id: 'snooze',
      label: 'Перенести термін',
      icon: createElement(IconCalendarTime, { size: 14 }),
      hidden: (ctx) => !ctx.record || !OPEN_STATUSES.has(ctx.record.status),
      items: snoozeItems,
    },
    {
      id: 'reassign',
      label: 'Перепризначити',
      icon: createElement(IconUserEdit, { size: 14 }),
      hidden: (ctx) => !ctx.record || !OPEN_STATUSES.has(ctx.record.status) || reassignItems.length === 0,
      items: reassignItems,
    },
    divider('div-1'),
    {
      id: 'cancel',
      label: 'Скасувати',
      icon: createElement(IconX, { size: 14 }),
      hidden: (ctx) => !ctx.record || !OPEN_STATUSES.has(ctx.record.status),
      run: (ctx) => {
        const task = ctx.record;
        if (!task) return;
        openCancelTaskModal((reason) => cancel.mutate({ id: task.id, reason }));
      },
    },
    {
      id: 'delete',
      label: 'Видалити',
      icon: createElement(IconTrash, { size: 14 }),
      danger: true,
      // FR-3.8: автор або ADMIN — той самий контур, що й на сервері, права дублюємо для UX
      hidden: (ctx) => !ctx.record || !me || (ctx.record.author?.id !== me.id && me.role !== 'ADMIN'),
      run: (ctx) => {
        const task = ctx.record;
        if (!task) return;
        modals.openConfirmModal({
          title: 'Видалити задачу?',
          children: 'Задачу можна видалити лише разом з усією її історією — дію не можна скасувати.',
          labels: { confirm: 'Видалити', cancel: 'Відміна' },
          confirmProps: { color: 'red' },
          onConfirm: () => del.mutate(task.id),
        });
      },
    },
  ];
}
