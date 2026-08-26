import { Badge, Button, Checkbox, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { PROTO_TASKS, ProtoTask } from '../clients/prototype-data';

/**
 * ПРОТОТИП списка задач (этап 1). Группировка по срокам считается на клиенте
 * (09-implementation-plan.md, раздел 1); здесь она зашита в демо-данные.
 */
const GROUPS: Array<ProtoTask['group']> = ['Прострочені', 'Сьогодні', 'Завтра', 'Цього тижня'];

export function TasksPage() {
  const [tasks, setTasks] = useState(PROTO_TASKS);

  return (
    <>
      <PageHeader
        title="Задачі"
        subtitle="Прототип: дані демонстраційні"
        actions={<Button leftSection={<IconPlus size={16} />}>Нова задача</Button>}
      />

      <Stack>
        {GROUPS.map((group) => {
          const rows = tasks.filter((t) => t.group === group);
          if (!rows.length) return null;
          return (
            <Stack key={group} gap="xs">
              <Group gap="xs">
                <Title order={5} c={group === 'Прострочені' ? 'red' : undefined}>
                  {group}
                </Title>
                <Badge size="sm" variant="light" color={group === 'Прострочені' ? 'red' : 'gray'}>
                  {rows.length}
                </Badge>
              </Group>
              <Paper withBorder radius="md">
                {rows.map((task, index) => (
                  <Group
                    key={task.id}
                    p="sm"
                    justify="space-between"
                    wrap="nowrap"
                    style={{
                      borderTop: index === 0 ? undefined : '1px solid var(--mantine-color-gray-2)',
                    }}
                  >
                    <Group gap="sm" wrap="nowrap">
                      <Checkbox
                        checked={task.done}
                        onChange={(e) =>
                          setTasks((prev) =>
                            prev.map((t) =>
                              t.id === task.id ? { ...t, done: e.currentTarget.checked } : t,
                            ),
                          )
                        }
                      />
                      <Stack gap={0}>
                        <Text size="sm" td={task.done ? 'line-through' : undefined}>
                          {task.title}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {task.client}
                        </Text>
                      </Stack>
                    </Group>
                    <Group gap="xs" wrap="nowrap">
                      <Badge size="sm" variant="light">
                        {task.type}
                      </Badge>
                      <Text size="xs" c={task.assignee === 'Нерозподілена' ? 'orange' : 'dimmed'}>
                        {task.assignee}
                      </Text>
                    </Group>
                  </Group>
                ))}
              </Paper>
            </Stack>
          );
        })}
      </Stack>
    </>
  );
}
