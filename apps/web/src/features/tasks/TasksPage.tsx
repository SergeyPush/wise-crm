import { Badge, Checkbox, Collapse, Group, Loader, Paper, SegmentedControl, Stack, Text, TextInput, Title, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useNavigate } from '@tanstack/react-router';
import { useContextMenu } from 'mantine-contextmenu';
import { useMemo, useState } from 'react';
import { EmptyState, ErrorState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { ApiRequestError } from '../../lib/api';
import { formatRelative } from '../../lib/format';
import { useMe } from '../auth/useAuth';
import { ActionMenu } from '../registry/ActionMenu';
import { toMenuItems } from '../registry/toMenuItems';
import { useCompleteTask, useCreateTask, useTasks } from './api';
import { GROUP_COLLAPSED_BY_DEFAULT, GROUP_LABELS, GROUP_ORDER, groupTasks } from './group';
import { useTaskActions } from './actions';
import { openCompleteTaskModal } from './TaskModals';
import { TASK_TYPE_LABELS, TaskItem } from './types';

type Tab = 'mine' | 'all';
const REQUIRES_RESULT = new Set(['CALL', 'PROPOSAL', 'CONTRACT']);

export function TasksPage() {
  const [tab, setTab] = useState<Tab>('mine');
  const [quickTitle, setQuickTitle] = useState('');
  const createTask = useCreateTask();

  const query = useTasks({
    assigneeId: tab === 'mine' ? 'me' : undefined,
    status: 'OPEN,IN_PROGRESS',
  });

  const groups = useMemo(() => groupTasks(query.data?.items ?? []), [query.data]);

  return (
    <>
      <PageHeader title="Задачі" />

      <Stack gap="sm">
        <SegmentedControl
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          data={[
            { value: 'mine', label: 'Мої' },
            { value: 'all', label: 'Всі' },
          ]}
          w={200}
        />

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const title = quickTitle.trim();
            if (!title) return;
            createTask.mutate(
              { title },
              { onSuccess: () => setQuickTitle('') },
            );
          }}
        >
          <TextInput
            placeholder="Що зробити? Enter → задача на себе, сьогодні"
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.currentTarget.value)}
            disabled={createTask.isPending}
          />
        </form>

        {query.isLoading ? (
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        ) : query.isError ? (
          <ErrorState
            message={query.error instanceof ApiRequestError ? query.error.message : 'Не вдалося завантажити задачі'}
            requestId={query.error instanceof ApiRequestError ? query.error.requestId : undefined}
            onRetry={() => query.refetch()}
          />
        ) : !query.data || query.data.items.length === 0 ? (
          <EmptyState
            title="Задач немає"
            description={tab === 'mine' ? 'Усі ваші задачі виконано — гарний знак' : 'У системі поки немає відкритих задач'}
          />
        ) : (
          <Stack gap="md">
            {GROUP_ORDER.map((group) => {
              const rows = groups[group];
              if (!rows.length) return null;
              return (
                <TaskGroupSection
                  key={group}
                  title={GROUP_LABELS[group]}
                  danger={group === 'overdue'}
                  tasks={rows}
                  defaultCollapsed={GROUP_COLLAPSED_BY_DEFAULT[group]}
                />
              );
            })}
          </Stack>
        )}
      </Stack>
    </>
  );
}

function TaskGroupSection({
  title,
  danger,
  tasks,
  defaultCollapsed,
}: {
  title: string;
  danger: boolean;
  tasks: TaskItem[];
  defaultCollapsed: boolean;
}) {
  const [opened, { toggle }] = useDisclosure(!defaultCollapsed);

  return (
    <Stack gap="xs">
      <UnstyledButton onClick={toggle}>
        <Group gap="xs">
          {opened ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          <Title order={5} c={danger ? 'red' : undefined}>
            {title}
          </Title>
          <Badge size="sm" variant="light" color={danger ? 'red' : 'gray'}>
            {tasks.length}
          </Badge>
        </Group>
      </UnstyledButton>
      <Collapse in={opened}>
        <Paper withBorder radius="md">
          {tasks.map((task, index) => (
            <TaskRow key={task.id} task={task} isFirst={index === 0} />
          ))}
        </Paper>
      </Collapse>
    </Stack>
  );
}

function TaskRow({ task, isFirst }: { task: TaskItem; isFirst: boolean }) {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const { showContextMenu } = useContextMenu();
  const actions = useTaskActions();
  const complete = useCompleteTask();

  const ctx = { user: me!, record: task };

  return (
    <Group
      p="sm"
      justify="space-between"
      wrap="nowrap"
      style={{ borderTop: isFirst ? undefined : '1px solid var(--mantine-color-gray-2)', cursor: 'default' }}
      onContextMenu={(e) => {
        // FR-8.5: Shift+ПКМ і виділений текст — нативне меню браузера, не наше
        if (!me || e.shiftKey || window.getSelection()?.toString()) return;
        e.preventDefault();
        showContextMenu(toMenuItems(actions, ctx))(e);
      }}
    >
      <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
        <Checkbox
          aria-label={`Завершити «${task.title}»`}
          checked={false}
          onChange={() => {
            // FR-3.5: для ДЗВІНОК/КП/ДОГОВІР результат обов'язковий — питаємо; решта закривається одразу
            if (REQUIRES_RESULT.has(task.type)) {
              openCompleteTaskModal(task.type, (result) => complete.mutate({ id: task.id, result }));
            } else {
              complete.mutate({ id: task.id });
            }
          }}
        />
        <Stack gap={0} style={{ minWidth: 0 }}>
          <Text
            size="sm"
            style={task.client ? { cursor: 'pointer' } : undefined}
            onClick={() => task.client && void navigate({ to: '/clients/$clientId', params: { clientId: task.client.id } })}
          >
            {task.title}
          </Text>
          <Text size="xs" c="dimmed" truncate>
            {task.client?.displayName ?? '—'}
          </Text>
        </Stack>
      </Group>
      <Group gap="xs" wrap="nowrap">
        <Text size="xs" c="dimmed">
          {task.dueAt ? formatRelative(task.dueAt) : ''}
        </Text>
        <Badge size="sm" variant="light">
          {TASK_TYPE_LABELS[task.type]}
        </Badge>
        <Text size="xs" c={task.assignee ? 'dimmed' : 'orange'} w={110} truncate>
          {task.assignee?.fullName ?? 'Нерозподілена'}
        </Text>
        {me && <ActionMenu actions={actions} ctx={ctx} />}
      </Group>
    </Group>
  );
}
