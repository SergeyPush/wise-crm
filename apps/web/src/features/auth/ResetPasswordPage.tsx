import { Alert, Button, Center, Paper, PasswordInput, Stack, Text, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { AUTH } from 'shared';
import { ApiRequestError, api } from '../../lib/api';

/**
 * Установка пароля по одноразовой ссылке (FR-1.3). Ссылку передаёт админ лично
 * или в Telegram — писем система не шлёт, и в текстах это нигде не обещается.
 */
export function ResetPasswordPage() {
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const form = useForm({
    initialValues: { newPassword: '', repeat: '' },
    validate: {
      newPassword: (v) =>
        v.length >= AUTH.PASSWORD_MIN_LENGTH ? null : `Щонайменше ${AUTH.PASSWORD_MIN_LENGTH} символів`,
      repeat: (v, values) => (v === values.newPassword ? null : 'Паролі не збігаються'),
    },
  });

  const mutation = useMutation({
    mutationFn: (newPassword: string) => api.post('/auth/complete-reset', { token, newPassword }),
    onSuccess: () => setDone(true),
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Помилка'),
  });

  return (
    <Center h="100vh" p="md">
      <Paper withBorder shadow="sm" p="xl" radius="md" w={400}>
        {done ? (
          <Stack>
            <Title order={4}>Пароль встановлено</Title>
            <Text size="sm" c="dimmed">
              Тепер увійдіть із новим паролем.
            </Text>
            <Button component="a" href="/login">
              До входу
            </Button>
          </Stack>
        ) : (
          <form
            onSubmit={form.onSubmit((v) => {
              setError(null);
              mutation.mutate(v.newPassword);
            })}
          >
            <Stack>
              <Title order={4}>Встановлення пароля</Title>
              {!token && (
                <Alert color="red" variant="light">
                  Посилання неповне. Попросіть адміністратора надіслати нове.
                </Alert>
              )}
              {error && (
                <Alert color="red" variant="light">
                  {error}
                </Alert>
              )}
              <PasswordInput label="Новий пароль" {...form.getInputProps('newPassword')} />
              <PasswordInput label="Повторіть" {...form.getInputProps('repeat')} />
              <Button type="submit" loading={mutation.isPending} disabled={!token}>
                Зберегти
              </Button>
            </Stack>
          </form>
        )}
      </Paper>
    </Center>
  );
}
