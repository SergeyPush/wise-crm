import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paginated, Priority, SnoozePreset, TaskType } from 'shared';
import { api } from '../../lib/api';
import { TaskItem } from './types';

/**
 * Перший файл-хук для задач (апі клієнтів досі інлайниться прямо в сторінках,
 * 09-implementation-plan.md, етап 3 — перший прецедент, далі так і продовжувати).
 */

export type TaskFilters = {
  assigneeId?: string; // uuid | "me" | "none"
  clientId?: string;
  type?: TaskType;
  status?: string; // "OPEN,IN_PROGRESS"
  dueBefore?: string;
  limit?: number;
};

function toQuery(filters: TaskFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export function useTasks(filters: TaskFilters) {
  return useQuery({
    queryKey: ['tasks', 'list', filters],
    queryFn: () => api.get<Paginated<TaskItem>>(`/tasks${toQuery({ limit: 200, ...filters })}`),
  });
}

/** Лічильник у сайдбарі: прострочені + сьогоднішні мої відкриті задачі (06-ui-layout.md). */
export function useMyDueTasksCount(enabled: boolean, dueBefore: string) {
  return useQuery({
    queryKey: ['tasks', 'count', 'due', dueBefore],
    queryFn: () =>
      api.get<Paginated<TaskItem>>(
        `/tasks${toQuery({ assigneeId: 'me', status: 'OPEN,IN_PROGRESS', dueBefore, limit: 1 })}`,
      ),
    select: (r) => r.total,
    enabled,
    refetchInterval: 60_000,
  });
}

function invalidateTasks(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['tasks'] });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      title: string;
      description?: string;
      type?: TaskType;
      priority?: Priority;
      clientId?: string;
      assigneeId?: string | null;
      dueAt?: string;
    }) => api.post<TaskItem>('/tasks', vars),
    onSuccess: () => invalidateTasks(qc),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; updatedAt: string; [key: string]: unknown }) => {
      const { id, ...rest } = vars;
      return api.patch<TaskItem>(`/tasks/${id}`, rest);
    },
    onSuccess: () => invalidateTasks(qc),
  });
}

export function useCompleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; result?: string }) => api.post<TaskItem>(`/tasks/${vars.id}/complete`, { result: vars.result }),
    onSuccess: () => invalidateTasks(qc),
  });
}

export function useCancelTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; reason: string }) => api.post<TaskItem>(`/tasks/${vars.id}/cancel`, { reason: vars.reason }),
    onSuccess: () => invalidateTasks(qc),
  });
}

export function useSnoozeTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; preset: SnoozePreset; date?: string }) =>
      api.post<TaskItem>(`/tasks/${vars.id}/snooze`, { preset: vars.preset, date: vars.date }),
    onSuccess: () => invalidateTasks(qc),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/tasks/${id}`),
    onSuccess: () => invalidateTasks(qc),
  });
}
