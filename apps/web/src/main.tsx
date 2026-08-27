import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { ContextMenuProvider } from 'mantine-contextmenu';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/dropzone/styles.css';
import 'mantine-contextmenu/styles.css';
import 'mantine-datatable/styles.css';
import { theme } from './theme';
import { router } from './router';
import { queryClient } from './lib/query';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { reportClientError } from './lib/report-error';

// NFR-32.2: помилки поза React-деревом (обробники подій, async-код, помилки
// завантаження чанків) не ловить ErrorBoundary — тільки ці два глобальні слухачі.
window.addEventListener('error', (event) => {
  reportClientError(event.message, { stack: event.error?.stack });
});
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  reportClientError(reason instanceof Error ? reason.message : String(reason), {
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <QueryClientProvider client={queryClient}>
        <ModalsProvider>
          <ContextMenuProvider>
            <Notifications position="top-right" />
            <AppErrorBoundary>
              <RouterProvider router={router} />
            </AppErrorBoundary>
          </ContextMenuProvider>
        </ModalsProvider>
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
);
