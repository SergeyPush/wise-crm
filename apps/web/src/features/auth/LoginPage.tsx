import { Alert, Button, Center, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ApiRequestError } from '../../lib/api';
import { useLogin } from './useAuth';

/**
 * Вход по email и паролю. 2FA в MVP не делается (решение от 26.08.2026,
 * 01-functional-requirements.md, раздел 9).
 *
 * Тут намеренно нет «Забули пароль?» — писем система не шлёт (FR-1.1),
 * восстановление идёт через адміністратора.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const login = useLogin();
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);

  const form = useForm({
    initialValues: { email: '', password: '' },
    validate: {
      email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? null : 'Введіть коректну пошту'),
      password: (v) => (v.length ? null : 'Введіть пароль'),
    },
  });

  const submit = form.onSubmit((values) => {
    setError(null);
    login.mutate(values, {
      onSuccess: () => navigate({ to: '/' }),
      onError: (e) => {
        if (e instanceof ApiRequestError) {
          setError({ message: e.message, requestId: e.requestId });
        } else {
          setError({ message: 'Не вдалося зʼєднатися з сервером' });
        }
      },
    });
  });

  return (
    <Center h="100vh" p="md">
      <Paper withBorder shadow="sm" p="xl" radius="md" w={400}>
        <form onSubmit={submit}>
          <Stack>
            <Stack gap={4} align="center">
              <img src="/logo.png" alt="WiseCRM" width={48} height={48} style={{ borderRadius: 10, marginBottom: 4 }} />
              <Title order={3}>Вхід до WiseCRM</Title>
              <Text size="sm" c="dimmed">
                Внутрішня система компанії
              </Text>
            </Stack>

            {error && (
              <Alert color="red" variant="light">
                {error.message}
                {error.requestId && (
                  <Text size="xs" c="dimmed" mt={4}>
                    Код: {error.requestId}
                  </Text>
                )}
              </Alert>
            )}

            <TextInput
              label="Пошта"
              placeholder="name@wisexpert.com.ua"
              autoComplete="username"
              {...form.getInputProps('email')}
            />
            <PasswordInput
              label="Пароль"
              autoComplete="current-password"
              {...form.getInputProps('password')}
            />

            <Button type="submit" loading={login.isPending} fullWidth mt="xs">
              Увійти
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
