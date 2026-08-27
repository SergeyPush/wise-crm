import {
  Alert,
  Anchor,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IconArrowLeft } from '@tabler/icons-react';
import { Link, useParams } from '@tanstack/react-router';
import { useContextMenu } from 'mantine-contextmenu';
import { useState } from 'react';
import { Priority, TaskType, endOfKyivDay } from 'shared';
import { EmptyState, ErrorState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { ApiRequestError, api } from '../../lib/api';
import { formatRelative } from '../../lib/format';
import { useMe } from '../auth/useAuth';
import { CommentsPanel } from '../comments/CommentsPanel';
import { FilesPanel } from '../files/FilesPanel';
import { ActionMenu } from '../registry/ActionMenu';
import { toMenuItems } from '../registry/toMenuItems';
import { useTaskActions } from './actions';
import { useTask, useUpdateTask } from './api';
import { ClientField, ClientOption } from './ClientField';
import { PRIORITY_LABELS, TASK_STATUS_LABELS, TASK_TYPE_LABELS, TaskItem } from './types';

/**
 * Картка задачі — той самий `/tasks/:id`, на який веде посилання з Telegram-
 * сповіщень (`task_assigned`) і з дзвіночка; досі вела в нікуди, бо екрана
 * не було. Відкривається кліком по заголовку задачі в списку.
 */
export function TaskCardPage() {
  const { taskId } = useParams({ from: '/tasks/$taskId' });
  const query = useTask(taskId);

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
          title="Задачу не знайдено"
          description="Можливо, її видалили або посилання застаріле"
          action={
            <Button component={Link} to="/tasks" variant="light">
              До списку
            </Button>
          }
        />
      );
    }
    return (
      <ErrorState
        message={e instanceof ApiRequestError ? e.message : 'Не вдалося завантажити задачу'}
        requestId={e instanceof ApiRequestError ? e.requestId : undefined}
        onRetry={() => query.refetch()}
      />
    );
  }

  return <TaskCardContent task={query.data!} />;
}

function TaskCardContent({ task }: { task: TaskItem }) {
  const { data: me } = useMe();
  const { showContextMenu } = useContextMenu();
  const actions = useTaskActions();
  const ctx = { user: me!, record: task };

  return (
    <>
      {/* Не завжди зрозуміло, чи ти зараз на клієнті чи на задачі (feedback 27.08.2026) */}
      <Breadcrumbs mb="xs">
        <Anchor component={Link} to="/tasks" size="sm" c="dimmed">
          Задачі
        </Anchor>
        <Text size="sm" c="dimmed">
          {task.title}
        </Text>
      </Breadcrumbs>

      <PageHeader
        title={task.title}
        subtitle={`${TASK_TYPE_LABELS[task.type]} · ${TASK_STATUS_LABELS[task.status]}`}
        actions={
          <>
            <Button component={Link} to="/tasks" variant="subtle" leftSection={<IconArrowLeft size={16} />}>
              До списку
            </Button>
            {me && <ActionMenu actions={actions} ctx={ctx} />}
          </>
        }
      />

      <Grid>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack>
            <Card
              withBorder
              radius="md"
              onContextMenu={(e) => {
                if (!me || e.shiftKey || window.getSelection()?.toString()) return;
                e.preventDefault();
                showContextMenu(toMenuItems(actions, ctx))(e);
              }}
            >
              <EditForm task={task} />
            </Card>

            <Title order={5}>Коментарі</Title>
            <CommentsPanel
              scope={{ entityType: 'task', entityId: task.id }}
              target={{ entityType: 'task', entityId: task.id }}
            />

            <Title order={5}>Документи</Title>
            <FilesPanel scope={{ entityType: 'task', entityId: task.id }} />
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 4 }}>
          <Paper withBorder p="md" radius="md">
            <Title order={5} mb="sm">
              Відомості
            </Title>
            <Stack gap="xs">
              <MetaField label="Автор" value={task.author?.fullName} />
              <MetaField label="Створено" value={formatRelative(task.createdAt)} />
              {task.completedAt && <MetaField label="Завершено" value={formatRelative(task.completedAt)} />}
              {task.result && <MetaField label="Результат" value={task.result} />}
              {task.cancelReason && <MetaField label="Причина скасування" value={task.cancelReason} />}
            </Stack>
          </Paper>
        </Grid.Col>
      </Grid>
    </>
  );
}

function MetaField({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm">{value}</Text>
    </div>
  );
}

function EditForm({ task }: { task: TaskItem }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<ClientOption | null>(task.client);

  const form = useForm({
    initialValues: {
      title: task.title,
      description: task.description ?? '',
      type: task.type as string,
      priority: task.priority as string,
      dueAt: task.dueAt ? task.dueAt.slice(0, 10) : null,
      assigneeId: task.assignee?.id ?? null,
    },
  });

  const users = useQuery({
    queryKey: ['users', 'lite'],
    queryFn: () => api.get<Array<{ id: string; fullName: string }>>('/users/lite'),
    staleTime: 60_000,
  });

  const update = useUpdateTask();
  const originalDueAtDate = task.dueAt ? task.dueAt.slice(0, 10) : null;

  const save = () => {
    setError(null);
    update.mutate(
      {
        id: task.id,
        updatedAt: task.updatedAt,
        title: form.values.title,
        // null, а не undefined: JSON.stringify викидає ключі зі значенням
        // undefined з тіла запиту, тому порожній опис ніколи не долетів би
        // до сервера і старий текст лишався б у БД (баг, знайдений 27.08.2026)
        description: form.values.description || null,
        type: form.values.type as TaskType,
        priority: form.values.priority as Priority,
        assigneeId: form.values.assigneeId,
        // Пересилати dueAt лише коли дату справді змінили: PATCH /tasks/:id,
        // на відміну від snooze, не робить endOfKyivDay сам — переслати
        // незмінене «YYYY-MM-DD» означало б мовчки зсунути строк із 23:59
        // Києва на 00:00 UTC, тобто на кілька годин раніше «зараз» (баг,
        // знайдений 27.08.2026: збереження форми через годину після
        // створення задачі робило її «простроченою»)
        ...(form.values.dueAt !== originalDueAtDate
          ? { dueAt: form.values.dueAt ? endOfKyivDay(new Date(form.values.dueAt)).toISOString() : undefined }
          : {}),
        // null, а не undefined — та сама причина: інакше відв'язати клієнта
        // (очистити поле) через цю форму було неможливо (баг, знайдений 27.08.2026)
        clientId: client?.id ?? null,
      },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: ['tasks'] });
          notifications.show({ color: 'green', message: 'Збережено' });
        },
        onError: (e) => {
          if (e instanceof ApiRequestError && e.status === 409) {
            setError('Дані змінено іншим користувачем — оновіть сторінку.');
          } else {
            setError(e instanceof ApiRequestError ? e.message : 'Помилка');
          }
        },
      },
    );
  };

  return (
    <Stack>
      {error && (
        <Alert color="red" variant="light">
          {error}
        </Alert>
      )}
      <TextInput label="Заголовок" {...form.getInputProps('title')} />
      <Textarea label="Опис" autosize minRows={2} {...form.getInputProps('description')} />

      <Group grow>
        <Select
          label="Тип"
          data={Object.entries(TASK_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          {...form.getInputProps('type')}
        />
        <Select
          label="Пріоритет"
          data={Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label }))}
          {...form.getInputProps('priority')}
        />
      </Group>

      <Group grow>
        <DateInput
          label="Термін"
          valueFormat="DD.MM.YYYY"
          clearable
          value={form.values.dueAt}
          onChange={(v) => form.setFieldValue('dueAt', v)}
        />
        <Select
          label="Виконавець"
          placeholder="Нерозподілена"
          clearable
          data={(users.data ?? []).map((u) => ({ value: u.id, label: u.fullName }))}
          value={form.values.assigneeId}
          onChange={(v) => form.setFieldValue('assigneeId', v)}
        />
      </Group>

      <ClientField client={client} onChange={setClient} />

      <Group>
        <Button onClick={save} loading={update.isPending}>
          Зберегти
        </Button>
        <Badge size="lg" variant="light">
          {TASK_STATUS_LABELS[task.status]}
        </Badge>
      </Group>
    </Stack>
  );
}
