import { Center, Loader, Stack, Text, Title, Button } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Role } from 'shared';
import { Me, useMe } from '../features/auth/useAuth';
import { AppShell } from './AppShell';
import { OnboardingPage } from '../features/auth/OnboardingPage';

/**
 * Оболочка защищённых экранов. Это UX-слой: настоящая проверка стоит
 * на каждом эндпоинте (NFR-17), здесь мы лишь показываем нужный экран
 * вместо пустоты или редиректа в никуда.
 */
export function RequireAuth({
  children,
  adminOnly,
}: {
  children: (me: Me) => ReactNode;
  adminOnly?: boolean;
}) {
  const { data: me, isLoading, isError } = useMe();

  if (isLoading) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }

  if (isError || !me) {
    // Полная перезагрузка, а не router.navigate: заодно чистится состояние
    window.location.assign('/login');
    return null;
  }

  // Незавершённый вход: временный пароль ещё не сменён
  if (me.mustChangePassword) {
    return <OnboardingPage />;
  }

  if (adminOnly && me.role !== Role.ADMIN) {
    return (
      <AppShell me={me}>
        <Center py="xl">
          <Stack align="center" gap="xs">
            <Title order={4}>Недостатньо прав</Title>
            <Text size="sm" c="dimmed">
              Цей розділ доступний лише адміністратору.
            </Text>
            <Button component={Link} to="/" variant="light">
              На дашборд
            </Button>
          </Stack>
        </Center>
      </AppShell>
    );
  }

  return <AppShell me={me}>{children(me)}</AppShell>;
}
