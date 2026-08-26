import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Code,
  CopyButton,
  Drawer,
  Group,
  Loader,
  Menu,
  Modal,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconDotsVertical, IconKey, IconPlus, IconUserOff } from '@tabler/icons-react';
import { useState } from 'react';
import { Paginated, Role } from 'shared';
import { ApiRequestError, api } from '../../lib/api';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState, ErrorState } from '../../components/EmptyState';

type UserRow = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  position: string | null;
  role: Role;
  isActive: boolean;
  isProtected: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
};

export function UsersPage() {
  const qc = useQueryClient();
  const [createOpened, createHandlers] = useDisclosure(false);
  const [showInactive, setShowInactive] = useState(false);
  // Одноразовая ссылка показывается один раз — её нужно скопировать и передать
  const [issuedLink, setIssuedLink] = useState<{ name: string; url: string } | null>(null);

  const query = useQuery({
    queryKey: ['users', { showInactive }],
    queryFn: () =>
      api.get<Paginated<UserRow>>(`/users?limit=100${showInactive ? '' : '&isActive=true'}`),
  });

  const resetPassword = useMutation({
    mutationFn: (user: UserRow) =>
      api
        .post<{ resetToken: string }>(`/users/${user.id}/reset-password`)
        .then((r) => ({ user, token: r.resetToken })),
    onSuccess: ({ user, token }) => {
      setIssuedLink({ name: user.fullName, url: resetUrl(token) });
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const deactivate = useMutation({
    mutationFn: (id: string) =>
      api.post<{ tasksReassigned: number; clientsPrimaryMoved: number }>(`/users/${id}/deactivate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const activate = useMutation({
    mutationFn: (id: string) => api.post(`/users/${id}/activate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
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
        message={e instanceof ApiRequestError ? e.message : 'Не вдалося завантажити список'}
        requestId={e instanceof ApiRequestError ? e.requestId : undefined}
        onRetry={() => query.refetch()}
      />
    );
  }

  const users = query.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Користувачі"
        subtitle="Співробітників заводить адміністратор — публічної реєстрації немає"
        actions={
          <>
            <Switch
              label="Показати деактивованих"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.currentTarget.checked)}
            />
            <Button leftSection={<IconPlus size={16} />} onClick={createHandlers.open}>
              Додати
            </Button>
          </>
        }
      />

      {users.length === 0 ? (
        <EmptyState
          title="Поки що нікого немає"
          description="Створіть першого співробітника — система видасть одноразове посилання для входу"
          action={<Button onClick={createHandlers.open}>Додати співробітника</Button>}
        />
      ) : (
        <Paper withBorder radius="md">
          <Table.ScrollContainer minWidth={760}>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ПІБ</Table.Th>
                  <Table.Th>Пошта</Table.Th>
                  <Table.Th>Роль</Table.Th>
                  <Table.Th>Стан</Table.Th>
                  <Table.Th w={48} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {users.map((u) => (
                  <Table.Tr key={u.id} opacity={u.isActive ? 1 : 0.55}>
                    <Table.Td>
                      <Group gap="xs">
                        <Text size="sm">{u.fullName}</Text>
                        {u.isProtected && (
                          <Badge size="xs" variant="light" color="gray">
                            власник
                          </Badge>
                        )}
                      </Group>
                      {u.position && (
                        <Text size="xs" c="dimmed">
                          {u.position}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{u.email}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={u.role === 'ADMIN' ? 'brand' : 'gray'}>
                        {u.role === 'ADMIN' ? 'Адміністратор' : 'Співробітник'}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={6}>
                        {!u.isActive && (
                          <Badge size="sm" color="red" variant="light">
                            деактивований
                          </Badge>
                        )}
                        {u.mustChangePassword && (
                          <Badge size="sm" color="yellow" variant="light">
                            не увійшов
                          </Badge>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Menu position="bottom-end">
                        <Menu.Target>
                          <ActionIcon variant="subtle" color="gray">
                            <IconDotsVertical size={16} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item
                            leftSection={<IconKey size={16} />}
                            disabled={u.isProtected}
                            onClick={() => resetPassword.mutate(u)}
                          >
                            Скинути пароль
                          </Menu.Item>
                          {u.isActive ? (
                            <Menu.Item
                              color="red"
                              leftSection={<IconUserOff size={16} />}
                              disabled={u.isProtected}
                              onClick={() => deactivate.mutate(u.id)}
                            >
                              Деактивувати
                            </Menu.Item>
                          ) : (
                            <Menu.Item onClick={() => activate.mutate(u.id)}>Активувати</Menu.Item>
                          )}
                        </Menu.Dropdown>
                      </Menu>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}

      <CreateUserDrawer
        opened={createOpened}
        onClose={createHandlers.close}
        onCreated={(name, token) => {
          setIssuedLink({ name, url: resetUrl(token) });
          createHandlers.close();
        }}
      />

      <Modal
        opened={issuedLink !== null}
        onClose={() => setIssuedLink(null)}
        title="Одноразове посилання"
      >
        <Stack>
          <Alert color="blue" variant="light">
            Система не надсилає листів. Скопіюйте посилання та передайте його особисто або в
            Telegram. Діє 72 години, спрацьовує один раз.
          </Alert>
          <Text size="sm">Для: {issuedLink?.name}</Text>
          <Code block>{issuedLink?.url}</Code>
          <CopyButton value={issuedLink?.url ?? ''}>
            {({ copied, copy }) => (
              <Button onClick={copy} variant={copied ? 'light' : 'filled'}>
                {copied ? 'Скопійовано' : 'Скопіювати посилання'}
              </Button>
            )}
          </CopyButton>
        </Stack>
      </Modal>
    </>
  );
}

function resetUrl(token: string): string {
  return `${window.location.origin}/reset-password?token=${token}`;
}

function CreateUserDrawer({
  opened,
  onClose,
  onCreated,
}: {
  opened: boolean;
  onClose: () => void;
  onCreated: (name: string, token: string) => void;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    initialValues: { email: '', fullName: '', role: 'USER' as Role, phone: '', position: '' },
    validate: {
      email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? null : 'Введіть коректну пошту'),
      fullName: (v) => (v.trim().length >= 2 ? null : 'Вкажіть ПІБ'),
    },
  });

  const mutation = useMutation({
    mutationFn: (values: typeof form.values) =>
      api.post<{ user: { fullName: string }; resetToken: string }>('/users', {
        email: values.email,
        fullName: values.fullName,
        role: values.role,
        phone: values.phone || undefined,
        position: values.position || undefined,
      }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      form.reset();
      onCreated(data.user.fullName, data.resetToken);
    },
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : 'Помилка'),
  });

  return (
    <Drawer opened={opened} onClose={onClose} position="right" title="Новий співробітник" size="md">
      <form
        onSubmit={form.onSubmit((v) => {
          setError(null);
          mutation.mutate(v);
        })}
      >
        <Stack>
          {error && (
            <Alert color="red" variant="light">
              {error}
            </Alert>
          )}
          <TextInput label="ПІБ" placeholder="Петренко Олена Іванівна" {...form.getInputProps('fullName')} />
          <TextInput
            label="Пошта"
            description="Це логін до системи"
            placeholder="olena@wisexpert.com.ua"
            {...form.getInputProps('email')}
          />
          <Select
            label="Роль"
            data={[
              { value: 'USER', label: 'Співробітник' },
              { value: 'ADMIN', label: 'Адміністратор' },
            ]}
            {...form.getInputProps('role')}
          />
          <TextInput label="Телефон" placeholder="+380 67 123 45 67" {...form.getInputProps('phone')} />
          <TextInput label="Посада" placeholder="Бухгалтер" {...form.getInputProps('position')} />
          <Button type="submit" loading={mutation.isPending}>
            Створити
          </Button>
        </Stack>
      </form>
    </Drawer>
  );
}
