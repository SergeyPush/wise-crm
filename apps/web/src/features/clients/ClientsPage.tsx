import {
  Alert,
  Badge,
  Button,
  Drawer,
  Group,
  Menu,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useDebouncedValue, useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconAlertTriangle, IconChevronDown, IconPlus, IconSearch } from '@tabler/icons-react';
import { useNavigate } from '@tanstack/react-router';
import { DataTable, type DataTableColumn } from 'mantine-datatable';
import { useContextMenu } from 'mantine-contextmenu';
import { useEffect, useState } from 'react';
import { Paginated } from 'shared';
import { ApiRequestError, api } from '../../lib/api';
import { TAX_SYSTEM_LABELS, formatRelative } from '../../lib/format';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState, ErrorState } from '../../components/EmptyState';
import { useMe } from '../auth/useAuth';
import { ActionMenu, renderMenuItems } from '../registry/ActionMenu';
import { toMenuItems } from '../registry/toMenuItems';
import { Action, Ctx } from '../registry/types';
import { useClientActions } from './actions';
import { ClientListItem, DuplicateMatch } from './types';

type Tab = 'mine' | 'inWork' | 'pool' | 'all' | 'archived';

// Фиксированные чипы вместо конструктора фильтров (FR-2.11, FR-2.11.1).
// «Прострочені» приєднається в фазі 2 разом з рештою фільтрів FR-2.11.
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
    case 'archived':
      // FR-8.1 «Відновити»: сервер сам відмовить не-ADMIN 403-ю (client:delete)
      return '&deleted=true';
  }
}

const PAGE_SIZE = 25;

export function ClientsPage() {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const { showContextMenu } = useContextMenu();
  const actions = useClientActions();
  const [createOpened, createHandlers] = useDisclosure(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [tab, setTabState] = useState<Tab>('mine');
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<ClientListItem[]>([]);

  const setTab = (v: Tab) => {
    setTabState(v);
    setPage(1);
  };

  // Виділення прив'язане до конкретного зрізу списку — зміна вкладки, сторінки
  // чи пошуку його знецінює (FR-8.3 працює лише в межах видимого результату).
  useEffect(() => {
    setSelection([]);
  }, [tab, page, debouncedSearch]);

  const poolCount = useQuery({
    queryKey: ['clients', 'pool-count'],
    queryFn: () => api.get<Paginated<ClientListItem>>('/clients?assigneeId=none&limit=1'),
    select: (r) => r.total,
  });

  const query = useQuery({
    queryKey: ['clients', tab, debouncedSearch, page, me?.id],
    queryFn: () =>
      api.get<Paginated<ClientListItem>>(
        `/clients?limit=${PAGE_SIZE}&page=${page}${tabToQuery(tab, me?.id)}${debouncedSearch ? `&q=${encodeURIComponent(debouncedSearch)}` : ''}`,
      ),
    enabled: tab !== 'mine' || Boolean(me?.id),
    placeholderData: (prev) => prev,
  });

  const columns: DataTableColumn<ClientListItem>[] = [
    {
      accessor: 'displayName',
      title: 'Клієнт',
      render: (c) => (
        <Stack gap={0}>
          <Group gap={6} wrap="nowrap">
            <Text size="sm" fw={500}>
              {c.displayName}
            </Text>
            {c.needsQualification && <IconAlertTriangle size={14} color="var(--mantine-color-orange-6)" />}
          </Group>
          <Text size="xs" c="dimmed">
            {c.contacts[0]?.phone ?? c.contacts[0]?.email ?? '—'}
          </Text>
        </Stack>
      ),
    },
    {
      accessor: 'status',
      title: 'Статус',
      render: (c) => (
        <Badge color={c.status.color} variant="light">
          {c.status.label}
        </Badge>
      ),
    },
    {
      accessor: 'taxSystem',
      title: 'Система',
      render: (c) => (
        <Text size="sm">
          {c.taxSystem ? TAX_SYSTEM_LABELS[c.taxSystem as keyof typeof TAX_SYSTEM_LABELS] : '—'}
          {c.isVatPayer ? ', платник ПДВ' : ''}
        </Text>
      ),
    },
    {
      accessor: 'assignees',
      title: 'Відповідальний',
      render: (c) => {
        const primary = c.assignees.find((a) => a.role === 'PRIMARY');
        return (
          <Text size="sm" c={primary ? undefined : 'orange'}>
            {primary?.user.fullName ?? 'Нерозподілений'}
          </Text>
        );
      },
    },
    {
      accessor: 'lastActivityAt',
      title: 'Активність',
      render: (c) => (
        <Text size="sm" c="dimmed">
          {formatRelative(c.lastActivityAt ?? c.createdAt)}
        </Text>
      ),
    },
    {
      accessor: 'actions',
      title: '',
      width: 44,
      render: (c) => (me ? <ActionMenu actions={actions} ctx={{ user: me, record: c }} /> : null),
    },
  ];

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
            onChange={(e) => {
              setSearch(e.currentTarget.value);
              setPage(1);
            }}
            w={360}
          />
        </Group>

        <Group gap="xs">
          {(
            [
              ['mine', 'Мої'],
              ['inWork', 'Ліди в роботі'],
              ['pool', 'Нерозподілені'],
              ['all', 'Усі'],
              // FR-8.1 «Відновити» — архів бачить лише той, хто може відновлювати
              ...(me?.role === 'ADMIN' ? ([['archived', 'Архів']] as const) : []),
            ] as const
          ).map(([value, label]) => (
            <Button key={value} size="xs" variant={tab === value ? 'filled' : 'default'} onClick={() => setTab(value)}>
              {label}
              {value === 'pool' && poolCount.data ? (
                <Badge ml={6} size="xs" circle color="orange">
                  {poolCount.data}
                </Badge>
              ) : null}
            </Button>
          ))}
        </Group>

        {query.isError ? (
          <ErrorState
            message={query.error instanceof ApiRequestError ? query.error.message : 'Не вдалося завантажити список'}
            requestId={query.error instanceof ApiRequestError ? query.error.requestId : undefined}
            onRetry={() => query.refetch()}
          />
        ) : !query.isLoading && query.data && query.data.items.length === 0 ? (
          <EmptyState
            title={
              debouncedSearch ? 'Нічого не знайдено' : tab === 'pool' ? 'Пул порожній' : tab === 'archived' ? 'Архів порожній' : 'Клієнтів поки немає'
            }
            description={
              debouncedSearch
                ? 'Спробуйте інший запит — пошук працює за назвою, телефоном, ЄДРПОУ/РНОКПП'
                : tab === 'pool'
                  ? 'Усі заявки розібрані — це нормальний стан'
                  : tab === 'archived'
                    ? 'Архівованих клієнтів немає — це нормальний стан'
                    : 'Заведіть першого ліда кнопкою вище'
            }
            action={
              !debouncedSearch && tab !== 'pool' && tab !== 'archived' ? <Button onClick={createHandlers.open}>Новий лід</Button> : undefined
            }
          />
        ) : (
          <>
            {selection.length > 0 && me && tab !== 'archived' && (
              <BulkToolbar actions={actions} selection={selection} user={me} onClear={() => setSelection([])} />
            )}
            <DataTable<ClientListItem>
              withTableBorder
              borderRadius="md"
              minHeight={200}
              fetching={query.isLoading}
              records={query.data?.items ?? []}
              columns={columns}
              highlightOnHover
              page={page}
              onPageChange={setPage}
              totalRecords={query.data?.total ?? 0}
              recordsPerPage={PAGE_SIZE}
              noRecordsText="Немає записів"
              // Архів — лише перегляд і «Відновити» через ПКМ/«⋮», масові дії
              // сюди не мають сенсу (єдина дія над архівом — по одному запису)
              {...(tab !== 'archived' ? { selectedRecords: selection, onSelectedRecordsChange: setSelection } : {})}
              onRowClick={
                tab === 'archived'
                  ? undefined
                  : ({ record }) => navigate({ to: '/clients/$clientId', params: { clientId: record.id } })
              }
              onRowContextMenu={({ event, record }) => {
                // FR-8.5: Shift+ПКМ і виділений текст — нативне меню браузера, не наше
                if (!me || event.shiftKey || window.getSelection()?.toString()) return;
                event.preventDefault();
                // FR-8.3: ПКМ по вже виділеному рядку — масові дії над усім виділенням;
                // по невиділеному — «клік по невиділеному рядку скидає виділення на нього»
                const isPartOfSelection = selection.length > 1 && selection.some((s) => s.id === record.id);
                if (isPartOfSelection) {
                  showContextMenu(toMenuItems(actions.filter((a) => a.bulk), { user: me, selection }))(event);
                } else {
                  setSelection([]);
                  showContextMenu(toMenuItems(actions, { user: me, record }))(event);
                }
              }}
            />
          </>
        )}
      </Stack>

      <CreateLeadDrawer opened={createOpened} onClose={createHandlers.close} />
    </>
  );
}

/**
 * Тулбар масових дій (FR-2.13, FR-8.3) — видимий дублікат ПКМ по виділенню
 * (FR-8.7), той самий реєстр, відфільтрований по bulk: true (FR-8.4).
 */
function BulkToolbar({
  actions,
  selection,
  user,
  onClear,
}: {
  actions: Action<ClientListItem>[];
  selection: ClientListItem[];
  user: NonNullable<ReturnType<typeof useMe>['data']>;
  onClear: () => void;
}) {
  const ctx: Ctx<ClientListItem> = { user, selection };
  const bulkActions = actions.filter((a) => a.bulk && !a.hidden?.(ctx));

  return (
    <Paper withBorder p="xs" radius="md">
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm" fw={500}>
          Обрано: {selection.length}
        </Text>
        <Group gap="xs" wrap="wrap">
          {bulkActions.map((a) =>
            a.items?.length ? (
              <Menu key={a.id} withinPortal>
                <Menu.Target>
                  <Button size="xs" variant="light" leftSection={a.icon} rightSection={<IconChevronDown size={12} />}>
                    {a.label}
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>{renderMenuItems(a.items, ctx)}</Menu.Dropdown>
              </Menu>
            ) : (
              <Button key={a.id} size="xs" variant="light" leftSection={a.icon} onClick={() => void a.run?.(ctx)}>
                {a.label}
              </Button>
            ),
          )}
        </Group>
        <Button size="xs" variant="subtle" onClick={onClear}>
          Зняти виділення
        </Button>
      </Group>
    </Paper>
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
