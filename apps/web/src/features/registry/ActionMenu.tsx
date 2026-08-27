import { ActionIcon, Menu } from '@mantine/core';
import { IconChevronRight, IconDots } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Action, Ctx } from './types';

/** Той самий Action<T>[], що й у ПКМ (toMenuItems), тільки як дерево <Menu.Item> (FR-8.4). */
export function renderMenuItems<T>(actions: Action<T>[], ctx: Ctx<T>): ReactNode[] {
  return actions
    .filter((a) => !a.hidden?.(ctx))
    .map((a) => {
      if (a.divider) return <Menu.Divider key={a.id} />;

      if (a.items?.length) {
        return (
          <Menu key={a.id} trigger="hover" position="right-start" withinPortal closeOnItemClick={false}>
            <Menu.Target>
              <Menu.Item leftSection={a.icon} rightSection={<IconChevronRight size={14} />}>
                {a.label}
              </Menu.Item>
            </Menu.Target>
            <Menu.Dropdown>{renderMenuItems(a.items, ctx)}</Menu.Dropdown>
          </Menu>
        );
      }

      return (
        <Menu.Item
          key={a.id}
          leftSection={a.icon}
          color={a.danger ? 'red' : undefined}
          disabled={a.disabled?.(ctx)}
          onClick={() => void a.run?.(ctx)}
        >
          {a.label}
        </Menu.Item>
      );
    });
}

/** Кнопка «⋮» — дублює ПКМ видимим елементом (FR-8.7: меню не замінює UI, а повторює). */
export function ActionMenu<T>({ actions, ctx }: { actions: Action<T>[]; ctx: Ctx<T> }) {
  return (
    <Menu shadow="md" position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon variant="subtle" color="gray" onClick={(e) => e.stopPropagation()} aria-label="Дії">
          <IconDots size={16} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown onClick={(e) => e.stopPropagation()}>{renderMenuItems(actions, ctx)}</Menu.Dropdown>
    </Menu>
  );
}
