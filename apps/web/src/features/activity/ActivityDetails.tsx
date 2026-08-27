import { Stack, Table, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { fieldLabel, formatFieldValue } from './labels';

export type ActivityEvent = {
  id: string;
  type: string;
  createdAt: string;
  actor: { fullName: string } | null;
  entityType?: string | null;
  payload: unknown;
};

type FieldChange = { field: string; from: unknown; to: unknown };

/** Чи є в події що показати — керує тим, чи малювати стрілку розгортання
 * (backlog «Деталізація стрічки активності»): порожня подія розгортання не потребує. */
export function hasDetails(event: ActivityEvent): boolean {
  const p = event.payload as Record<string, unknown> | null;
  if (!p || typeof p !== 'object') return false;
  switch (event.type) {
    case 'field_changed':
      return Array.isArray(p.changed) && p.changed.length > 0;
    case 'contact_logged':
    case 'task_completed':
      return typeof p.result === 'string' && p.result.trim().length > 0;
    case 'task_cancelled':
      return typeof p.reason === 'string' && p.reason.trim().length > 0;
    case 'comment':
      return typeof p.body === 'string' && p.body.trim().length > 0;
    case 'status_changed':
    case 'task_snoozed':
    case 'tag_added':
    case 'contact_added':
    case 'contact_removed':
    case 'file_added':
    case 'file_removed':
    case 'web_lead_unmapped_field':
      return true;
    case 'web_lead':
    case 'web_lead_duplicate':
      return Object.keys(p).length > 0;
    default:
      return false;
  }
}

/** Розгорнутий вміст рядка стрічки — по типу події показує саме те, що
 * зберігає ActivityEvent.payload (діф полів, текст результату, мітки тощо). */
export function ActivityDetails({ event }: { event: ActivityEvent }) {
  const p = (event.payload ?? {}) as Record<string, unknown>;

  switch (event.type) {
    case 'field_changed':
      return <FieldDiff entityType={event.entityType ?? 'client'} changed={(p.changed as FieldChange[]) ?? []} />;

    case 'contact_logged':
    case 'task_completed':
      return <Text size="sm">{String(p.result ?? '—')}</Text>;

    case 'task_cancelled':
      return <Text size="sm">Причина: {String(p.reason ?? '—')}</Text>;

    case 'comment':
      return (
        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
          {String(p.body ?? '')}
        </Text>
      );

    case 'status_changed':
      return (
        <Stack gap={2}>
          <Text size="sm">
            {String(p.fromLabel ?? '—')} → {String(p.toLabel ?? '—')}
          </Text>
          {!!p.reasonLabel && <Text size="sm">Причина: {String(p.reasonLabel)}</Text>}
          {!!p.comment && <Text size="sm">Коментар: {String(p.comment)}</Text>}
        </Stack>
      );

    case 'task_snoozed':
      return (
        <Text size="sm">
          {p.from ? new Date(String(p.from)).toLocaleString('uk-UA') : '—'} →{' '}
          {p.to ? new Date(String(p.to)).toLocaleString('uk-UA') : '—'}
        </Text>
      );

    case 'tag_added':
      return <Text size="sm">Тег: {String(p.name ?? '—')}</Text>;

    case 'contact_added':
    case 'contact_removed':
      return <Text size="sm">{String(p.fullName ?? 'без ПІБ')}</Text>;

    case 'file_added':
    case 'file_removed':
      return <Text size="sm">{String(p.originalName ?? '—')}</Text>;

    case 'web_lead_unmapped_field':
      return (
        <Text size="sm">
          Поле «{String(p.field ?? '—')}»: «{String(p.rawValue ?? '—')}»
        </Text>
      );

    case 'web_lead':
    case 'web_lead_duplicate':
      return <RawFields payload={p} />;

    default:
      return null;
  }
}

function FieldDiff({ entityType, changed }: { entityType: string; changed: FieldChange[] }) {
  const users = useQuery({
    queryKey: ['users', 'lite'],
    queryFn: () => api.get<Array<{ id: string; fullName: string }>>('/users/lite'),
    staleTime: 60_000,
    // Id-поля (assigneeId) трапляються лише в task_updated — не варто
    // тягнути список для решти типів подій.
    enabled: changed.some((c) => c.field === 'assigneeId'),
  });
  const userName = (id: unknown) => users.data?.find((u) => u.id === id)?.fullName ?? String(id);

  if (changed.length === 0) return null;

  return (
    <Table withRowBorders={false} verticalSpacing={2} fz="sm">
      <Table.Tbody>
        {changed.map((c) => (
          <Table.Tr key={c.field}>
            <Table.Td c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              {fieldLabel(entityType, c.field)}
            </Table.Td>
            <Table.Td>
              {c.field === 'assigneeId'
                ? `${c.from ? userName(c.from) : '—'} → ${c.to ? userName(c.to) : '—'}`
                : `${formatFieldValue(c.field, c.from)} → ${formatFieldValue(c.field, c.to)}`}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

/** web_lead/web_lead_duplicate: сире тіло заявки з сайту, довільні ключі. */
function RawFields({ payload }: { payload: Record<string, unknown> }) {
  const entries = Object.entries(payload).filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (entries.length === 0) return null;
  return (
    <Table withRowBorders={false} verticalSpacing={2} fz="sm">
      <Table.Tbody>
        {entries.map(([key, value]) => (
          <Table.Tr key={key}>
            <Table.Td c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              {key}
            </Table.Td>
            <Table.Td>{Array.isArray(value) ? value.join(', ') : String(value)}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
