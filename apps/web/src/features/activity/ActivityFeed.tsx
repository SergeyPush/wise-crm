import { Collapse, Group, Loader, Paper, Text, Timeline, UnstyledButton } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { IconChevronRight } from '@tabler/icons-react';
import { useState } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { api } from '../../lib/api';
import { formatRelative } from '../../lib/format';
import { ActivityDetails, ActivityEvent, hasDetails } from './ActivityDetails';

const ACTIVITY_LABELS: Record<string, string> = {
  client_created: 'Клієнта створено',
  field_changed: 'Змінено поля картки',
  status_changed: 'Змінено статус',
  assignee_changed: 'Змінено відповідального',
  contact_logged: 'Зафіксовано контакт',
  contact_added: 'Додано контактну особу',
  contact_removed: 'Видалено контактну особу',
  comment: 'Додано коментар',
  tag_added: 'Додано тег',
  tag_removed: 'Видалено тег',
  task_created: 'Поставлено задачу',
  task_updated: 'Змінено задачу',
  task_completed: 'Завершено задачу',
  task_cancelled: 'Скасовано задачу',
  task_snoozed: 'Перенесено термін задачі',
  task_reassigned: 'Перепризначено задачу',
  web_lead: 'Заявка з сайту',
  web_lead_duplicate: 'Повторна заявка з сайту',
  web_lead_unmapped_field: 'Не вдалося розпізнати значення поля заявки',
  file_added: 'Додано документ',
  file_removed: 'Видалено документ',
};

/** Стрічка клієнта (FR-2.16). Рядки з деталями (backlog «Деталізація
 * стрічки активності») розгортаються по кліку — payload уже зберігав ці дані
 * на бекенді, лишалось лише показати. */
export function ActivityFeed({ clientId }: { clientId: string }) {
  const query = useQuery({
    queryKey: ['clients', clientId, 'activity'],
    queryFn: () => api.get<{ items: ActivityEvent[] }>(`/clients/${clientId}/activity`),
  });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Paper withBorder p="md" radius="md">
      <Timeline bulletSize={16} lineWidth={2}>
        {items.map((e) => {
          const expandable = hasDetails(e);
          const isOpen = expanded.has(e.id);
          return (
            <Timeline.Item
              key={e.id}
              title={
                expandable ? (
                  <UnstyledButton onClick={() => toggle(e.id)}>
                    <Group gap={4} wrap="nowrap">
                      <IconChevronRight
                        size={12}
                        style={{ transform: isOpen ? 'rotate(90deg)' : undefined, transition: 'transform 0.1s', flexShrink: 0 }}
                      />
                      <Text size="sm" fw={500}>
                        {ACTIVITY_LABELS[e.type] ?? e.type}
                      </Text>
                    </Group>
                  </UnstyledButton>
                ) : (
                  ACTIVITY_LABELS[e.type] ?? e.type
                )
              }
            >
              <Text size="xs" c="dimmed">
                {e.actor?.fullName ?? 'Система'} · {formatRelative(e.createdAt)}
              </Text>
              {expandable && (
                <Collapse in={isOpen}>
                  <div style={{ marginTop: 4 }}>
                    <ActivityDetails event={e} />
                  </div>
                </Collapse>
              )}
            </Timeline.Item>
          );
        })}
      </Timeline>
    </Paper>
  );
}
