import { QueryClient } from '@tanstack/react-query';
import { ApiRequestError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        // Повторять 401/403/404 бессмысленно: ответ не изменится,
        // а три лишних запроса задерживают показ экрана «немає прав»
        if (error instanceof ApiRequestError && error.status < 500) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});
