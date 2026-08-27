import { Badge, Group, Loader, Modal, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { useDebouncedValue, useDisclosure, useHotkeys } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Paginated } from 'shared';
import { ApiRequestError, api } from '../lib/api';
import { ClientListItem } from '../features/clients/types';

/**
 * FR-8.9 — глобальні хоткеї поверх того самого пошуку, що й на екрані
 * клієнтів: `Ctrl/Cmd+K` і `/` відкривають одне й те саме вікно з будь-якого
 * екрана. Одиночні букви (C/T/E/S) — v1.1: реєстр дій і ПКМ дають те саме
 * видимим способом.
 */
export function GlobalSearch() {
  const [opened, { open, close }] = useDisclosure(false);
  const [q, setQ] = useState('');
  const [debounced] = useDebouncedValue(q, 250);
  const navigate = useNavigate();

  useHotkeys([
    ['mod+K', () => open()],
    ['/', () => open()],
  ]);

  const query = useQuery({
    queryKey: ['global-search', debounced],
    queryFn: () => api.get<Paginated<ClientListItem>>(`/clients?limit=8&q=${encodeURIComponent(debounced)}`),
    enabled: opened && debounced.length >= 2,
  });

  const handleClose = () => {
    close();
    setQ('');
  };

  const goTo = (id: string) => {
    handleClose();
    void navigate({ to: '/clients/$clientId', params: { clientId: id } });
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="Пошук клієнтів" size="md" centered>
      <Stack gap="sm">
        <TextInput
          leftSection={<IconSearch size={16} />}
          placeholder="Назва, телефон, ЄДРПОУ/РНОКПП"
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          data-autofocus
        />
        {debounced.length < 2 ? (
          <Text size="sm" c="dimmed">
            Введіть мінімум 2 символи
          </Text>
        ) : query.isFetching ? (
          <Group justify="center" py="sm">
            <Loader size="sm" />
          </Group>
        ) : query.isError ? (
          <Text size="sm" c="red">
            {query.error instanceof ApiRequestError ? query.error.message : 'Не вдалося виконати пошук'}
          </Text>
        ) : !query.data || query.data.items.length === 0 ? (
          <Text size="sm" c="dimmed">
            Нічого не знайдено
          </Text>
        ) : (
          <Stack gap={2}>
            {query.data.items.map((c) => (
              <UnstyledButton key={c.id} p="xs" onClick={() => goTo(c.id)} style={{ borderRadius: 6 }}>
                <Group justify="space-between" wrap="nowrap">
                  <Stack gap={0} style={{ minWidth: 0 }}>
                    <Text size="sm" truncate>
                      {c.displayName}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {c.contacts[0]?.phone ?? c.contacts[0]?.email ?? '—'}
                    </Text>
                  </Stack>
                  <Badge size="sm" color={c.status.color} variant="light">
                    {c.status.label}
                  </Badge>
                </Group>
              </UnstyledButton>
            ))}
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}
