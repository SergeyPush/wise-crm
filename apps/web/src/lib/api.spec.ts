import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Немає jsdom у цьому проєкті (тільки node-середовище vitest) — document/window
// тут потрібні лише всередині тіла функцій request()/refreshSession(), тому
// достатньо підмінити їх у globalThis перед кожним тестом, без DOM.

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('api.ts — тихе продовження сесії (беклог 28.08.2026)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let assignMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules(); // module-level refreshInFlight не повинен «протікати» між тестами
    fetchMock = vi.fn();
    assignMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    globalThis.document = { cookie: 'crm_csrf=tok' } as unknown as Document;
    globalThis.window = { location: { assign: assignMock } } as unknown as Window & typeof globalThis;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('успішний запит не чіпає /auth/refresh', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const { api } = await import('./api');

    await expect(api.get('/clients')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('401 на захищеному ендпоінті — рефрешить сесію і повторює запит один раз', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { code: 'UNAUTHORIZED' })) // перша спроба
      .mockResolvedValueOnce(jsonResponse(200, {})) // POST /auth/refresh
      .mockResolvedValueOnce(jsonResponse(200, { items: [] })); // повтор оригінального запиту
    const { api } = await import('./api');

    await expect(api.get('/clients')).resolves.toEqual({ items: [] });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]![0]).toContain('/auth/refresh');
    expect(assignMock).not.toHaveBeenCalled();
  });

  it('кілька паралельних 401 діляться одним викликом /auth/refresh', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/auth/refresh')) return Promise.resolve(jsonResponse(200, {}));
      // /clients і /tasks: перший виклик кожного — 401, повтор — 200
      return fetchMock.mock.calls.filter((c) => c[0] === url).length <= 1
        ? Promise.resolve(jsonResponse(401, {}))
        : Promise.resolve(jsonResponse(200, { ok: url }));
    });
    const { api } = await import('./api');

    const [a, b] = await Promise.all([api.get('/clients'), api.get('/tasks')]);

    expect(a).toEqual({ ok: '/api/v1/clients' });
    expect(b).toEqual({ ok: '/api/v1/tasks' });
    const refreshCalls = fetchMock.mock.calls.filter((c) => typeof c[0] === 'string' && c[0].includes('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
  });

  it('невдалий рефреш — редірект на /login і виняток з оригінальної відповіді', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { code: 'UNAUTHORIZED', message: 'Сесія недійсна' }))
      .mockResolvedValueOnce(jsonResponse(401, {})); // /auth/refresh теж падає
    const { api, ApiRequestError } = await import('./api');

    await expect(api.get('/clients')).rejects.toBeInstanceOf(ApiRequestError);
    expect(assignMock).toHaveBeenCalledWith('/login');
    expect(fetchMock).toHaveBeenCalledTimes(2); // без другого повтору — не зациклюємось
  });

  it('401 на /auth/login не викликає /auth/refresh — це просто невірний пароль', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { code: 'INVALID_CREDENTIALS', message: 'Невірна пошта або пароль' }));
    const { api, ApiRequestError } = await import('./api');

    await expect(api.post('/auth/login', { email: 'a@b.c', password: 'x' })).rejects.toBeInstanceOf(ApiRequestError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(assignMock).not.toHaveBeenCalled();
  });
});
