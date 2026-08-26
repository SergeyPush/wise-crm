import { Button, Center, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconInbox } from '@tabler/icons-react';
import type { ReactNode } from 'react';

/**
 * Одна из восьми обёрток (06-ui-layout.md). Пустое состояние обязательно
 * на каждом экране, иначе первый рабочий день выглядит как сломанная система.
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Center py="xl">
      <Stack align="center" gap="xs" maw={420}>
        <ThemeIcon size={56} radius="xl" variant="light" color="gray">
          {icon ?? <IconInbox size={28} />}
        </ThemeIcon>
        <Title order={4}>{title}</Title>
        {description && (
          <Text c="dimmed" size="sm" ta="center">
            {description}
          </Text>
        )}
        {action}
      </Stack>
    </Center>
  );
}

/** Ошибка всегда показывает код запроса — по нему находится строка в логе (NFR-31.2). */
export function ErrorState({
  message,
  requestId,
  onRetry,
}: {
  message: string;
  requestId?: string;
  onRetry?: () => void;
}) {
  return (
    <Center py="xl">
      <Stack align="center" gap="xs" maw={420}>
        <Title order={4}>Сталася помилка</Title>
        <Text size="sm" ta="center">
          {message}
        </Text>
        {requestId && (
          <Text size="xs" c="dimmed">
            Код: {requestId}
          </Text>
        )}
        {onRetry && (
          <Button variant="light" onClick={onRetry}>
            Спробувати ще раз
          </Button>
        )}
      </Stack>
    </Center>
  );
}
