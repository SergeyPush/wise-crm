// Единственный источник правды по правам (09-implementation-plan.md, раздел 2).
// Фронт по нему прячет кнопки — это UX; защита живёт в guard на каждом
// эндпоинте (NFR-17). Изменение таблицы ловится параметризованным юнит-тестом.

import { Role } from './enums';

export const PERMISSIONS = [
  'client:read',
  'client:create',
  'client:update',
  'client:assign',
  'client:delete',
  'task:read',
  'task:create',
  'task:update',
  'task:assign',
  'task:complete',
  'task:cancel',
  'task:delete',
  'comment:create',
  'file:upload',
  'file:delete',
  'user:manage',
  'dictionary:manage',
  'audit:read',
  'export:run',
  'web-leads:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Контекст владения: без него нельзя выразить «USER удаляет свою задачу». */
export type PermissionContext = {
  /** Текущий пользователь — автор объекта (задачи, файла). */
  isOwner?: boolean;
  /** Возраст объекта в часах — для правила «свой файл ≤ 24 ч» (FR-F-права). */
  ageHours?: number;
};

type Rule = boolean | ((ctx: PermissionContext) => boolean);

const MATRIX: Record<Permission, Record<Role, Rule>> = {
  'client:read': { ADMIN: true, USER: true },
  'client:create': { ADMIN: true, USER: true },
  'client:update': { ADMIN: true, USER: true },
  'client:assign': { ADMIN: true, USER: true },
  'client:delete': { ADMIN: true, USER: false },
  'task:read': { ADMIN: true, USER: true },
  'task:create': { ADMIN: true, USER: true },
  'task:update': { ADMIN: true, USER: true },
  'task:assign': { ADMIN: true, USER: true },
  'task:complete': { ADMIN: true, USER: true },
  'task:cancel': { ADMIN: true, USER: true },
  // USER удаляет только свою задачу
  'task:delete': { ADMIN: true, USER: (ctx) => ctx.isOwner === true },
  'comment:create': { ADMIN: true, USER: true },
  'file:upload': { ADMIN: true, USER: true },
  // USER удаляет свою загрузку в первые 24 часа
  'file:delete': {
    ADMIN: true,
    USER: (ctx) => ctx.isOwner === true && (ctx.ageHours ?? Infinity) <= 24,
  },
  'user:manage': { ADMIN: true, USER: false },
  'dictionary:manage': { ADMIN: true, USER: false },
  'audit:read': { ADMIN: true, USER: false },
  // Решение пользователя 01.09.2026: экспорт — только ADMIN. Раньше право было
  // у обоих (USER — только свои), но выгрузка клиентской базы в файл — событие
  // безопасности (FR-E6), и до появления кнопки на фронте разумнее сузить круг
  // сразу, а не открывать для всех сотрудников с первого дня.
  'export:run': { ADMIN: true, USER: false },
  'web-leads:read': { ADMIN: true, USER: false },
};

export function can(role: Role, action: Permission, ctx: PermissionContext = {}): boolean {
  const rule = MATRIX[action]?.[role];
  if (rule === undefined) return false;
  return typeof rule === 'function' ? rule(ctx) : rule;
}

/** Права роли без контекста — для payload'а `GET /me`, чтобы фронт не знал матрицу. */
export function permissionsFor(role: Role): Permission[] {
  return PERMISSIONS.filter((p) => can(role, p, { isOwner: false }));
}
