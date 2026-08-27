import { AppShell as MantineAppShell, Avatar, Badge, Burger, Group, Menu, NavLink, ScrollArea, Text, UnstyledButton } from '@mantine/core';
import { useDisclosure, useLocalStorage } from '@mantine/hooks';
import {
  IconBook,
  IconChecklist,
  IconLayoutDashboard,
  IconLogout,
  IconSettings,
  IconUser,
  IconUsers,
  IconUsersGroup,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Link, useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Paginated, endOfKyivDay } from 'shared';
import { api } from '../lib/api';
import { Me, useLogout } from '../features/auth/useAuth';
import { ClientListItem } from '../features/clients/types';
import { NotificationBell } from '../features/notifications/NotificationBell';
import { TaskItem } from '../features/tasks/types';
import { GlobalSearch } from './GlobalSearch';

type NavItem = {
  label: string;
  to: string;
  icon: ReactNode;
  adminOnly?: boolean;
  badge?: number;
};

/**
 * Скелет из 06-ui-layout.md: хедер 56px, сайдбар 220px со сворачиванием.
 * Ширина контента не ограничивается — главный экран таблица, и на 27"
 * мониторе она должна использовать монитор.
 */
export function AppShell({ me, children }: { me: Me; children: ReactNode }) {
  const [mobileOpened, { toggle: toggleMobile }] = useDisclosure(false);
  const [collapsed, setCollapsed] = useLocalStorage({
    key: 'crm-nav-collapsed',
    defaultValue: false,
  });
  const logout = useLogout();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isAdmin = me.role === 'ADMIN';

  // Бейджей в навигации ровно два и больше не заводить: если их много,
  // на них перестают смотреть (06-ui-layout.md). «Задачі» — прострочені +
  // сьогоднішні мої відкриті; «Клієнти» — нерозподілені ліди, лише якщо пул не пустий.
  const dueTasks = useQuery({
    queryKey: ['tasks', 'count', 'nav-badge'],
    queryFn: () =>
      api.get<Paginated<TaskItem>>(
        `/tasks?assigneeId=me&status=OPEN,IN_PROGRESS&dueBefore=${encodeURIComponent(endOfKyivDay().toISOString())}&limit=1`,
      ),
    select: (r) => r.total,
    refetchInterval: 60_000,
  });
  const poolCount = useQuery({
    queryKey: ['clients', 'pool-count'],
    queryFn: () => api.get<Paginated<ClientListItem>>('/clients?assigneeId=none&limit=1'),
    select: (r) => r.total,
    refetchInterval: 60_000,
  });

  const items: NavItem[] = [
    { label: 'Дашборд', to: '/', icon: <IconLayoutDashboard size={18} /> },
    { label: 'Клієнти', to: '/clients', icon: <IconUsersGroup size={18} />, badge: poolCount.data || undefined },
    { label: 'Задачі', to: '/tasks', icon: <IconChecklist size={18} />, badge: dueTasks.data || undefined },
    { label: 'Довідники', to: '/settings/dictionaries', icon: <IconBook size={18} />, adminOnly: true },
    { label: 'Користувачі', to: '/settings/users', icon: <IconUsers size={18} />, adminOnly: true },
  ];

  return (
    <MantineAppShell
      header={{ height: 56 }}
      navbar={{
        width: collapsed ? 64 : 220,
        breakpoint: 'sm',
        collapsed: { mobile: !mobileOpened },
      }}
      padding="md"
    >
      <GlobalSearch />

      <MantineAppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={mobileOpened} onClick={toggleMobile} hiddenFrom="sm" size="sm" />
            <Burger
              opened={!collapsed}
              onClick={() => setCollapsed((v) => !v)}
              visibleFrom="sm"
              size="sm"
            />
            <Group gap={8} wrap="nowrap">
              <img src="/logo.png" alt="" width={28} height={28} style={{ borderRadius: 6, flexShrink: 0 }} />
              <Text fw={700} size="lg">
                WiseCRM
              </Text>
            </Group>
          </Group>

          <Group gap="xs" wrap="nowrap">
            <NotificationBell />
            <Menu position="bottom-end" width={200}>
              <Menu.Target>
                <UnstyledButton>
                  <Group gap="xs" wrap="nowrap">
                    <Avatar size={32} radius="xl" color="brand">
                      {initials(me.fullName)}
                    </Avatar>
                    <Text size="sm" visibleFrom="sm">
                      {me.fullName}
                    </Text>
                  </Group>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{me.email}</Menu.Label>
                <Menu.Item component={Link} to="/profile" leftSection={<IconUser size={16} />}>
                  Профіль
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  color="red"
                  leftSection={<IconLogout size={16} />}
                  onClick={() => logout.mutate(undefined, { onSuccess: () => window.location.assign('/login') })}
                >
                  Вийти
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </MantineAppShell.Header>

      <MantineAppShell.Navbar p={collapsed ? 4 : 'xs'}>
        <ScrollArea>
          {items
            .filter((item) => !item.adminOnly || isAdmin)
            .map((item) => (
              <NavLink
                key={item.to}
                component={Link}
                to={item.to}
                label={collapsed ? undefined : item.label}
                leftSection={item.icon}
                active={item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)}
                rightSection={
                  !collapsed && item.badge ? (
                    <Badge size="sm" circle>
                      {item.badge}
                    </Badge>
                  ) : undefined
                }
              />
            ))}
        </ScrollArea>
        <MantineAppShell.Section mt="auto">
          <NavLink
            component={Link}
            to="/profile"
            label={collapsed ? undefined : 'Профіль'}
            leftSection={<IconSettings size={18} />}
            active={pathname.startsWith('/profile')}
          />
        </MantineAppShell.Section>
      </MantineAppShell.Navbar>

      <MantineAppShell.Main>{children}</MantineAppShell.Main>
    </MantineAppShell>
  );
}

function initials(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
