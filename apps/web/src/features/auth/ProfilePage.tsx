import { Alert, Button, Group, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AUTH } from 'shared';
import { ApiRequestError, api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { Me } from './useAuth';

export function ProfilePage({ me }: { me: Me }) {
  return (
    <>
      <PageHeader title="Профіль" subtitle={me.email} />
      <Stack maw={560}>
        <ProfileForm me={me} />
        <PasswordForm />
      </Stack>
    </>
  );
}

function ProfileForm({ me }: { me: Me }) {
  const qc = useQueryClient();
  const form = useForm({
    initialValues: { fullName: me.fullName, phone: me.phone ?? '' },
  });

  const mutation = useMutation({
    mutationFn: (values: typeof form.values) => api.patch('/me', values),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });

  return (
    <Paper withBorder p="md" radius="md">
      <form onSubmit={form.onSubmit((v) => mutation.mutate(v))}>
        <Stack>
          <Title order={5}>Особисті дані</Title>
          <TextInput label="ПІБ" {...form.getInputProps('fullName')} />
          <TextInput label="Телефон" {...form.getInputProps('phone')} />
          <Group>
            <Button type="submit" loading={mutation.isPending}>
              Зберегти
            </Button>
            {mutation.isSuccess && (
              <Text size="sm" c="green">
                Збережено
              </Text>
            )}
          </Group>
        </Stack>
      </form>
    </Paper>
  );
}

function PasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    initialValues: { currentPassword: '', newPassword: '', repeat: '' },
    validate: {
      newPassword: (v) =>
        v.length >= AUTH.PASSWORD_MIN_LENGTH ? null : `Щонайменше ${AUTH.PASSWORD_MIN_LENGTH} символів`,
      repeat: (v, values) => (v === values.newPassword ? null : 'Паролі не збігаються'),
    },
  });

  const mutation = useMutation({
    mutationFn: (v: typeof form.values) =>
      api.post('/me/password', { currentPassword: v.currentPassword, newPassword: v.newPassword }),
    onSuccess: () => {
      form.reset();
      // Смена пароля отзывает все сессии — включая текущую
      window.location.assign('/login');
    },
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Помилка'),
  });

  return (
    <Paper withBorder p="md" radius="md">
      <form
        onSubmit={form.onSubmit((v) => {
          setError(null);
          mutation.mutate(v);
        })}
      >
        <Stack>
          <Title order={5}>Зміна пароля</Title>
          <Text size="sm" c="dimmed">
            Після зміни доведеться увійти заново на всіх пристроях.
          </Text>
          {error && (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          )}
          <PasswordInput label="Поточний пароль" {...form.getInputProps('currentPassword')} />
          <PasswordInput label="Новий пароль" {...form.getInputProps('newPassword')} />
          <PasswordInput label="Повторіть" {...form.getInputProps('repeat')} />
          <Button type="submit" loading={mutation.isPending}>
            Змінити пароль
          </Button>
        </Stack>
      </form>
    </Paper>
  );
}
