import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Permission, Role } from 'shared';
import { api } from '../../lib/api';

export type Me = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  position: string | null;
  avatarUrl: string | null;
  role: Role;
  telegramEnabled: boolean;
  digestHour: number;
  mustChangePassword: boolean;
  isProtected: boolean;
  permissions: Permission[];
};

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<Me>('/me'),
    retry: false,
    staleTime: 60_000,
  });
}

/**
 * Скрытие пунктов меню по правам — это UX, а не защита: guard стоит
 * на каждом эндпоинте (NFR-17). Список прав приходит с сервера, чтобы
 * фронт не пересобирал матрицу самостоятельно.
 */
export function useCan(me: Me | undefined) {
  return (permission: Permission): boolean => me?.permissions.includes(permission) ?? false;
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { email: string; password: string }) =>
      api.post<{ user: { id: string } }>('/auth/login', vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => qc.clear(),
  });
}
