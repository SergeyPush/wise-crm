import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Center, Stack, Text, Title } from '@mantine/core';
import { reportClientError } from '../lib/report-error';

/**
 * Останній рубіж (NFR-2): помилка рендеру не повинна лишати користувача з
 * білим екраном. Ловить те, що не ловить жоден try/catch — падіння всередині
 * рендеру React-дерева — і одночасно шле репорт на бекенд (NFR-32.2).
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportClientError(error.message, { stack: error.stack, componentStack: info.componentStack ?? undefined });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Center h="100vh">
        <Stack align="center" gap="xs" maw={420}>
          <Title order={3}>Щось пішло не так</Title>
          <Text size="sm" ta="center" c="dimmed">
            Сторінку не вдалось відобразити. Спробуйте оновити — якщо помилка повториться, зверніться до адміністратора.
          </Text>
          <Button onClick={() => window.location.reload()}>Оновити сторінку</Button>
        </Stack>
      </Center>
    );
  }
}
