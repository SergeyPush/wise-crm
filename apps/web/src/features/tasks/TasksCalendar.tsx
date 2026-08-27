import { ActionIcon, Badge, Group, Loader, Modal, Paper, SegmentedControl, SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { endOfKyivDay, kyivDateParts, startOfKyivDay } from 'shared';
import { EmptyState, ErrorState } from '../../components/EmptyState';
import { ApiRequestError } from '../../lib/api';
import { useTasks } from './api';
import { CalendarCell, MONTH_LABELS, WEEKDAY_LABELS, buildMonthGrid, dayKey } from './calendarGrid';
import { TASK_TYPE_LABELS, TaskItem } from './types';

// Скільки заголовків задачі влазить у клітинку, перш ніж поступитись місцем «+N ще».
const VISIBLE_PER_DAY = 3;

/**
 * Місячна сітка задач (backlog «Календар задач — глобальний огляд»):
 * список, згрупований за «Прострочені/Сьогодні/Цього тижня/Пізніше»
 * (`group.ts`), відповідає на «що робити зараз», але не на «що заплановано
 * на 15-те число» — цей екран саме про друге. Даних вистачає з наявного
 * GET /tasks?dueAfter=&dueBefore= — нового бекенду не знадобилось, лише
 * dueAfter (симетрично dueBefore, якого раніше не було).
 */
export function TasksCalendar() {
  const [cursor, setCursor] = useState(() => {
    const { year, month } = kyivDateParts(new Date());
    return { year, month };
  });
  const [scope, setScope] = useState<'mine' | 'all'>('all');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const navigate = useNavigate();

  const grid = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);
  const rangeStart = grid[0]!.date;
  const rangeEnd = grid[grid.length - 1]!.date;

  const query = useTasks({
    assigneeId: scope === 'mine' ? 'me' : undefined,
    status: 'OPEN,IN_PROGRESS',
    dueAfter: startOfKyivDay(rangeStart).toISOString(),
    dueBefore: endOfKyivDay(rangeEnd).toISOString(),
  });

  const byDay = useMemo(() => {
    const map = new Map<string, TaskItem[]>();
    for (const t of query.data?.items ?? []) {
      if (!t.dueAt) continue;
      const { year, month, day } = kyivDateParts(new Date(t.dueAt));
      const key = dayKey(year, month, day);
      const list = map.get(key);
      if (list) list.push(t);
      else map.set(key, [t]);
    }
    return map;
  }, [query.data]);

  const todayKey = useMemo(() => {
    const { year, month, day } = kyivDateParts(new Date());
    return dayKey(year, month, day);
  }, []);

  const shiftMonth = (delta: number) => {
    setCursor(({ year, month }) => {
      const total = year * 12 + (month - 1) + delta;
      return { year: Math.floor(total / 12), month: (total % 12) + 1 };
    });
  };

  const goToday = () => {
    const { year, month } = kyivDateParts(new Date());
    setCursor({ year, month });
  };

  const selectedTasks = selectedDay ? (byDay.get(selectedDay) ?? []) : [];

  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="wrap">
        <Group gap="xs">
          <ActionIcon variant="default" onClick={() => shiftMonth(-1)} aria-label="Попередній місяць">
            <IconChevronLeft size={16} />
          </ActionIcon>
          <Text fw={600} w={180} ta="center">
            {MONTH_LABELS[cursor.month - 1]} {cursor.year}
          </Text>
          <ActionIcon variant="default" onClick={() => shiftMonth(1)} aria-label="Наступний місяць">
            <IconChevronRight size={16} />
          </ActionIcon>
          <UnstyledButton onClick={goToday} c="blue" fz="sm" ml="xs">
            Сьогодні
          </UnstyledButton>
        </Group>
        <SegmentedControl
          value={scope}
          onChange={(v) => setScope(v as 'mine' | 'all')}
          data={[
            { value: 'mine', label: 'Мої' },
            { value: 'all', label: 'Всі' },
          ]}
        />
      </Group>

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
      ) : (
        <>
          <SimpleGrid cols={7} spacing={4}>
            {WEEKDAY_LABELS.map((d) => (
              <Text key={d} size="xs" c="dimmed" ta="center" fw={500}>
                {d}
              </Text>
            ))}
          </SimpleGrid>
          <SimpleGrid cols={7} spacing={4}>
            {grid.map((cell) => (
              <DayCell
                key={dayKey(cell.year, cell.month, cell.day)}
                cell={cell}
                isToday={dayKey(cell.year, cell.month, cell.day) === todayKey}
                tasks={byDay.get(dayKey(cell.year, cell.month, cell.day)) ?? []}
                onOpenTask={(id) => void navigate({ to: '/tasks/$taskId', params: { taskId: id } })}
                onShowAll={() => setSelectedDay(dayKey(cell.year, cell.month, cell.day))}
              />
            ))}
          </SimpleGrid>
        </>
      )}

      <Modal opened={!!selectedDay} onClose={() => setSelectedDay(null)} title={selectedDay ? formatDayTitle(selectedDay) : ''}>
        {selectedTasks.length === 0 ? (
          <EmptyState title="Задач немає" description="На цю дату нічого не заплановано" />
        ) : (
          <Stack gap={0}>
            {selectedTasks.map((t, i) => (
              <UnstyledButton
                key={t.id}
                p="xs"
                style={{ borderTop: i === 0 ? undefined : '1px solid var(--mantine-color-gray-2)' }}
                onClick={() => {
                  setSelectedDay(null);
                  void navigate({ to: '/tasks/$taskId', params: { taskId: t.id } });
                }}
              >
                <Group justify="space-between" wrap="nowrap">
                  <Stack gap={0} style={{ minWidth: 0 }}>
                    <Text size="sm" truncate>
                      {t.title}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {t.client?.displayName ?? '—'} · {t.assignee?.fullName ?? 'Нерозподілена'}
                    </Text>
                  </Stack>
                  <Badge size="sm" variant="light">
                    {TASK_TYPE_LABELS[t.type]}
                  </Badge>
                </Group>
              </UnstyledButton>
            ))}
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}

function DayCell({
  cell,
  isToday,
  tasks,
  onOpenTask,
  onShowAll,
}: {
  cell: CalendarCell;
  isToday: boolean;
  tasks: TaskItem[];
  onOpenTask: (id: string) => void;
  onShowAll: () => void;
}) {
  const visible = tasks.slice(0, VISIBLE_PER_DAY);
  const hiddenCount = tasks.length - visible.length;

  return (
    <Paper
      withBorder
      p={4}
      radius="sm"
      style={{
        minHeight: 96,
        opacity: cell.inMonth ? 1 : 0.45,
        borderColor: isToday ? 'var(--mantine-color-blue-5)' : undefined,
        borderWidth: isToday ? 2 : undefined,
      }}
    >
      <Group justify="space-between" wrap="nowrap" mb={2}>
        <Text size="xs" fw={isToday ? 700 : 400} c={isToday ? 'blue' : cell.inMonth ? undefined : 'dimmed'}>
          {cell.day}
        </Text>
        {tasks.length > 0 && (
          <Badge size="xs" variant="light" color="gray">
            {tasks.length}
          </Badge>
        )}
      </Group>
      <Stack gap={2}>
        {visible.map((t) => (
          <UnstyledButton key={t.id} onClick={() => onOpenTask(t.id)}>
            <Text size="xs" truncate title={t.title}>
              {t.title}
            </Text>
          </UnstyledButton>
        ))}
        {hiddenCount > 0 && (
          <UnstyledButton onClick={onShowAll}>
            <Text size="xs" c="blue">
              +{hiddenCount} ще
            </Text>
          </UnstyledButton>
        )}
      </Stack>
    </Paper>
  );
}

function formatDayTitle(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return `${d} ${MONTH_LABELS[m! - 1]!.toLowerCase()} ${y}`;
}
