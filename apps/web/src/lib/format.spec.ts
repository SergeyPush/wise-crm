import { describe, expect, it } from 'vitest';
import { formatRelative } from './format';

describe('formatRelative', () => {
  it('порожнє значення дає прочерк, а не виняток', () => {
    expect(formatRelative(null)).toBe('—');
    expect(formatRelative(undefined)).toBe('—');
  });

  it('дату у минулому форматує відносно поточного моменту', () => {
    const anHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(formatRelative(anHourAgo)).toMatch(/тому/);
  });
});
