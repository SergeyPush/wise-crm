// Машиночитаемые коды ошибок (03-tech-stack.md, «Ключевые API-соглашения»).
// message в ответе — украинский, code — для логики фронта.

export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT_STALE_DATA: 'CONFLICT_STALE_DATA', // NFR-46
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED', // FR-1.5
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  PASSWORD_TOO_WEAK: 'PASSWORD_TOO_WEAK', // NFR-14
  USER_PROTECTED: 'USER_PROTECTED', // FR-1.8
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  CSRF_INVALID: 'CSRF_INVALID', // NFR-15
  RATE_LIMITED: 'RATE_LIMITED',
  CLIENT_DUPLICATE_EDRPOU: 'CLIENT_DUPLICATE_EDRPOU',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export type ApiError = {
  statusCode: number;
  code: ErrorCode | string;
  message: string;
  details?: unknown;
  requestId: string;
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};
