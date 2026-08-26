/**
 * Контрольные суммы украинских реквизитов (09-implementation-plan.md, 5.1).
 * Ошибка здесь тихая и дорогая — реквизиты уходят в договір и звітність.
 */

/** ЄДРПОУ: 8 цифр юрлица, контрольная цифра — последняя. */
export function isValidEdrpou(value: string): boolean {
  if (!/^\d{8}$/.test(value)) return false;
  const d = value.split('').map(Number);

  const weighted = (weights: number[]): number => weights.reduce((sum, w, i) => sum + w * (d[i] ?? 0), 0);

  let mod = weighted([1, 2, 3, 4, 5, 6, 7]) % 11;
  if (mod === 10) {
    mod = weighted([3, 4, 5, 6, 7, 8, 9]) % 11;
    if (mod === 10) mod = 0;
  }
  return mod === d[7];
}

/** РНОКПП/ІПН: 10 цифр фізособи чи ФОП (формула ДПС). */
export function isValidRnokpp(value: string): boolean {
  if (!/^\d{10}$/.test(value)) return false;
  const d = value.split('').map(Number);
  const weights = [-1, 5, 7, 9, 4, 6, 10, 5, 7];
  const sum = weights.reduce((acc, w, i) => acc + w * (d[i] ?? 0), 0);
  const check = (sum % 11) % 10;
  return check === d[9];
}

/** IBAN: `UA` + 27 цифр (2 контрольні + 25 номера рахунку), ISO 7064 MOD97-10. */
export function isValidIban(value: string): boolean {
  const clean = value.replace(/\s+/g, '').toUpperCase();
  if (!/^UA\d{27}$/.test(clean)) return false;

  // Перестановка + буквы в числа по стандарту IBAN, затем поблочный mod 97
  const rearranged = clean.slice(4) + clean.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));

  let remainder = numeric;
  while (remainder.length > 9) {
    const chunk = remainder.slice(0, 9);
    remainder = String(Number(chunk) % 97) + remainder.slice(9);
  }
  return Number(remainder) % 97 === 1;
}
