import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { AlertsService } from '../alerts/alerts.service';

/** Тільки маршрутизація в AlertsService на 5xx (NFR-32) — рендеринг тіла покритий API-тестами. */
function makeHost(overrides?: Partial<{ method: string; url: string; routeUrl: string; accept: string }>) {
  const send = vi.fn();
  const status = vi.fn().mockReturnValue({ send });
  const reply = { status };
  const req = {
    id: 'req-1',
    method: overrides?.method ?? 'GET',
    url: overrides?.url ?? '/api/v1/clients/11111111-1111-1111-1111-111111111111',
    routeOptions: { url: overrides?.routeUrl ?? '/clients/:id' },
    headers: { accept: overrides?.accept ?? 'application/json' },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => reply, getRequest: () => req }),
  } as unknown as ArgumentsHost;
  return { host, status, send };
}

describe('AllExceptionsFilter → AlertsService (NFR-32)', () => {
  it('шле алерт при 5xx з ключем за маршрутом+кодом', () => {
    const alerts = { fire: vi.fn().mockResolvedValue(undefined) } as unknown as AlertsService;
    const filter = new AllExceptionsFilter(alerts);
    const { host, status } = makeHost();

    filter.catch(new Error('щось впало'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(alerts.fire).toHaveBeenCalledTimes(1);
    const [key, message] = (alerts.fire as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(key).toContain('/clients/:id'); // маршрут-паттерн, а не «сирий» URL з id
    expect(message).toContain('requestId');
  });

  it('не шле алерт на 4xx — тільки на 5xx', () => {
    const alerts = { fire: vi.fn().mockResolvedValue(undefined) } as unknown as AlertsService;
    const filter = new AllExceptionsFilter(alerts);
    const { host } = makeHost();

    filter.catch(new HttpException('Не знайдено', HttpStatus.NOT_FOUND), host);

    expect(alerts.fire).not.toHaveBeenCalled();
  });

  it('різні маршрути з однаковим кодом помилки — різні ключі дедуплікації', () => {
    const alerts = { fire: vi.fn().mockResolvedValue(undefined) } as unknown as AlertsService;
    const filter = new AllExceptionsFilter(alerts);

    filter.catch(new Error('x'), makeHost({ routeUrl: '/clients/:id' }).host);
    filter.catch(new Error('x'), makeHost({ routeUrl: '/tasks/:id' }).host);

    const keys = (alerts.fire as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(keys[0]).not.toBe(keys[1]);
  });
});
