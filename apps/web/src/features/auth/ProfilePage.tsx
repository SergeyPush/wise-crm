import { Alert, Button, Code, CopyButton, Group, Paper, PasswordInput, Select, Stack, Switch, Text, TextInput, Title } from '@mantine/core';
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
        <TelegramForm me={me} />
      </Stack>
    </>
  );
}

// 0-23 за Києвом — той самий діапазон, що й на бекенді (UpdateProfileDto.digestHour)
const DIGEST_HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: `${String(h).padStart(2, '0')}:00`,
}));

function ProfileForm({ me }: { me: Me }) {
  const qc = useQueryClient();
  const [testError, setTestError] = useState<string | null>(null);
  const [testSent, setTestSent] = useState(false);
  const form = useForm({
    initialValues: { fullName: me.fullName, phone: me.phone ?? '', digestHour: String(me.digestHour) },
  });

  const mutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      api.patch('/me', { ...values, digestHour: Number(values.digestHour) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });

  // Ручна перевірка каналу, не чекаючи свою digestHour — той самий сенс, що
  // й «Надіслати тестове повідомлення» у TelegramForm нижче.
  const sendNow = useMutation({
    mutationFn: () => api.post('/me/digest/test'),
    onSuccess: () => {
      setTestError(null);
      setTestSent(true);
    },
    onError: (e) => setTestError(e instanceof ApiRequestError ? e.message : 'Помилка'),
  });

  return (
    <Paper withBorder p="md" radius="md">
      <form onSubmit={form.onSubmit((v) => mutation.mutate(v))}>
        <Stack>
          <Title order={5}>Особисті дані</Title>
          <TextInput label="ПІБ" {...form.getInputProps('fullName')} />
          <TextInput label="Телефон" {...form.getInputProps('phone')} />
          <Select
            label="Час ранкового дайджесту"
            description="Лише в будні, і лише якщо є що показати (backlog 27.08.2026)"
            data={DIGEST_HOUR_OPTIONS}
            {...form.getInputProps('digestHour')}
          />
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
          {testError && (
            <Alert color="red" variant="light">
              {testError}
            </Alert>
          )}
          <Group>
            <Button type="button" variant="light" loading={sendNow.isPending} onClick={() => sendNow.mutate()}>
              Надіслати дайджест зараз
            </Button>
            {testSent && (
              <Text size="sm" c="green">
                Надіслано
              </Text>
            )}
          </Group>
        </Stack>
      </form>
    </Paper>
  );
}

/** FR-4.2/FR-4.4: діплінк на бота + тумблер сповіщень + тестове повідомлення. */
function TelegramForm({ me }: { me: Me }) {
  const qc = useQueryClient();
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testSent, setTestSent] = useState(false);

  const toggle = useMutation({
    mutationFn: (telegramEnabled: boolean) => api.patch('/me', { telegramEnabled }),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Помилка'),
  });

  const link = useMutation({
    mutationFn: () => api.post<{ url: string }>('/me/telegram/link'),
    onSuccess: (r) => {
      setError(null);
      setLinkUrl(r.url);
    },
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Помилка'),
  });

  const test = useMutation({
    mutationFn: () => api.post('/me/telegram/test'),
    onSuccess: () => {
      setError(null);
      setTestSent(true);
    },
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Помилка'),
  });

  return (
    <Paper withBorder p="md" radius="md">
      <Stack>
        <Title order={5}>Telegram</Title>
        <Text size="sm" c="dimmed">
          Сповіщення про призначені задачі, згадки та заявки з сайту дублюються в Telegram-бота.
        </Text>
        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}
        <Switch
          label="Надсилати сповіщення в Telegram"
          checked={me.telegramEnabled}
          disabled={toggle.isPending}
          onChange={(e) => toggle.mutate(e.currentTarget.checked)}
        />
        <Group>
          <Button variant="light" loading={link.isPending} onClick={() => link.mutate()}>
            Отримати посилання на бота
          </Button>
          <Button variant="light" loading={test.isPending} onClick={() => test.mutate()}>
            Надіслати тестове повідомлення
          </Button>
          {testSent && (
            <Text size="sm" c="green">
              Надіслано
            </Text>
          )}
        </Group>
        {linkUrl && (
          <Stack gap="xs">
            <Text size="sm">Відкрийте посилання в Telegram і натисніть «Start»:</Text>
            <Code block>{linkUrl}</Code>
            <CopyButton value={linkUrl}>
              {({ copied, copy }) => (
                <Button size="xs" variant={copied ? 'light' : 'default'} onClick={copy}>
                  {copied ? 'Скопійовано' : 'Скопіювати посилання'}
                </Button>
              )}
            </CopyButton>
          </Stack>
        )}
      </Stack>
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
