import {
  Alert,
  Badge,
  Button,
  Drawer,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
} from '@mantine/core';
import { useDebouncedValue, useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconAlertTriangle, IconPlus, IconSearch } from '@tabler/icons-react';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Paginated } from 'shared';
import { ApiRequestError, api } from '../../lib/api';
import { TAX_SYSTEM_LABELS, formatRelative } from '../../lib/format';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState, ErrorState } from '../../components/EmptyState';
import { useMe } from '../auth/useAuth';
import { ClientListItem, DuplicateMatch } from './types';

type Tab = 'mine' | 'inWork' | 'pool' | 'all';

// Фиксированные чипы вместо конструктора фильтров (FR-2.11, FR-2.11.1).
// «Прострочені» приєднається на етапі 3 разом із задачами.
function tabToQuery(tab: Tab, meId?: string): string {
  switch (tab) {
    case 'mine':
      return meId ? `&assigneeId=${meId}` : '';
    case 'inWork':
      return '&stage=IN_WORK';
    case 'pool':
      return '&assigneeId=none';
    case 'all':
      return '';
  }
}

export function ClientsPage() {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const [createOpened, createHandlers] = useDisclosure(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [tab, setTab] = useState<Tab>('mine');

  const poolCount = useQuery({
    queryKey: ['clients', 'pool-count'],
    queryFn: () => api.get<Paginated<ClientListItem>>('/clients?assigneeId=none&limit=1'),
    select: (r) => r.total,
  });

  const query = useQuery({
    queryKey: ['clients', tab, debouncedSearch, me?.id],
    queryFn: () =>
      api.get<Paginated<ClientListItem>>(
        `/clients?limit=50${tabToQuery(tab, me?.id)}${debouncedSearch ? `&q=${encodeURIComponent(debouncedSearch)}` : ''}`,
      ),
    enabled: tab !== 'mine' || Boolean(me?.id),
  });

  return (
    <>
      <PageHeader
        title="Клієнти"
        actions={
          <Button leftSection={<IconPlus size={16} />} onClick={createHandlers.open}>
            Новий лід
          </Button>
        }
      />

      <Stack gap="sm">
        <Group>
          <TextInput
            leftSection={<IconSearch size={16} />}
            placeholder="Пошук за назвою, телефоном, ЄДРПОУ/РНОКПП"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            w={360}
          />
        </Group>

        <Tabs value={tab} onChange={(v) => setTab((v as Tab) ?? 'mine')}>
          <Tabs.List>
            <Tabs.Tab value="mine">Мої</Tabs.Tab>
            <Tabs.Tab value="inWork">Ліди в роботі</Tabs.Tab>
            <Tabs.Tab
              value="pool"
              rightSection={
                poolCount.data ? (
                  <Badge size="xs" circle>
                    {poolCount.data}
                  </Badge>
                ) : undefined
              }
            >
              Нерозподілені
            </Tabs.Tab>
            <Tabs.Tab value="all">Усі</Tabs.Tab>
          </Tabs.List>
        </Tabs>

        {query.isLoading ? (
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        ) : query.isError ? (
          <ErrorState
            message={query.error instanceof ApiRequestError ? query.error.message : 'Не вдалося завантажити список'}
            requestId={query.error instanceof ApiRequestError ? query.error.requestId : undefined}
            onRetry={() => query.refetch()}
          />
        ) : query.data && query.data.items.length === 0 ? (
          <EmptyState
            title={debouncedSearch ? 'Нічого не знайдено' : tab === 'pool' ? 'Пул порожній' : 'Клієнтів поки немає'}
            description={
              debouncedSearch
                ? 'Спробуйте інший запит — пошук працює за назвою, телефоном, ЄДРПОУ/РНОКПП'
                : tab === 'pool'
                  ? 'Усі заявки розібрані — це нормальний стан'
                  : 'Заведіть першого ліда кнопкою вище'
            }
            action={!debouncedSearch && tab !== 'pool' ? <Button onClick={createHandlers.open}>Новий лід</Button> : undefined}
          />
        ) : (
          <Paper withBorder radius="md">
            <Table.ScrollContainer minWidth={900}>
              <Table highlightOnHover verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Клієнт</Table.Th>
                    <Table.Th>Статус</Table.Th>
                    <Table.Th>Система</Table.Th>
                    <Table.Th>Відповідальний</Table.Th>
                    <Table.Th>Активність</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {query.data?.items.map((c) => {
                    const primary = c.assignees.find((a) => a.role === 'PRIMARY');
                    const contact = c.contacts[0];
                    return (
                      <Table.Tr
                        key={c.id}
                        onClick={() => navigate({ to: '/clients/$clientId', params: { clientId: c.id } })}
                        style={{ cursor: 'pointer' }}
                      >
                        <Table.Td>
                          <Group gap={6}>
                            <Text size="sm" fw={500}>
                              {c.displayName}
                            </Text>
                            {c.needsQualification && (
                              <IconAlertTriangle size={14} color="var(--mantine-color-orange-6)" />
                            )}
                          </Group>
                          <Text size="xs" c="dimmed">
                            {contact?.phone ?? contact?.email ?? '—'}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge color={c.status.color} variant="light">
                            {c.status.label}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">
                            {c.taxSystem ? TAX_SYSTEM_LABELS[c.taxSystem as keyof typeof TAX_SYSTEM_LABELS] : '—'}
                            {c.isVatPayer ? ', платник ПДВ' : ''}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c={primary ? undefined : 'orange'}>
                            {primary?.user.fullName ?? 'Нерозподілений'}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" c="dimmed">
                            {formatRelative(c.lastActivityAt ?? c.createdAt)}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Paper>
        )}
      </Stack>

      <CreateLeadDrawer opened={createOpened} onClose={createHandlers.close} />
    </>
  );
}

function CreateLeadDrawer({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const sources = useQuery({
    queryKey: ['dictionaries', 'lead-sources'],
    queryFn: () => api.get<Array<{ id: string; label: string }>>('/dictionaries/lead-sources'),
    enabled: opened,
  });

  const form = useForm({
    initialValues: { displayName: '', phone: '', email: '', sourceId: '' },
    validate: {
      displayName: (v) => (v.trim().length > 0 ? null : "Вкажіть ім'я або назву"),
      sourceId: (v) => (v ? null : 'Оберіть джерело'),
    },
  });

  const [phoneDebounced] = useDebouncedValue(form.values.phone, 400);
  const [emailDebounced] = useDebouncedValue(form.values.email, 400);
  const duplicates = useQuery({
    queryKey: ['clients', 'duplicates', phoneDebounced, emailDebounced],
    queryFn: () =>
      api.get<DuplicateMatch[]>(
        `/clients/duplicates?${phoneDebounced ? `phone=${encodeURIComponent(phoneDebounced)}&` : ''}${
          emailDebounced ? `email=${encodeURIComponent(emailDebounced)}` : ''
        }`,
      ),
    enabled: opened && (phoneDebounced.length >= 5 || emailDebounced.includes('@')),
  });

  const mutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      api.post<{ id: string }>('/clients', {
        displayName: values.displayName,
        phone: values.phone || undefined,
        email: values.email || undefined,
        sourceId: values.sourceId,
      }),
    onSuccess: (client) => {
      void qc.invalidateQueries({ queryKey: ['clients'] });
      form.reset();
      onClose();
      navigate({ to: '/clients/$clientId', params: { clientId: client.id } });
    },
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Помилка'),
  });

  return (
    <Drawer opened={opened} onClose={onClose} position="right" title="Новий лід" size="md">
      <form
        onSubmit={form.onSubmit((v) => {
          if (!v.phone && !v.email) {
            setError('Вкажіть телефон або email');
            return;
          }
          setError(null);
          mutation.mutate(v);
        })}
      >
        <Stack>
          {error && (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          )}
          <TextInput
            label="Ім'я або назва"
            placeholder='ТОВ «Ромашка» або Петренко Іван'
            data-autofocus
            {...form.getInputProps('displayName')}
          />
          <TextInput label="Телефон" placeholder="+380 67 123 45 67" {...form.getInputProps('phone')} />
          <TextInput label="Email" placeholder="client@example.com" {...form.getInputProps('email')} />
          <Select
            label="Джерело"
            placeholder="Оберіть джерело"
            data={sources.data?.map((s) => ({ value: s.id, label: s.label })) ?? []}
            {...form.getInputProps('sourceId')}
          />

          {duplicates.data && duplicates.data.length > 0 && (
            <Alert color="yellow" variant="light" title="Схожий контакт вже є">
              <Stack gap={6}>
                {duplicates.data.map((d) => (
                  <Text key={d.id} size="sm">
                    {d.displayName} · {d.status.label}
                    {d.primaryAssignee ? ` · веде ${d.primaryAssignee}` : ''}
                    {d.lastActivityAt ? ` · останній контакт ${formatRelative(d.lastActivityAt)}` : ''}
                  </Text>
                ))}
                <Text size="xs" c="dimmed">
                  Це попередження, а не заборона — можна все одно створити нову картку.
                </Text>
              </Stack>
            </Alert>
          )}

          <Button type="submit" loading={mutation.isPending}>
            Створити
          </Button>
        </Stack>
      </form>
    </Drawer>
  );
}
