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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <QueryClientProvider client={queryClient}>
        <ModalsProvider>
          <ContextMenuProvider>
            <Notifications position="top-right" />
            <RouterProvider router={router} />
          </ContextMenuProvider>
        </ModalsProvider>
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
);
