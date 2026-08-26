import { Badge, Button, Drawer, Group, Paper, Stack, Table, Tabs, Text, TextInput, Title } from '@mantine/core';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { PROTO_CLIENTS, ProtoClient } from './prototype-data';

/**
 * ПРОТОТИП (этап 1, дни 3–4). Данные фейковые, действия ничего не сохраняют.
 * Компоновка — из 06-ui-layout.md: таблица + правый drawer 600px,
 * полная карточка открывается отдельно и держит позицию в списке.
 */
export function ClientsPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<ProtoClient | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<string>('mine');

  const rows = PROTO_CLIENTS.filter((c) =>
    search ? c.displayName.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search) : true,
  ).filter((c) => (tab === 'pool' ? c.assignee === 'Нерозподілений' : true));

  return (
    <>
      <PageHeader
        title="Клієнти"
        subtitle="Прототип: дані демонстраційні"
        actions={<Button leftSection={<IconPlus size={16} />}>Новий лід</Button>}
      />

      <Stack gap="sm">
        <Group>
          <TextInput
            leftSection={<IconSearch size={16} />}
            placeholder="Пошук за назвою, телефоном, ЄДРПОУ"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            w={360}
          />
        </Group>

        {/* Четыре чипа-пресета вместо конструктора фильтров (FR-2.11) */}
        <Tabs value={tab} onChange={(v) => setTab(v ?? 'mine')}>
          <Tabs.List>
            <Tabs.Tab value="mine">Мої</Tabs.Tab>
            <Tabs.Tab value="all">Усі</Tabs.Tab>
            <Tabs.Tab value="pool" rightSection={<Badge size="xs" circle>1</Badge>}>
              Нерозподілені
            </Tabs.Tab>
            <Tabs.Tab value="attention">Потребують уваги</Tabs.Tab>
          </Tabs.List>
        </Tabs>

        <Paper withBorder radius="md">
          <Table.ScrollContainer minWidth={900}>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Клієнт</Table.Th>
                  <Table.Th>Статус</Table.Th>
                  <Table.Th>Система</Table.Th>
                  <Table.Th>Відповідальний</Table.Th>
                  <Table.Th>Найближча задача</Table.Th>
                  <Table.Th>Активність</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((c) => (
                  <Table.Tr
                    key={c.id}
                    onClick={() => setSelected(c)}
                    style={{ cursor: 'pointer' }}
                  >
                    <Table.Td>
                      <Text size="sm" fw={500}>
                        {c.displayName}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {c.phone}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={c.status.color} variant="light">
                        {c.status.label}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{c.taxSystem}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c={c.assignee === 'Нерозподілений' ? 'orange' : undefined}>
                        {c.assignee}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c={c.nextTask ? undefined : 'dimmed'}>
                        {c.nextTask ?? '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {c.lastActivity}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      </Stack>

      <Drawer
        opened={selected !== null}
        onClose={() => setSelected(null)}
        position="right"
        size={600}
        title={selected?.displayName}
      >
        {selected && (
          <Stack>
            <Badge color={selected.status.color} variant="light" w="fit-content">
              {selected.status.label}
            </Badge>
            <Text size="sm">{selected.assignee}</Text>
            <Text size="sm">{selected.taxSystem}</Text>
            <Text size="sm">{selected.phone}</Text>
            <Paper withBorder p="sm" radius="md">
              <Title order={6}>Найближча задача</Title>
              <Text size="sm" c={selected.nextTask ? undefined : 'dimmed'}>
                {selected.nextTask ?? 'Задач немає'}
              </Text>
            </Paper>
            <Group>
              <Button onClick={() => navigate({ to: '/clients/$clientId', params: { clientId: selected.id } })}>
                Відкрити повністю
              </Button>
              <Button variant="light">Взяти в роботу</Button>
            </Group>
          </Stack>
        )}
      </Drawer>
    </>
  );
}
