import { BASE } from './api';

/**
 * NFR-32.2: помилка фронтенда має долетіти до логів бекенду. Навмисно не
 * через `api.post` — той сам кидає `ApiRequestError` при невдачі, а звіт про
 * помилку не повинен породжувати другу помилку. `keepalive` дає шанс
 * долетіти, навіть якщо сталось під час навігації/закриття вкладки.
 */
export function reportClientError(message: string, extra?: { stack?: string; componentStack?: string }): void {
  try {
    void fetch(`${BASE}/client-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      keepalive: true,
      body: JSON.stringify({
        message: message.slice(0, 2000),
        url: window.location.href,
        stack: extra?.stack?.slice(0, 8000),
        componentStack: extra?.componentStack?.slice(0, 4000),
        userAgent: navigator.userAgent,
      }),
    }).catch(() => {}); // звіт не повинен ламати нічого, якщо мережа лежить
  } catch {
    // window/navigator недоступні (SSR, тести) — звіт просто не йде
  }
}
