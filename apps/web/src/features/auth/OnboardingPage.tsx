import { Alert, Button, Center, Paper, PasswordInput, Stack, Text, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AUTH } from 'shared';
import { ApiRequestError, api } from '../../lib/api';

/**
 * Экран обязательной смены временного пароля. Сервер не пускает дальше,
 * пока не сменён временный пароль (FR-1.3, FR-1.6); этот экран просто делает
 * требование видимым. 2FA в MVP не делается (решение от 26.08.2026), поэтому
 * это единственный шаг онбординга.
 */
export function OnboardingPage() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    initialValues: { currentPassword: '', newPassword: '', repeat: '' },
    validate: {
      newPassword: (v) =>
        v.length >= AUTH.PASSWORD_MIN_LENGTH
          ? null
          : `Щонайменше ${AUTH.PASSWORD_MIN_LENGTH} символів`,
      repeat: (v, values) => (v === values.newPassword ? null : 'Паролі не збігаються'),
    },
  });

  const mutation = useMutation({
    mutationFn: (vars: { currentPassword: string; newPassword: string }) =>
      api.post('/me/password', vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Помилка'),
  });

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder shadow="sm" p="xl" radius="md" w={420}>
        <form
          onSubmit={form.onSubmit((v) =>
            mutation.mutate({ currentPassword: v.currentPassword, newPassword: v.newPassword }),
          )}
        >
          <Stack>
            <Title order={3}>Заміна тимчасового пароля</Title>
            <Text size="sm" c="dimmed">
              Вхід можливий лише після заміни пароля, виданого адміністратором.
            </Text>
            {error && (
              <Alert color="red" variant="light">
                {error}
              </Alert>
            )}
            <PasswordInput
              label="Тимчасовий пароль"
              autoComplete="current-password"
              {...form.getInputProps('currentPassword')}
            />
            <PasswordInput
              label="Новий пароль"
              description={`Мінімум ${AUTH.PASSWORD_MIN_LENGTH} символів, не зі списку скомпрометованих`}
              autoComplete="new-password"
              {...form.getInputProps('newPassword')}
            />
            <PasswordInput
              label="Повторіть пароль"
              autoComplete="new-password"
              {...form.getInputProps('repeat')}
            />
            <Button type="submit" loading={mutation.isPending}>
              Зберегти пароль
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
