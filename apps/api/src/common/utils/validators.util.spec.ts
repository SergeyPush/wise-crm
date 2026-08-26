import { describe, expect, it } from 'vitest';
import { isValidEdrpou, isValidIban, isValidRnokpp } from './validators.util';

describe('isValidEdrpou', () => {
  it.each(['12345678', '30332231'])('приймає коректний код %s', (v) => {
    expect(isValidEdrpou(v)).toBe(true);
  });

  it('відхиляє зіпсовану контрольну цифру', () => {
    expect(isValidEdrpou('12345679')).toBe(false);
  });

  it.each(['1234567', '123456789', '1234567a', ''])('відхиляє неправильний формат %s', (v) => {
    expect(isValidEdrpou(v)).toBe(false);
  });
});

describe('isValidRnokpp', () => {
  it.each(['1234567899', '3216549875'])('приймає коректний код %s', (v) => {
    expect(isValidRnokpp(v)).toBe(true);
  });

  it('відхиляє зіпсовану контрольну цифру', () => {
    expect(isValidRnokpp('1234567890')).toBe(false);
  });

  it.each(['123456789', '12345678901', 'abcdefghij'])('відхиляє неправильний формат %s', (v) => {
    expect(isValidRnokpp(v)).toBe(false);
  });
});

describe('isValidIban', () => {
  it('приймає коректний IBAN', () => {
    expect(isValidIban('UA903055292995979004336913982')).toBe(true);
  });

  it('приймає з пробілами й у нижньому регістрі', () => {
    expect(isValidIban('ua90 3055 2929 9597 9004 3369 13982')).toBe(true);
  });

  it('відхиляє зіпсовану контрольну цифру', () => {
    expect(isValidIban('UA913055292995979004336913982')).toBe(false);
  });

  it.each(['UA90305529299597900433691398', 'DE89370400440532013000', ''])(
    'відхиляє неправильний формат %s',
    (v) => {
      expect(isValidIban(v)).toBe(false);
    },
  );
});
