import { notifications } from '@mantine/notifications';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ApiRequestError, api } from '../../lib/api';
import { NotificationItem } from './types';

/**
 * FR-4.1: polling раз на 60 с, `since` — дельта. Список накопичується на
 * фронті (бекенд віддає лише нові записи), `unreadCount` завжди повний —
 * рахується на сервері з нуля при кожному запиті.
 */
export function useNotifications() {
  const cursorRef = useRef<string | undefined>(undefined);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const query = useQuery({
    queryKey: ['notifications', 'poll'],
    queryFn: () =>
      api.get<{ items: NotificationItem[]; unreadCount: number }>(
        `/notifications${cursorRef.current ? `?since=${encodeURIComponent(cursorRef.current)}` : ''}`,
      ),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!query.data) return;
    setUnreadCount(query.data.unreadCount);
    if (query.data.items.length > 0) {
      setItems((prev) => {
        const known = new Set(prev.map((i) => i.id));
        const fresh = query.data!.items.filter((i) => !known.has(i.id));
        return [...fresh, ...prev];
      });
      // Курсор — найновіший `createdAt` серед побачених, а не момент запиту
      cursorRef.current = query.data.items[0]?.createdAt ?? cursorRef.current;
    }
  }, [query.data]);

  const markAllRead = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => {
      const now = new Date().toISOString();
      setItems((prev) => prev.map((i) => ({ ...i, readAt: i.readAt ?? now })));
      setUnreadCount(0);
    },
    onError: (e) =>
      notifications.show({
        color: 'red',
        message: e instanceof ApiRequestError ? e.message : 'Не вдалося позначити сповіщення прочитаними',
      }),
  });

  return { items, unreadCount, isLoading: query.isLoading, markAllRead };
}
