import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconArchive,
  IconArchiveOff,
  IconBrandTelegram,
  IconCopy,
  IconDeviceMobileMessage,
  IconExternalLink,
  IconMessageCircle,
  IconPhone,
  IconTag,
  IconUserCheck,
  IconUserEdit,
} from '@tabler/icons-react';
import { Paginated } from 'shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { createElement } from 'react';
import { ApiRequestError, api } from '../../lib/api';
import { useMe } from '../auth/useAuth';
import { Action, divider } from '../registry/types';
import { notifyUndo } from '../registry/undoToast';
import { useCreateTask } from '../tasks/api';
import { openAddCommentModal, openContactLogModal, openStatusReasonModal } from './ClientModals';
import { ClientListItem } from './types';

const QUICK_TASKS: Array<{ title: string; type: 'CALL' | 'PROPOSAL' | 'CONTRACT' | 'DOCS' | 'OTHER' }> = [
  { title: 'Подзвонити', type: 'CALL' },
  { title: 'Підготувати КП', type: 'PROPOSAL' },
  { title: 'Підготувати договір', type: 'CONTRACT' },
  { title: 'Запросити документи', type: 'DOCS' },
  { title: 'Інше', type: 'OTHER' },
];

/** Патчить усі закешовані сторінки списку клієнтів одразу (FR-8.8: UI оновлюється миттєво). */
function patchClientCache(qc: ReturnType<typeof useQueryClient>, id: string, patch: Partial<ClientListItem>) {
  qc.setQueriesData<Paginated<ClientListItem>>({ queryKey: ['clients'], exact: false }, (old) => {
    if (!old) return old;
    return { ...old, items: old.items.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
  });
}

/**
 * FR-8.1 — реєстр дій рядка клієнтів. Той самий масив живить ПКМ, кнопку
 * «⋮» і тулбар масових дій (bulk: true) — FR-8.4.
 */
export function useClientActions(): Action<ClientListItem>[] {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const createTask = useCreateTask();

  const statuses = useQuery({
    queryKey: ['dictionaries', 'statuses'],
    queryFn: () =>
      api.get<Array<{ id: string; code: string; label: string; requiresReason: boolean }>>('/dictionaries/statuses'),
    staleTime: 5 * 60_000,
  });
  const users = useQuery({
    queryKey: ['users', 'lite'],
    queryFn: () => api.get<Array<{ id: string; fullName: string }>>('/users/lite'),
    staleTime: 60_000,
  });
  const tags = useQuery({
    queryKey: ['dictionaries', 'tags'],
    queryFn: () => api.get<Array<{ id: string; name: string }>>('/dictionaries/tags'),
    staleTime: 5 * 60_000,
  });

  const claim = useMutation({
    mutationFn: (id: string) => api.post<{ id: string }>(`/clients/${id}/claim`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['clients'] }),
  });
  const setAssignees = useMutation({
    mutationFn: (vars: { id: string; primaryId: string; secondaryIds: string[] }) =>
      api.put(`/clients/${vars.id}/assignees`, { primaryId: vars.primaryId, secondaryIds: vars.secondaryIds }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['clients'] }),
  });
  const changeStatus = useMutation({
    mutationFn: (vars: { id: string; statusId: string; reasonId?: string; comment?: string }) =>
      api.post(`/clients/${vars.id}/status`, { statusId: vars.statusId, reasonId: vars.reasonId, comment: vars.comment }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['clients'] }),
  });
  const addTag = useMutation({
    mutationFn: (vars: { id: string; tagId: string }) => api.post(`/clients/${vars.id}/tags`, { tagId: vars.tagId }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['clients'] }),
  });
  const contactLog = useMutation({
    mutationFn: (vars: { id: string; result: string }) => api.post(`/clients/${vars.id}/contact-log`, { result: vars.result }),
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({ queryKey: ['clients'] });
      void qc.invalidateQueries({ queryKey: ['clients', vars.id, 'activity'] });
    },
  });
  const addComment = useMutation({
    mutationFn: (vars: { id: string; body: string }) => api.post('/comments', { entityType: 'client', entityId: vars.id, body: vars.body }),
    onSuccess: (_, vars) => void qc.invalidateQueries({ queryKey: ['clients', vars.id, 'activity'] }),
  });
  const archive = useMutation({
    mutationFn: (id: string) => api.delete(`/clients/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['clients'] }),
  });
  const restore = useMutation({
    mutationFn: (id: string) => api.post(`/clients/${id}/restore`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['clients'] });
      notifications.show({ message: 'Клієнта відновлено', color: 'green' });
    },
    onError: (e) => {
      notifications.show({ color: 'red', message: e instanceof ApiRequestError ? e.message : 'Не вдалося відновити клієнта' });
    },
  });

  // FR-2.13/FR-8.3: масові дії — той самий /clients/bulk, часткова невдача
  // не блокує решту (сервіс повертає {succeeded, failed} замість кидання).
  const bulk = useMutation({
    mutationFn: (vars: { ids: string[]; action: 'setPrimary' | 'addTag' | 'setStatus'; statusId?: string; reasonId?: string; comment?: string; userId?: string; tagId?: string }) =>
      api.post<{ succeeded: number; failed: Array<{ id: string; error: string }> }>('/clients/bulk', vars),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['clients'] });
      if (res.failed.length > 0) {
        notifications.show({ color: 'orange', message: `Виконано для ${res.succeeded}, не вдалося для ${res.failed.length}` });
      } else {
        notifications.show({ color: 'green', message: `Застосовано до ${res.succeeded}` });
      }
    },
  });

  const copy = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    notifications.show({ message: `Скопійовано: ${label}`, color: 'gray', autoClose: 1500 });
  };

  const statusItems: Action<ClientListItem>[] = (statuses.data ?? []).map((s) => ({
    id: `status-${s.id}`,
    label: s.label,
    // FR-8.1: «підменю зі списком статусів, поточний відмічений» — disabled одразу
    // й позначає поточний, і не дає обрати те саме (мантіновський Menu.Item сірий).
    disabled: (ctx) => ctx.record?.status.code === s.code,
    run: (ctx) => {
      // Масові дії (FR-2.13): без «Скасувати» — компенсуючий запит на десятки
      // записів одразу не той сценарій, для якого робився 5-секундний тост.
      if (ctx.selection && ctx.selection.length > 0) {
        const ids = ctx.selection.map((c) => c.id);
        const apply = (reasonId?: string, comment?: string) => bulk.mutate({ ids, action: 'setStatus', statusId: s.id, reasonId, comment });
        if (s.requiresReason) openStatusReasonModal((reasonId, comment) => apply(reasonId, comment));
        else apply();
        return;
      }

      const client = ctx.record;
      if (!client) return;
      const prevStatus = client.status;
      const apply = (reasonId?: string, comment?: string) => {
        patchClientCache(qc, client.id, { status: { code: s.code, label: s.label, color: prevStatus.color, stage: prevStatus.stage } });
        changeStatus.mutate({ id: client.id, statusId: s.id, reasonId, comment });
        notifyUndo({
          message: `Статус змінено на «${s.label}»`,
          onUndo: () => {
            const prevFull = statuses.data?.find((x) => x.code === prevStatus.code);
            if (!prevFull) return;
            patchClientCache(qc, client.id, { status: prevStatus });
            changeStatus.mutate({ id: client.id, statusId: prevFull.id });
          },
        });
      };
      if (s.requiresReason) {
        openStatusReasonModal((reasonId, comment) => apply(reasonId, comment));
      } else {
        apply();
      }
    },
  }));

  const assigneeItems: Action<ClientListItem>[] = (users.data ?? []).map((u) => ({
    id: `assignee-${u.id}`,
    label: u.fullName,
    disabled: (ctx) => ctx.record?.assignees.some((a) => a.role === 'PRIMARY' && a.user.id === u.id) ?? false,
    run: (ctx) => {
      if (ctx.selection && ctx.selection.length > 0) {
        bulk.mutate({ ids: ctx.selection.map((c) => c.id), action: 'setPrimary', userId: u.id });
        return;
      }

      const client = ctx.record;
      if (!client) return;
      const prevAssignees = client.assignees;
      const secondaries = prevAssignees.filter((a) => a.role === 'SECONDARY').map((a) => a.user.id);

      patchClientCache(qc, client.id, {
        assignees: [{ role: 'PRIMARY', user: { id: u.id, fullName: u.fullName } }, ...prevAssignees.filter((a) => a.role === 'SECONDARY')],
      });
      setAssignees.mutate({ id: client.id, primaryId: u.id, secondaryIds: secondaries });
      notifyUndo({
        message: `Відповідальним призначено ${u.fullName}`,
        onUndo: () => {
          const prevPrimary = prevAssignees.find((a) => a.role === 'PRIMARY');
          if (!prevPrimary) return;
          patchClientCache(qc, client.id, { assignees: prevAssignees });
          setAssignees.mutate({ id: client.id, primaryId: prevPrimary.user.id, secondaryIds: secondaries });
        },
      });
    },
  }));

  const tagItems: Action<ClientListItem>[] = (tags.data ?? []).map((t) => ({
    id: `tag-${t.id}`,
    label: t.name,
    hidden: (ctx) => ctx.record?.tags.some((rt) => rt.tag.id === t.id) ?? false,
    run: (ctx) => {
      if (ctx.selection && ctx.selection.length > 0) {
        bulk.mutate({ ids: ctx.selection.map((c) => c.id), action: 'addTag', tagId: t.id });
        return;
      }
      if (ctx.record) addTag.mutate({ id: ctx.record.id, tagId: t.id });
    },
  }));

  const taskItems: Action<ClientListItem>[] = QUICK_TASKS.map((qt) => ({
    id: `task-${qt.type}`,
    label: qt.title,
    run: (ctx) => {
      if (!me) return;
      // /clients/bulk не покриває задачі (їх нема у FR-2.13) — тут просто по
      // одному запиту на кожного, як і POST /tasks поза масовими діями.
      // allSettled + підсумковий тост — той самий UX, що й у решти bulk-дій
      // (mutate() без чекання відповіді інакше падає мовчки, непомітно для користувача)
      if (ctx.selection && ctx.selection.length > 0) {
        const ids = ctx.selection.map((c) => c.id);
        void Promise.allSettled(
          ids.map((clientId) => createTask.mutateAsync({ title: qt.title, type: qt.type, clientId, assigneeId: me.id })),
        ).then((results) => {
          const failedCount = results.filter((r) => r.status === 'rejected').length;
          if (failedCount > 0) {
            notifications.show({ color: 'orange', message: `Задачу створено для ${ids.length - failedCount}, не вдалося для ${failedCount}` });
          } else {
            notifications.show({ color: 'green', message: `Задачу створено для ${ids.length}` });
          }
        });
        return;
      }
      if (ctx.record) createTask.mutate({ title: qt.title, type: qt.type, clientId: ctx.record.id, assigneeId: me.id });
    },
  }));

  const copyItems: Action<ClientListItem>[] = [
    {
      id: 'copy-phone',
      label: 'Телефон',
      hidden: (ctx) => !ctx.record?.contacts[0]?.phone,
      run: (ctx) => {
        const phone = ctx.record?.contacts[0]?.phone;
        if (phone) copy(phone, 'телефон');
      },
    },
    {
      id: 'copy-email',
      label: 'Email',
      hidden: (ctx) => !ctx.record?.contacts[0]?.email,
      run: (ctx) => {
        const email = ctx.record?.contacts[0]?.email;
        if (email) copy(email, 'email');
      },
    },
    {
      id: 'copy-edrpou',
      label: 'ЄДРПОУ/РНОКПП',
      hidden: (ctx) => !ctx.record?.edrpou && !ctx.record?.rnokpp,
      run: (ctx) => {
        const value = ctx.record?.edrpou ?? ctx.record?.rnokpp;
        if (value) copy(value, 'ЄДРПОУ/РНОКПП');
      },
    },
    {
      id: 'copy-name',
      label: 'Назву',
      run: (ctx) => {
        if (ctx.record) copy(ctx.record.displayName, 'назву');
      },
    },
    {
      id: 'copy-link',
      label: 'Посилання на картку',
      run: (ctx) => {
        if (ctx.record) copy(`${window.location.origin}/clients/${ctx.record.id}`, 'посилання');
      },
    },
  ];

  return [
    {
      id: 'open',
      label: 'Відкрити',
      hotkey: 'Enter',
      run: (ctx) => {
        if (ctx.record) void navigate({ to: '/clients/$clientId', params: { clientId: ctx.record.id } });
      },
    },
    {
      id: 'open-new-tab',
      label: 'Відкрити в новій вкладці',
      icon: createElement(IconExternalLink, { size: 14 }),
      run: (ctx) => {
        if (ctx.record) window.open(`/clients/${ctx.record.id}`, '_blank');
      },
    },
    divider('div-open'),
    {
      id: 'claim',
      label: 'Взяти в роботу',
      icon: createElement(IconUserCheck, { size: 14 }),
      // Архівний клієнт: дії, що пишуть у нього, ховаємо — сервер однаково
      // відмовить 404-ю (deletedAt), а тут просто нема чого показувати
      hidden: (ctx) => Boolean(ctx.record?.deletedAt) || (ctx.record?.assignees.some((a) => a.role === 'PRIMARY' && a.user.id === me?.id) ?? false),
      run: (ctx) => {
        if (ctx.record) claim.mutate(ctx.record.id);
      },
    },
    {
      id: 'contact-log',
      label: 'Зафіксувати контакт',
      icon: createElement(IconPhone, { size: 14 }),
      hidden: (ctx) => Boolean(ctx.record?.deletedAt),
      run: (ctx) => {
        const client = ctx.record;
        if (!client) return;
        openContactLogModal((result) => contactLog.mutate({ id: client.id, result }));
      },
    },
    { id: 'create-task', label: 'Створити задачу', bulk: true, hidden: (ctx) => Boolean(ctx.record?.deletedAt), items: taskItems },
    { id: 'change-status', label: 'Змінити статус', bulk: true, hidden: (ctx) => Boolean(ctx.record?.deletedAt), items: statusItems },
    {
      id: 'change-assignee',
      label: 'Змінити відповідального',
      icon: createElement(IconUserEdit, { size: 14 }),
      bulk: true,
      hidden: (ctx) => Boolean(ctx.record?.deletedAt),
      items: assigneeItems,
    },
    {
      id: 'add-comment',
      label: 'Додати коментар',
      icon: createElement(IconMessageCircle, { size: 14 }),
      hidden: (ctx) => Boolean(ctx.record?.deletedAt),
      run: (ctx) => {
        const client = ctx.record;
        if (!client) return;
        openAddCommentModal((body) => addComment.mutate({ id: client.id, body }));
      },
    },
    {
      id: 'add-tag',
      label: 'Додати тег',
      icon: createElement(IconTag, { size: 14 }),
      bulk: true,
      hidden: (ctx) => tagItems.length === 0 || Boolean(ctx.record?.deletedAt),
      items: tagItems,
    },
    divider('div-copy'),
    { id: 'copy', label: 'Копіювати', icon: createElement(IconCopy, { size: 14 }), items: copyItems },
    {
      id: 'call',
      label: 'Подзвонити',
      icon: createElement(IconPhone, { size: 14 }),
      hidden: (ctx) => !ctx.record?.contacts[0]?.phone,
      run: (ctx) => {
        if (ctx.record?.contacts[0]?.phone) window.location.href = `tel:${ctx.record.contacts[0].phone}`;
      },
    },
    {
      id: 'telegram',
      label: 'Написати в Telegram',
      icon: createElement(IconBrandTelegram, { size: 14 }),
      hidden: (ctx) => !ctx.record?.contacts[0]?.phone,
      run: (ctx) => {
        const phone = ctx.record?.contacts[0]?.phone;
        if (phone) window.open(`https://t.me/${phone.replace(/\D/g, '')}`, '_blank');
      },
    },
    {
      id: 'viber',
      label: 'Написати в Viber',
      icon: createElement(IconDeviceMobileMessage, { size: 14 }),
      hidden: (ctx) => !ctx.record?.contacts[0]?.phone,
      run: (ctx) => {
        const phone = ctx.record?.contacts[0]?.phone;
        if (phone) window.location.href = `viber://chat?number=%2B${phone.replace(/\D/g, '')}`;
      },
    },
    divider('div-danger'),
    {
      id: 'archive',
      label: 'Архівувати',
      icon: createElement(IconArchive, { size: 14 }),
      danger: true,
      // FR-8.1: пара з «Відновити» — показуємо лише один з двох, залежно від deletedAt
      hidden: (ctx) => ctx.user.role !== 'ADMIN' || Boolean(ctx.record?.deletedAt),
      run: (ctx) => {
        const client = ctx.record;
        if (!client) return;
        modals.openConfirmModal({
          title: 'Архівувати клієнта?',
          children: `«${client.displayName}» зникне зі списків. Відновити можна на вкладці «Архів».`,
          labels: { confirm: 'Архівувати', cancel: 'Відміна' },
          confirmProps: { color: 'red' },
          onConfirm: () => archive.mutate(client.id),
        });
      },
    },
    {
      id: 'restore',
      label: 'Відновити',
      icon: createElement(IconArchiveOff, { size: 14 }),
      hidden: (ctx) => ctx.user.role !== 'ADMIN' || !ctx.record?.deletedAt,
      run: (ctx) => {
        if (ctx.record) restore.mutate(ctx.record.id);
      },
    },
  ];
}
