import { describe, expect, it } from 'vitest';
import { EXPORT_SCOPE, PERMISSIONS, Permission, can, permissionsFor } from './permissions';
import { Role } from './enums';

/**
 * Матрица прав прогоняется параметризованным тестом по таблице из
 * 09-implementation-plan.md, раздел 2. Одна таблица — один тест, зато любое
 * изменение прав ловится сразу, а не в проде.
 */

// Ожидаемая таблица переписана из документа вручную и намеренно:
// если бы она импортировалась из permissions.ts, тест проверял бы сам себя.
const EXPECTED: Array<[Permission, boolean, boolean]> = [
  // [право, ADMIN, USER (без владения объектом)]
  ['client:read', true, true],
  ['client:create', true, true],
  ['client:update', true, true],
  ['client:assign', true, true],
  ['client:delete', true, false],
  ['task:create', true, true],
  ['task:assign', true, true],
  ['task:complete', true, true],
  ['task:cancel', true, true],
  ['task:delete', true, false],
  ['comment:create', true, true],
  ['file:upload', true, true],
  ['file:delete', true, false],
  ['user:manage', true, false],
  ['dictionary:manage', true, false],
  ['audit:read', true, false],
  ['export:run', true, true],
  ['web-leads:read', true, false],
];

describe('матриця прав', () => {
  it('покриває всі оголошені права', () => {
    expect(EXPECTED.map(([p]) => p).sort()).toEqual([...PERMISSIONS].sort());
  });

  it.each(EXPECTED)('%s: ADMIN=%s, USER=%s', (permission, admin, user) => {
    expect(can(Role.ADMIN, permission)).toBe(admin);
    expect(can(Role.USER, permission)).toBe(user);
  });

  describe('права з контекстом володіння', () => {
    it('USER видаляє свою задачу і не видаляє чужу', () => {
      expect(can(Role.USER, 'task:delete', { isOwner: true })).toBe(true);
      expect(can(Role.USER, 'task:delete', { isOwner: false })).toBe(false);
    });

    it('USER видаляє свій файл у перші 24 години', () => {
      expect(can(Role.USER, 'file:delete', { isOwner: true, ageHours: 1 })).toBe(true);
      expect(can(Role.USER, 'file:delete', { isOwner: true, ageHours: 24 })).toBe(true);
      expect(can(Role.USER, 'file:delete', { isOwner: true, ageHours: 25 })).toBe(false);
      expect(can(Role.USER, 'file:delete', { isOwner: false, ageHours: 1 })).toBe(false);
    });

    it('ADMIN не залежить від володіння', () => {
      expect(can(Role.ADMIN, 'task:delete', { isOwner: false })).toBe(true);
      expect(can(Role.ADMIN, 'file:delete', { isOwner: false, ageHours: 1000 })).toBe(true);
    });
  });

  it('обсяг експорту різний при однаковому праві', () => {
    expect(can(Role.ADMIN, 'export:run')).toBe(true);
    expect(can(Role.USER, 'export:run')).toBe(true);
    expect(EXPORT_SCOPE.ADMIN).toBe('all');
    expect(EXPORT_SCOPE.USER).toBe('own');
  });

  it('невідоме право не дає доступу нікому', () => {
    expect(can(Role.ADMIN, 'nonexistent:action' as Permission)).toBe(false);
    expect(can(Role.USER, 'nonexistent:action' as Permission)).toBe(false);
  });

  describe('permissionsFor — те, що бачить фронт у GET /me', () => {
    it('ADMIN отримує всі права', () => {
      expect(permissionsFor(Role.ADMIN)).toEqual([...PERMISSIONS]);
    });

    it('USER не отримує адмінських прав', () => {
      const list = permissionsFor(Role.USER);
      expect(list).not.toContain('user:manage');
      expect(list).not.toContain('client:delete');
      expect(list).not.toContain('audit:read');
      expect(list).not.toContain('web-leads:read');
      expect(list).toContain('client:read');
    });
  });
});
