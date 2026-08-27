import type { ContextMenuItemOptions } from 'mantine-contextmenu';
import { Action, Ctx } from './types';

/**
 * Action<T>[] → формат mantine-contextmenu. Той самий результат живить і
 * ПКМ (showContextMenu), і кнопку «⋮» (Menu-обгортка бере ті ж пункти) —
 * FR-8.4: приховання/дизейбл рахуються один раз тут.
 */
export function toMenuItems<T>(actions: Action<T>[], ctx: Ctx<T>): ContextMenuItemOptions[] {
  return actions
    .filter((a) => !a.hidden?.(ctx))
    .map((a): ContextMenuItemOptions => {
      if (a.divider) return { key: a.id };

      const base = {
        key: a.id,
        title: a.label,
        icon: a.icon,
        color: a.danger ? 'red' : undefined,
        disabled: a.disabled?.(ctx) ?? false,
      };

      if (a.items?.length) {
        return { ...base, items: toMenuItems(a.items, ctx) };
      }
      return { ...base, onClick: () => void a.run?.(ctx) };
    });
}
