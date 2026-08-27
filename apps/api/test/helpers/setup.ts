// Окружение тестового процесса. Секреты фиксированные: тесты не должны
// зависеть от содержимого .env разработчика.
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://wisecrm:wisecrm@localhost:5434/wisecrm_test?schema=public';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-value-at-least-32-chars';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-value-at-least-32-chars';
process.env.COOKIE_SECURE = 'false';
process.env.LOG_LEVEL = 'silent';
process.env.APP_URL = 'http://localhost:5173';
process.env.WEB_FORM_TOKEN = 'test-web-form-token';
// Свій каталог на прогін, а не apps/api/uploads — інакше тестові файли
// накопичувались би в репозиторії й пережили б сам тест.
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `wise-crm-test-uploads-${process.pid}`);
// Bootstrap первого админа в тестах не нужен — учётки создают фабрики
delete process.env.ADMIN_BOOTSTRAP_EMAIL;

// Весь прогон идёт с 127.0.0.1, поэтому лимит по IP (20/мин на проде, NFR-16)
// иначе съедается первым же тестом на блокировку по email.
process.env.LOGIN_IP_LIMIT_PER_MIN = '100000';
