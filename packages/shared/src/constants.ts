// Числа, на которые ссылаются и фронт, и бэк. Меняются в одном месте.

/** Ключи app_settings, сидируемые миграцией (09-implementation-plan.md, раздел 3). */
export const APP_SETTINGS = {
  PROPOSAL_NO_REPLY_DAYS: 'PROPOSAL_NO_REPLY_DAYS',
  LEAD_INACTIVE_DAYS: 'LEAD_INACTIVE_DAYS',
  FILE_MAX_MB: 'FILE_MAX_MB',
} as const;

export const TIMEZONE = 'Europe/Kyiv'; // NFR-45: явная зона, а не TZ процесса

export const AUTH = {
  ACCESS_TTL_SEC: 15 * 60, // FR-1.2
  REFRESH_TTL_SEC: 30 * 24 * 60 * 60,
  PASSWORD_MIN_LENGTH: 10, // NFR-14
  LOGIN_ATTEMPTS_PER_EMAIL: 10, // FR-1.5
  LOGIN_LOCK_MINUTES: 15,
  LOGIN_ATTEMPTS_PER_IP_PER_MIN: 20,
  BACKUP_CODES_COUNT: 10, // FR-1.4
  RESET_LINK_TTL_HOURS: 72, // FR-1.3
} as const;

export const PAGINATION = { DEFAULT_LIMIT: 25, MAX_LIMIT: 200 } as const;

/** Пресети «Перенести термін» (FR-8.2) — підменю ПКМ і DTO /tasks/:id/snooze, один список на обидві сторони. */
export const SNOOZE_PRESETS = ['today', 'tomorrow', 'in3days', 'nextweek', 'custom'] as const;
export type SnoozePreset = (typeof SNOOZE_PRESETS)[number];

/** Имена cookie. CSRF-токен читаемый (double-submit), сессионные — httpOnly. */
export const COOKIE = {
  ACCESS: 'crm_at',
  REFRESH: 'crm_rt',
  CSRF: 'crm_csrf',
} as const;

export const CSRF_HEADER = 'x-csrf-token';
