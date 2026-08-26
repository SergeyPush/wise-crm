import {
  Alert,
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Timeline,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconArrowLeft, IconPhoneCall, IconUserCheck } from '@tabler/icons-react';
import { Link, useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { TaxSystem } from 'shared';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState, ErrorState } from '../../components/EmptyState';
import { ApiRequestError, api } from '../../lib/api';
import { CLIENT_TYPE_LABELS, TAX_SYSTEM_LABELS, formatRelative } from '../../lib/format';
import { useCan, useMe } from '../auth/useAuth';
import { ClientCard } from './types';

// Поля блока «Для тарифу» (FR-2.0.5) — чек-лист при WON перевіряє саме їх.
const TARIFF_FIELDS: Array<{ key: keyof ClientCard; label: string }> = [
  { key: 'taxSystem', label: 'Система оподаткування' },
  { key: 'documentsPerMonth', label: 'Документів на місяць' },
  { key: 'employeeCount', label: 'Кількість працівників' },
];

export function ClientCardPage() {
  const { clientId } = useParams({ from: '/clients/$clientId' });
  const { data: me } = useMe();
  const can = useCan(me);
  const qc = useQueryClient();
  const [editOpened, editHandlers] = useDisclosure(false);
  const [statusOpened, statusHandlers] = useDisclosure(false);
  const [contactLogOpened, contactLogHandlers] = useDisclosure(false);

  const query = useQuery({
    queryKey: ['clients', clientId],
    queryFn: () => api.get<ClientCard>(`/clients/${clientId}`),
  });

  const claim = useMutation({
    mutationFn: () => api.post(`/clients/${clientId}/claim`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['clients', clientId] });
      notifications.show({ message: 'Клієнта взято в роботу', color: 'green' });
    },
  });

  if (query.isLoading) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    );
  }

  if (query.isError) {
    const e = query.error;
    if (e instanceof ApiRequestError && e.status === 404) {
      return (
        <EmptyState
          title="Клієнта не знайдено"
          description="Можливо, його видалили або посилання застаріле"
          action={
            <Button component={Link} to="/clients" variant="light">
              До списку
            </Button>
          }
        />
      );
    }
    return (
      <ErrorState
        message={e instanceof ApiRequestError ? e.message : 'Не вдалося завантажити картку'}
        requestId={e instanceof ApiRequestError ? e.requestId : undefined}
        onRetry={() => query.refetch()}
      />
    );
  }

  const client = query.data!;
  const primary = client.assignees.find((a) => a.role === 'PRIMARY');
  const isMine = primary?.user.id === me?.id;
  const missingTariff = TARIFF_FIELDS.filter((f) => client[f.key] === null || client[f.key] === undefined);

  return (
    <>
      <PageHeader
        title={client.displayName}
        subtitle={`${CLIENT_TYPE_LABELS[client.type] ?? client.type} · у статусі ${formatRelative(client.statusSince)}`}
        actions={
          <Button component={Link} to="/clients" variant="subtle" leftSection={<IconArrowLeft size={16} />}>
            До списку
          </Button>
        }
      />

      <Grid>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack>
            <Card withBorder radius="md">
              <Group justify="space-between" mb="sm">
                <Group gap="xs">
                  <Badge color={client.status.color} variant="light" style={{ cursor: 'pointer' }} onClick={statusHandlers.open}>
                    {client.status.label}
                  </Badge>
                  {client.needsQualification && (
                    <Badge color="orange" variant="outline">
                      ⚠ уточнити назву
                    </Badge>
                  )}
                </Group>
                <Group gap="xs">
                  {!isMine && can('client:assign') && (
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<IconUserCheck size={14} />}
                      loading={claim.isPending}
                      onClick={() => claim.mutate()}
                    >
                      Взяти в роботу
                    </Button>
                  )}
                  <Button size="xs" variant="light" leftSection={<IconPhoneCall size={14} />} onClick={contactLogHandlers.open}>
                    Зафіксувати контакт
                  </Button>
                  {can('client:update') && (
                    <Button size="xs" variant="default" onClick={editHandlers.open}>
                      Редагувати
                    </Button>
                  )}
                </Group>
              </Group>
              <Grid>
                <Field label="Юридична назва" value={client.legalName} />
                <Field label="ЄДРПОУ / РНОКПП" value={client.edrpou ?? client.rnokpp} />
                <Field label="Джерело" value={client.source?.label} />
                <Field
                  label="Відповідальний"
                  value={primary?.user.fullName}
                  warn={!primary}
                  warnLabel="Нерозподілений"
                />
                <Field label="Юридична адреса" value={client.legalAddress} />
                <Field label="Фактична адреса" value={client.actualAddress} />
              </Grid>
              {client.notes && (
                <Text size="sm" mt="sm" c="dimmed">
                  {client.notes}
                </Text>
              )}
            </Card>

            <Tabs defaultValue="activity">
              <Tabs.List>
                <Tabs.Tab value="activity">Активність</Tabs.Tab>
                <Tabs.Tab value="contacts">Контактні особи</Tabs.Tab>
                <Tabs.Tab value="tasks">Задачі</Tabs.Tab>
                <Tabs.Tab value="files">Документи</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="activity" pt="md">
                <ActivityFeed clientId={clientId} />
              </Tabs.Panel>

              <Tabs.Panel value="contacts" pt="md">
                <ContactsPanel client={client} />
              </Tabs.Panel>

              <Tabs.Panel value="tasks" pt="md">
                <EmptyState title="Задачі клієнта — на етапі 3" description="Поки що задачі ведуться на загальному екрані «Задачі»" />
              </Tabs.Panel>

              <Tabs.Panel value="files" pt="md">
                <EmptyState title="Документи — на етапі 4" description="Завантаження файлів зʼявиться разом зі стрічкою й сповіщеннями" />
              </Tabs.Panel>
            </Tabs>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack>
            <Card withBorder radius="md">
              <Group justify="space-between" mb="sm">
                <Title order={5}>Для тарифу</Title>
                {missingTariff.length > 0 && (
                  <Badge size="sm" color="yellow" variant="light">
                    не заповнено: {missingTariff.length}
                  </Badge>
                )}
              </Group>
              <Stack gap="xs">
                <Text size="sm">
                  Система: {client.taxSystem ? TAX_SYSTEM_LABELS[client.taxSystem as TaxSystem] : '—'}
                </Text>
                <Text size="sm">Платник ПДВ: {client.isVatPayer ? 'так' : 'ні'}</Text>
                <Text size="sm">Документів на місяць: {client.documentsPerMonth ?? '—'}</Text>
                <Text size="sm">Працівників: {client.employeeCount ?? '—'}</Text>
                <Text size="sm">Дія.City: {client.isDiiaCity ? 'так' : 'ні'}</Text>
              </Stack>
            </Card>

            <Card withBorder radius="md">
              <Title order={5} mb="sm">
                Договір
              </Title>
              <Stack gap="xs">
                <Text size="sm">
                  {client.contractNo ? `№ ${client.contractNo}` : 'Договір ще не укладено'}
                  {client.contractDate ? ` від ${new Date(client.contractDate).toLocaleDateString('uk-UA')}` : ''}
                </Text>
                <Text size="sm">Абонплата: {client.monthlyFee ? `${client.monthlyFee} ₴` : '—'}</Text>
              </Stack>
            </Card>
          </Stack>
        </Grid.Col>
      </Grid>

      {editOpened && <EditClientModal client={client} onClose={editHandlers.close} />}
      {statusOpened && <ChangeStatusModal client={client} onClose={statusHandlers.close} />}
      {contactLogOpened && <ContactLogModal clientId={clientId} onClose={contactLogHandlers.close} />}
    </>
  );
}

function Field({
  label,
  value,
  warn,
  warnLabel,
}: {
  label: string;
  value?: string | null;
  warn?: boolean;
  warnLabel?: string;
}) {
  return (
    <Grid.Col span={6}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm" c={warn ? 'orange' : undefined}>
        {warn ? (warnLabel ?? '—') : (value ?? '—')}
      </Text>
    </Grid.Col>
  );
}

function ActivityFeed({ clientId }: { clientId: string }) {
  const query = useQuery({
    queryKey: ['clients', clientId, 'activity'],
    queryFn: () =>
      api.get<{ items: Array<{ id: string; type: string; createdAt: string; actor: { fullName: string } | null; payload: unknown }> }>(
        `/clients/${clientId}/activity`,
      ),
  });

  if (query.isLoading) {
    return (
      <Group justify="center" py="md">
        <Loader size="sm" />
      </Group>
    );
  }

  const items = query.data?.items ?? [];
  if (items.length === 0) {
    return <EmptyState title="Стрічка порожня" description="Тут зʼявляться зміни статусу, коментарі та задачі" />;
  }

  return (
    <Paper withBorder p="md" radius="md">
      <Timeline bulletSize={16} lineWidth={2}>
        {items.map((e) => (
          <Timeline.Item key={e.id} title={ACTIVITY_LABELS[e.type] ?? e.type}>
            <Text size="xs" c="dimmed">
              {e.actor?.fullName ?? 'Система'} · {formatRelative(e.createdAt)}
            </Text>
          </Timeline.Item>
        ))}
      </Timeline>
    </Paper>
  );
}

const ACTIVITY_LABELS: Record<string, string> = {
  client_created: 'Клієнта створено',
  field_changed: 'Змінено поля картки',
  status_changed: 'Змінено статус',
  assignee_changed: 'Змінено відповідального',
  contact_logged: 'Зафіксовано контакт',
  contact_added: 'Додано контактну особу',
  contact_removed: 'Видалено контактну особу',
  web_lead: 'Заявка з сайту',
  web_lead_duplicate: 'Повторна заявка з сайту',
  web_lead_unmapped_field: 'Не вдалося розпізнати значення поля заявки',
};

function ContactsPanel({ client }: { client: ClientCard }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const form = useForm({ initialValues: { fullName: '', position: '', phone: '', email: '' } });

  const addContact = useMutation({
    mutationFn: (values: typeof form.values) => api.post(`/clients/${client.id}/contacts`, values),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['clients', client.id] });
      form.reset();
      setAdding(false);
    },
  });

  return (
    <Stack>
      {client.contacts.length === 0 && !adding && (
        <EmptyState title="Контактних осіб ще немає" description="Додайте директора чи бухгалтера клієнта" />
      )}
      {client.contacts.map((c) => (
        <Paper key={c.id} withBorder p="sm" radius="md">
          <Group justify="space-between">
            <Stack gap={0}>
              <Group gap={6}>
                <Text size="sm" fw={500}>
                  {c.fullName ?? '—'}
                </Text>
                {c.isPrimary && <Badge size="xs">основний</Badge>}
              </Group>
              <Text size="xs" c="dimmed">
                {c.position}
              </Text>
            </Stack>
            <Text size="sm">{c.phone ?? c.email ?? '—'}</Text>
          </Group>
        </Paper>
      ))}

      {adding ? (
        <Paper withBorder p="sm" radius="md">
          <form
            onSubmit={form.onSubmit((v) => {
              if (!v.fullName && !v.phone && !v.email) return;
              addContact.mutate(v);
            })}
          >
            <Stack gap="xs">
              <TextInput label="ПІБ" {...form.getInputProps('fullName')} />
              <TextInput label="Посада" {...form.getInputProps('position')} />
              <TextInput label="Телефон" {...form.getInputProps('phone')} />
              <TextInput label="Email" {...form.getInputProps('email')} />
              <Group>
                <Button type="submit" size="xs" loading={addContact.isPending}>
                  Зберегти
                </Button>
                <Button size="xs" variant="subtle" onClick={() => setAdding(false)}>
                  Скасувати
                </Button>
              </Group>
            </Stack>
          </form>
        </Paper>
      ) : (
        <Button variant="light" onClick={() => setAdding(true)}>
          Додати контактну особу
        </Button>
      )}
    </Stack>
  );
}

function EditClientModal({ client, onClose }: { client: ClientCard; onClose: () => void }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    initialValues: {
      displayName: client.displayName,
      legalName: client.legalName ?? '',
      edrpou: client.edrpou ?? '',
      rnokpp: client.rnokpp ?? '',
      legalAddress: client.legalAddress ?? '',
      actualAddress: client.actualAddress ?? '',
      taxSystem: client.taxSystem ?? '',
      isVatPayer: client.isVatPayer,
      employeeCount: client.employeeCount ?? undefined,
      documentsPerMonth: client.documentsPerMonth ?? undefined,
      isDiiaCity: client.isDiiaCity,
      monthlyFee: typeof client.monthlyFee === 'string' ? Number(client.monthlyFee) : (client.monthlyFee ?? undefined),
      contractNo: client.contractNo ?? '',
      notes: client.notes ?? '',
    },
  });

  const mutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      api.patch(`/clients/${client.id}`, {
        ...values,
        edrpou: values.edrpou || undefined,
        rnokpp: values.rnokpp || undefined,
        taxSystem: values.taxSystem || undefined,
        updatedAt: client.updatedAt,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['clients', client.id] });
      void qc.invalidateQueries({ queryKey: ['clients'] });
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiRequestError && e.status === 409) {
        setError('Дані змінено іншим користувачем. Закрийте форму і відкрийте картку заново.');
      } else {
        setError(e instanceof ApiRequestError ? e.message : 'Помилка');
      }
    },
  });

  return (
    <Modal opened onClose={onClose} title="Редагування картки" size="lg">
      <form onSubmit={form.onSubmit((v) => mutation.mutate(v))}>
        <Stack>
          {error && (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          )}
          <TextInput label="Назва" {...form.getInputProps('displayName')} />
          <TextInput label="Юридична назва" {...form.getInputProps('legalName')} />
          <Group grow>
            <TextInput label="ЄДРПОУ" {...form.getInputProps('edrpou')} />
            <TextInput label="РНОКПП" {...form.getInputProps('rnokpp')} />
          </Group>
          <TextInput label="Юридична адреса" {...form.getInputProps('legalAddress')} />
          <TextInput label="Фактична адреса" {...form.getInputProps('actualAddress')} />

          <Title order={6} mt="sm">
            Для тарифу
          </Title>
          <Select
            label="Система оподаткування"
            data={Object.entries(TAX_SYSTEM_LABELS).map(([value, label]) => ({ value, label }))}
            clearable
            {...form.getInputProps('taxSystem')}
          />
          <Switch label="Платник ПДВ" checked={form.values.isVatPayer} onChange={(e) => form.setFieldValue('isVatPayer', e.currentTarget.checked)} />
          <Group grow>
            <NumberInput label="Працівників" min={0} {...form.getInputProps('employeeCount')} />
            <NumberInput label="Документів на місяць" min={0} {...form.getInputProps('documentsPerMonth')} />
          </Group>
          <Switch label="Дія.City" checked={form.values.isDiiaCity} onChange={(e) => form.setFieldValue('isDiiaCity', e.currentTarget.checked)} />

          <Title order={6} mt="sm">
            Договір
          </Title>
          <Group grow>
            <TextInput label="Номер договору" {...form.getInputProps('contractNo')} />
            <NumberInput label="Абонплата, ₴" min={0} {...form.getInputProps('monthlyFee')} />
          </Group>

          <Textarea label="Нотатки" autosize minRows={2} {...form.getInputProps('notes')} />

          <Button type="submit" loading={mutation.isPending}>
            Зберегти
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}

function ChangeStatusModal({ client, onClose }: { client: ClientCard; onClose: () => void }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [statusId, setStatusId] = useState<string | null>(null);
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [comment, setComment] = useState('');

  const statuses = useQuery({
    queryKey: ['dictionaries', 'statuses'],
    queryFn: () => api.get<Array<{ id: string; code: string; label: string; requiresReason: boolean }>>('/dictionaries/statuses'),
  });
  const reasons = useQuery({
    queryKey: ['dictionaries', 'lost-reasons'],
    queryFn: () => api.get<Array<{ id: string; label: string }>>('/dictionaries/lost-reasons'),
    enabled: statuses.data?.find((s) => s.id === statusId)?.requiresReason,
  });

  const target = statuses.data?.find((s) => s.id === statusId);
  const missingTariff = target?.code === 'WON' ? TARIFF_FIELDS.filter((f) => !client[f.key]) : [];

  const mutation = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/status`, { statusId, reasonId: reasonId ?? undefined, comment: comment || undefined }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['clients', client.id] });
      onClose();
    },
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Помилка'),
  });

  return (
    <Modal opened onClose={onClose} title="Зміна статусу">
      <Stack>
        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}
        <Select
          label="Новий статус"
          data={statuses.data?.map((s) => ({ value: s.id, label: s.label })) ?? []}
          value={statusId}
          onChange={setStatusId}
        />
        {target?.requiresReason && (
          <Select
            label="Причина"
            data={reasons.data?.map((r) => ({ value: r.id, label: r.label })) ?? []}
            value={reasonId}
            onChange={setReasonId}
          />
        )}
        {missingTariff.length > 0 && (
          // FR-2.0.5: неблокирующее напоминание перед закриттям угоди
          <Alert color="yellow" variant="light" title="Не заповнено для тарифу">
            {missingTariff.map((f) => f.label).join(', ')}
          </Alert>
        )}
        <Textarea label="Коментар" value={comment} onChange={(e) => setComment(e.currentTarget.value)} autosize minRows={2} />
        <Button
          onClick={() => mutation.mutate()}
          loading={mutation.isPending}
          disabled={!statusId || (target?.requiresReason && !reasonId)}
        >
          Зберегти
        </Button>
      </Stack>
    </Modal>
  );
}

function ContactLogModal({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [result, setResult] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.post(`/clients/${clientId}/contact-log`, { result }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['clients', clientId, 'activity'] });
      onClose();
    },
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Помилка'),
  });

  return (
    <Modal opened onClose={onClose} title="Зафіксувати контакт">
      <Stack>
        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}
        <Textarea
          label="Результат розмови"
          placeholder="Домовились про КП до п'ятниці"
          value={result}
          onChange={(e) => setResult(e.currentTarget.value)}
          autosize
          minRows={3}
          data-autofocus
        />
        <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!result.trim()}>
          Зберегти
        </Button>
      </Stack>
    </Modal>
  );
}
