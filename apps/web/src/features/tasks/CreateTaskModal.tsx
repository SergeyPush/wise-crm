import { Alert, Button, Group, Modal, Select, Stack, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { TaskType, endOfKyivDay } from 'shared';
import { ApiRequestError, api } from '../../lib/api';
import { useMe } from '../auth/useAuth';
import { useCreateTask } from './api';
import { ClientField, ClientOption } from './ClientField';
import { TASK_TYPE_LABELS } from './types';

/**
 * Повна форма створення задачі за один крок (backlog 27.08.2026): заголовок +
 * клієнт + тип + виконавець + термін одразу, на відміну від швидкого
 * додавання («Що зробити? ⏎» на TasksPage) — там лише заголовок, а клієнт і
 * тип можна прилінкувати тільки заднім числом, вже відкривши картку задачі.
 */
export function CreateTaskModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { data: me } = useMe();
  const [client, setClient] = useState<ClientOption | null>(null);
  const createTask = useCreateTask();
  const [error, setError] = useState<string | null>(null);

  const users = useQuery({
    queryKey: ['users', 'lite'],
    queryFn: () => api.get<Array<{ id: string; fullName: string }>>('/users/lite'),
    staleTime: 60_000,
    enabled: opened,
  });

  // Обчислюється наново при кожному виклику (а не застигле initialValues) —
  // модалка змонтована постійно (TasksPage рендерить її незалежно від
  // opened), тому form.reset() зі статичним initialValues відкотив би
  // assigneeId до значення, зафіксованого при першому монтуванні: якщо на
  // той момент me ще не встиг завантажитись — до null («Нерозподілена») —
  // і лишав би його там до кінця сесії, навіть коли me вже підʼїхав (баг,
  // знайдений код-рев'ю 27.08.2026).
  function defaultValues() {
    return {
      title: '',
      type: 'OTHER' as string,
      // За замовчуванням — на себе, як і в швидкому додаванні (TasksPage) —
      // а не в пул, щоб не губилась там мовчки, коли автор і не думав про пул.
      assigneeId: me?.id ?? null,
      dueAt: new Date().toISOString().slice(0, 10) as string | null,
    };
  }

  const form = useForm({
    initialValues: defaultValues(),
    validate: {
      title: (v) => (v.trim().length > 0 ? null : 'Вкажіть заголовок'),
    },
  });

  // me підʼїжджає асинхронно (useMe) — форма вже могла змонтуватися з assigneeId: null
  useEffect(() => {
    if (me && form.values.assigneeId === null) form.setFieldValue('assigneeId', me.id);
  }, [me]);

  function reset() {
    const values = defaultValues();
    form.setValues(values);
    form.resetDirty(values);
    form.clearErrors();
    setClient(null);
    setError(null);
  }

  return (
    <Modal
      opened={opened}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Нова задача"
    >
      <form
        onSubmit={form.onSubmit((v) => {
          setError(null);
          createTask.mutate(
            {
              title: v.title.trim(),
              type: v.type as TaskType,
              clientId: client?.id,
              assigneeId: v.assigneeId,
              dueAt: v.dueAt ? endOfKyivDay(new Date(v.dueAt)).toISOString() : undefined,
            },
            {
              onSuccess: () => {
                reset();
                onClose();
              },
              onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Помилка'),
            },
          );
        })}
      >
        <Stack>
          {error && (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          )}
          <TextInput label="Заголовок" data-autofocus {...form.getInputProps('title')} />
          <ClientField client={client} onChange={setClient} />
          <Group grow>
            <Select
              label="Тип"
              data={Object.entries(TASK_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
              {...form.getInputProps('type')}
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
          <DateInput
            label="Термін"
            valueFormat="DD.MM.YYYY"
            clearable
            value={form.values.dueAt}
            onChange={(v) => form.setFieldValue('dueAt', v)}
          />
          <Button type="submit" loading={createTask.isPending} fullWidth>
            Створити
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
