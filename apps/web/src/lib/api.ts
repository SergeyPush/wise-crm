import { ApiError, CSRF_HEADER } from 'shared';

/**
 * Тонкий клиент над fetch. Токены живут в httpOnly cookie (NFR-15), поэтому
 * здесь нет ни заголовка Authorization, ни работы с localStorage — только
 * credentials: 'include' и CSRF-заголовок на мутациях.
 */

export const BASE = '/api/v1';

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)crm_csrf=([^;]+)/);
  return match?.[1] ?? '';
}

type RequestOptions = { method?: string; body?: unknown; signal?: AbortSignal };

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers[CSRF_HEADER] = csrfToken();

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
    signal: options.signal,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (res.status === 204) return undefined as T;

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const err = (payload ?? {}) as Partial<ApiError>;
    throw new ApiRequestError(
      res.status,
      err.code ?? 'INTERNAL',
      // Сообщение приходит с сервера уже по-украински
      err.message ?? 'Сталася помилка',
      err.requestId,
      err.details,
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
