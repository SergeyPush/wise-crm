import { describe, expect, it } from 'vitest';
import { normalizePhone } from './phone.util';

describe('normalizePhone (NFR-5.1)', () => {
  it.each([
    ['0671234567', '+380671234567'],
    ['+38 (067) 123-45-67', '+380671234567'],
    ['380671234567', '+380671234567'],
    ['067 123 45 67', '+380671234567'],
    ['671234567', '+380671234567'],
  ])('%s → %s', (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it.each([null, undefined, '', 'abc', '123', '+1 202 555 0100', '38067123456'])(
    'мусор %s → null, а не исключение',
    (raw) => {
      expect(normalizePhone(raw as string | null | undefined)).toBeNull();
    },
  );
});
