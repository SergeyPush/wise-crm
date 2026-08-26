/**
 * Нормализация украинского мобильного/городского номера (NFR-5.1).
 * От неё зависят поиск (FR-2.10) и определение дублей (FR-2.2) — сравнение
 * идёт по этой колонке, а не по строке, как ввёл пользователь.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;

  const digits = input.replace(/\D/g, '');

  let candidate: string | null = null;
  if (digits.length === 12 && digits.startsWith('380')) {
    candidate = `+${digits}`;
  } else if (digits.length === 10 && digits.startsWith('0')) {
    candidate = `+38${digits}`;
  } else if (digits.length === 9) {
    // «671234567» без ведущего нуля и кода страны — редкий, но валидный ввод
    candidate = `+380${digits}`;
  }

  // Код оператора/города не может начинаться с 0 (иначе после +380 пришлось
  // бы принять «мусорный» +3800…), финальная форма — ровно 12 цифр
  if (candidate && /^\+380[1-9]\d{8}$/.test(candidate)) return candidate;
  return null;
}
