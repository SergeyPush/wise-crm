import request from 'supertest';
import { CSRF_HEADER } from 'shared';

/**
 * Обёртка над supertest, которая ведёт себя как браузер: хранит cookie сессии
 * и подставляет CSRF-заголовок в мутации. Без неё каждый тест повторял бы
 * разбор Set-Cookie, и половина тестов проверяла бы парсинг, а не поведение.
 */
export class Agent {
  private cookies: Record<string, string> = {};

  constructor(private readonly url: string) {}

  private cookieHeader(): string {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  private capture(res: request.Response): request.Response {
    const raw = res.headers['set-cookie'];
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const line of list) {
      const [pair] = line.split(';');
      const idx = pair?.indexOf('=') ?? -1;
      if (idx > 0 && pair) {
        const name = pair.slice(0, idx);
        const value = pair.slice(idx + 1);
        if (value === '') delete this.cookies[name];
        else this.cookies[name] = value;
      }
    }
    return res;
  }

  private req(method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string) {
    const r = request(this.url)[method](`/api/v1${path}`);
    const cookie = this.cookieHeader();
    if (cookie) r.set('Cookie', cookie);
    const csrf = this.cookies['crm_csrf'];
    if (csrf && method !== 'get') r.set(CSRF_HEADER, csrf);
    return r;
  }

  async get(path: string) {
    return this.capture(await this.req('get', path));
  }

  async post(path: string, body?: unknown) {
    return this.capture(await this.req('post', path).send(body as object));
  }

  async patch(path: string, body?: unknown) {
    return this.capture(await this.req('patch', path).send(body as object));
  }

  async put(path: string, body?: unknown) {
    return this.capture(await this.req('put', path).send(body as object));
  }

  async delete(path: string) {
    return this.capture(await this.req('delete', path));
  }

  /** multipart/form-data — один файл (FR-F7) + довільні текстові поля форми. */
  async postFile(path: string, fileBuffer: Buffer, filename: string, fields: Record<string, string> = {}) {
    let r = request(this.url).post(`/api/v1${path}`).attach('file', fileBuffer, filename);
    for (const [key, value] of Object.entries(fields)) r = r.field(key, value);
    const cookie = this.cookieHeader();
    if (cookie) r.set('Cookie', cookie);
    const csrf = this.cookies['crm_csrf'];
    if (csrf) r.set(CSRF_HEADER, csrf);
    return this.capture(await r);
  }

  /** Мутация без CSRF-заголовка — для проверки самого CSRF-заслона. */
  async postWithoutCsrf(path: string, body?: unknown) {
    const r = request(this.url).post(`/api/v1${path}`);
    const cookie = this.cookieHeader();
    if (cookie) r.set('Cookie', cookie);
    return this.capture(await r.send(body as object));
  }

  async login(email: string, password: string) {
    return this.post('/auth/login', { email, password });
  }

  hasSession(): boolean {
    return Boolean(this.cookies['crm_at']);
  }
}

/** Копия сессии — имитирует украденную cookie в чужом браузере. */
export function cloneSession(source: Agent, url: string): Agent {
  const copy = new Agent(url);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (copy as any).cookies = { ...(source as any).cookies };
  return copy;
}
