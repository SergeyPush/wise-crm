import { ActionIcon, Box, Button, Divider, Group, Indicator, Popover, ScrollArea, Stack, Text } from '@mantine/core';
import { IconBell, IconBellRinging } from '@tabler/icons-react';
import { useState } from 'react';
import { formatRelative } from '../../lib/format';
import { EmptyState } from '../../components/EmptyState';
import { useNotifications } from './api';
import { NotificationItem } from './types';

/**
 * Дзвіночок у хедері (06-ui-layout.md). Індивідуального «прочитано» немає —
 * лише масове (`POST /notifications/read-all`, розділ 1 плану): це UX-спрощення,
 * а не недогляд.
 */
export function NotificationBell() {
  const [opened, setOpened] = useState(false);
  const { items, unreadCount, isLoading, markAllRead } = useNotifications();

  return (
    <Popover width={360} position="bottom-end" opened={opened} onChange={setOpened} shadow="md">
      <Popover.Target>
        <Indicator disabled={unreadCount === 0} label={unreadCount > 99 ? '99+' : unreadCount} size={16} color="red" offset={4}>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="lg"
            onClick={() => setOpened((v) => !v)}
            aria-label="Сповіщення"
          >
            {unreadCount > 0 ? <IconBellRinging size={20} /> : <IconBell size={20} />}
          </ActionIcon>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown p={0}>
        <Group justify="space-between" p="sm">
          <Text fw={600} size="sm">
            Сповіщення
          </Text>
          {unreadCount > 0 && (
            <Button size="compact-xs" variant="subtle" loading={markAllRead.isPending} onClick={() => markAllRead.mutate()}>
              Позначити всі прочитаними
            </Button>
          )}
        </Group>
        <Divider />
        <ScrollArea.Autosize mah={420}>
          {isLoading && items.length === 0 ? (
            <Box p="md">
              <Text size="sm" c="dimmed">
                Завантаження…
              </Text>
            </Box>
          ) : items.length === 0 ? (
            <EmptyState title="Сповіщень немає" description="Тут з'являться призначені задачі, згадки й заявки з сайту" />
          ) : (
            <Stack gap={0}>
              {items.map((n) => (
                <NotificationRow
                  key={n.id}
                  item={n}
                  onOpen={() => {
                    setOpened(false);
                    // Посилання приходить із сервера довільним рядком — типізований
                    // роутер тут не застосувати, звичайна навігація браузером надійніша
                    if (n.link) window.location.assign(n.link);
                  }}
                />
              ))}
            </Stack>
          )}
        </ScrollArea.Autosize>
      </Popover.Dropdown>
    </Popover>
  );
}

function NotificationRow({ item, onOpen }: { item: NotificationItem; onOpen: () => void }) {
  const isUnread = !item.readAt;
  return (
    <Box
      p="sm"
      onClick={item.link ? onOpen : undefined}
      style={{
        cursor: item.link ? 'pointer' : 'default',
        borderBottom: '1px solid var(--mantine-color-gray-2)',
        backgroundColor: isUnread ? 'var(--mantine-color-blue-0)' : undefined,
      }}
    >
      <Group gap="xs" wrap="nowrap" align="flex-start">
        <Box
          mt={6}
          w={8}
          h={8}
          style={{ borderRadius: '50%', flexShrink: 0 }}
          bg={item.priority === 'HIGH' ? 'red' : isUnread ? 'blue' : 'transparent'}
        />
        <Stack gap={2}>
          <Text size="sm">{item.title}</Text>
          {item.body && (
            <Text size="xs" c="dimmed" lineClamp={2}>
              {item.body}
            </Text>
          )}
          <Text size="xs" c="dimmed">
            {formatRelative(item.createdAt)}
          </Text>
        </Stack>
      </Group>
    </Box>
  );
}
