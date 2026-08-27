import type { ReactNode } from 'react';
import type { Me } from '../auth/useAuth';

/**
 * Контекст, в якому виконується дія: чинний користувач + одиничний запис
 * (ПКМ по рядку, кнопка «⋮») та/або виділення (тулбар масових дій, FR-8.3).
 */
export type Ctx<T> = {
  user: Me;
  record?: T;
  selection?: T[];
};

/**
 * Єдиний реєстр швидких дій (03-tech-stack.md, «Архітектура швидких дій»).
 * Одне джерело правди для контекстного меню, кнопки «⋮», тулбара масових
 * дій і хоткеїв (FR-8.4) — права/стан рахуються тут один раз.
 */
export type Action<T> = {
  id: string;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  /** Немає права або дія не застосовна до об'єкта — пункт не показується. */
  hidden?: (ctx: Ctx<T>) => boolean;
  disabled?: (ctx: Ctx<T>) => boolean;
  /** Комбінація для useHotkeys, напр. "mod+K". Заповнено лише в FR-8.9 (Ctrl/Cmd+K, /). */
  hotkey?: string;
  /** Бере участь у тулбарі масових дій над виділенням (FR-8.3, FR-2.13). */
  bulk?: boolean;
  /** Підменю — тоді run відсутній. */
  items?: Action<T>[];
  run?: (ctx: Ctx<T>) => Promise<void> | void;
  /** Рендериться як розділювач замість пункту меню. */
  divider?: boolean;
};

/** Розділювач — маленький хелпер, щоб не повторювати форму об'єкта. */
export function divider<T>(id: string): Action<T> {
  return { id, label: '', divider: true };
}
