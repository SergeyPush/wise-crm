import {
  Alert,
  Badge,
  Button,
  ColorInput,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconPencil, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState, ErrorState } from '../../components/EmptyState';
import { ApiRequestError, api } from '../../lib/api';
import { LeadSourceEntry, LostReasonEntry, TagEntry } from './types';

/**
 * Три редаговані довідники (розділ 3 плану): джерела лідів, причини відмови,
 * теги. Решта — лише міграцією, тому їх тут немає навіть на перегляд.
 */
export function DictionariesPage() {
  return (
    <>
      <PageHeader title="Довідники" subtitle="Джерела лідів, причини відмови та теги — решта заводиться міграцією" />
      <Tabs defaultValue="lead-sources">
        <Tabs.List mb="md">
          <Tabs.Tab value="lead-sources">Джерела лідів</Tabs.Tab>
          <Tabs.Tab value="lost-reasons">Причини відмови</Tabs.Tab>
          <Tabs.Tab value="tags">Теги</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="lead-sources">
          <CodeLabelTable kind="lead-sources" title="джерело" />
        </Tabs.Panel>
        <Tabs.Panel value="lost-reasons">
          <CodeLabelTable kind="lost-reasons" title="причину" />
        </Tabs.Panel>
        <Tabs.Panel value="tags">
          <TagsTable />
        </Tabs.Panel>
      </Tabs>
    </>
  );
}

type CodeLabelKind = 'lead-sources' | 'lost-reasons';

/** Джерела лідів і причини відмови — однакова форма (code + label + sortOrder). */
function CodeLabelTable({ kind, title }: { kind: CodeLabelKind; title: string }) {
  const [editing, setEditing] = useState<LeadSourceEntry | LostReasonEntry | null>(null);
  const [creating, creatingHandlers] = useDisclosure(false);

  const query = useQuery({
    queryKey: ['dictionaries', kind, 'all'],
    // isActive=false теж потрібні тут — на екрані керування деактивоване не ховаємо
    queryFn: () => api.get<Array<LeadSourceEntry | LostReasonEntry>>(`/dictionaries/${kind}`),
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
    return (
      <ErrorState
        message={e instanceof ApiRequestError ? e.message : 'Не вдалося завантажити довідник'}
        requestId={e instanceof ApiRequestError ? e.requestId : undefined}
        onRetry={() => query.refetch()}
      />
    );
  }

  const items = query.data ?? [];

  return (
    <>
      <Group justify="flex-end" mb="sm">
        <Button leftSection={<IconPlus size={16} />} onClick={creatingHandlers.open}>
          Додати {title}
        </Button>
      </Group>

      {items.length === 0 ? (
        <EmptyState title="Довідник порожній" description="Додайте перший запис кнопкою вище" />
      ) : (
        <Paper withBorder radius="md">
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Код</Table.Th>
                <Table.Th>Назва</Table.Th>
                <Table.Th>Порядок</Table.Th>
                <Table.Th>Стан</Table.Th>
                <Table.Th w={48} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((item) => (
                <Table.Tr key={item.id} opacity={item.isActive ? 1 : 0.55}>
                  <Table.Td>
                    <Text size="sm">{item.code}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6}>
                      <Text size="sm">{item.label}</Text>
                      {'isSystem' in item && item.isSystem && (
                        <Badge size="xs" variant="light" color="gray">
                          системне
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {item.sortOrder}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {!item.isActive && (
                      <Badge size="sm" color="red" variant="light">
                        деактивовано
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Button variant="subtle" size="xs" px={6} onClick={() => setEditing(item)}>
                      <IconPencil size={16} />
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}

      {creating && (
        <CodeLabelModal
          kind={kind}
          title={`Нове ${title}`}
          onClose={creatingHandlers.close}
        />
      )}
      {editing && (
        <CodeLabelModal
          kind={kind}
          title="Редагування"
          entry={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function CodeLabelModal({
  kind,
  title,
  entry,
  onClose,
}: {
  kind: CodeLabelKind;
  title: string;
  entry?: LeadSourceEntry | LostReasonEntry;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const isSystem = entry && 'isSystem' in entry && entry.isSystem;

  const form = useForm({
    initialValues: {
      code: entry?.code ?? '',
      label: entry?.label ?? '',
      sortOrder: entry?.sortOrder ?? 0,
      isActive: entry?.isActive ?? true,
    },
    validate: {
      code: (v) => (v.trim().length > 0 ? null : "Обов'язкове поле"),
      label: (v) => (v.trim().length > 0 ? null : "Обов'язкове поле"),
    },
  });

  const mutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      entry
        ? api.patch(`/dictionaries/${kind}/${entry.id}`, values)
        : api.post(`/dictionaries/${kind}`, values),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dictionaries', kind] });
      onClose();
    },
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Помилка'),
  });

  return (
    <Modal opened onClose={onClose} title={title}>
      <form
        onSubmit={form.onSubmit((v) => {
          setError(null);
          mutation.mutate(v);
        })}
      >
        <Group grow mb="sm">
          <TextInput label="Код" {...form.getInputProps('code')} disabled={isSystem} />
          <NumberInput label="Порядок" min={0} {...form.getInputProps('sortOrder')} />
        </Group>
        <TextInput label="Назва" mb="sm" {...form.getInputProps('label')} />
        {entry && (
          <Switch
            label="Активний"
            mb="sm"
            checked={form.values.isActive}
            disabled={isSystem}
            description={isSystem ? 'Системне джерело не можна деактивувати (FR-W5)' : undefined}
            onChange={(e) => form.setFieldValue('isActive', e.currentTarget.checked)}
          />
        )}
        {error && (
          <Alert color="red" variant="light" mb="sm">
            {error}
          </Alert>
        )}
        <Button type="submit" loading={mutation.isPending} fullWidth>
          Зберегти
        </Button>
      </form>
    </Modal>
  );
}

function TagsTable() {
  const [editing, setEditing] = useState<TagEntry | null>(null);
  const [creating, creatingHandlers] = useDisclosure(false);

  const query = useQuery({
    queryKey: ['dictionaries', 'tags', 'all'],
    queryFn: () => api.get<TagEntry[]>('/dictionaries/tags'),
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
    return (
      <ErrorState
        message={e instanceof ApiRequestError ? e.message : 'Не вдалося завантажити теги'}
        requestId={e instanceof ApiRequestError ? e.requestId : undefined}
        onRetry={() => query.refetch()}
      />
    );
  }

  const tags = query.data ?? [];

  return (
    <>
      <Group justify="flex-end" mb="sm">
        <Button leftSection={<IconPlus size={16} />} onClick={creatingHandlers.open}>
          Додати тег
        </Button>
      </Group>

      {tags.length === 0 ? (
        <EmptyState title="Тегів ще немає" description="Додайте перший тег кнопкою вище" />
      ) : (
        <Group gap="xs">
          {tags.map((t) => (
            <Badge
              key={t.id}
              color={t.color}
              variant="light"
              size="lg"
              style={{ cursor: 'pointer' }}
              onClick={() => setEditing(t)}
            >
              {t.name}
            </Badge>
          ))}
        </Group>
      )}

      {(creating || editing) && (
        <TagModal
          entry={editing ?? undefined}
          onClose={() => {
            creatingHandlers.close();
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function TagModal({ entry, onClose }: { entry?: TagEntry; onClose: () => void }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    initialValues: { name: entry?.name ?? '', color: entry?.color ?? 'gray' },
    validate: { name: (v) => (v.trim().length > 0 ? null : "Обов'язкове поле") },
  });

  const mutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      entry ? api.patch(`/dictionaries/tags/${entry.id}`, values) : api.post('/dictionaries/tags', values),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['dictionaries', 'tags'] });
      onClose();
    },
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Помилка'),
  });

  return (
    <Modal opened onClose={onClose} title={entry ? 'Редагування тегу' : 'Новий тег'}>
      <form
        onSubmit={form.onSubmit((v) => {
          setError(null);
          mutation.mutate(v);
        })}
      >
        <TextInput label="Назва" mb="sm" data-autofocus {...form.getInputProps('name')} />
        <ColorInput label="Колір" mb="sm" {...form.getInputProps('color')} />
        {error && (
          <Alert color="red" variant="light" mb="sm">
            {error}
          </Alert>
        )}
        <Button type="submit" loading={mutation.isPending} fullWidth>
          Зберегти
        </Button>
      </form>
    </Modal>
  );
}
