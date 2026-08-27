import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';
import { RequireAuth } from './components/RequireAuth';
import { LoginPage } from './features/auth/LoginPage';
import { ResetPasswordPage } from './features/auth/ResetPasswordPage';
import { ProfilePage } from './features/auth/ProfilePage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { ClientsPage } from './features/clients/ClientsPage';
import { ClientCardPage } from './features/clients/ClientCardPage';
import { TasksPage } from './features/tasks/TasksPage';
import { TaskCardPage } from './features/tasks/TaskCardPage';
import { UsersPage } from './features/users/UsersPage';
import { DictionariesPage } from './features/dictionaries/DictionariesPage';

// Code-based роутинг: десять экранов не окупают генератор файловых маршрутов
const rootRoute = createRootRoute({ component: Outlet });

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

const resetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reset-password',
  component: ResetPasswordPage,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <RequireAuth>{(me) => <DashboardPage me={me} />}</RequireAuth>,
});

const clientsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/clients',
  component: () => <RequireAuth>{() => <ClientsPage />}</RequireAuth>,
});

const clientCardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/clients/$clientId',
  component: () => <RequireAuth>{() => <ClientCardPage />}</RequireAuth>,
});

const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tasks',
  component: () => <RequireAuth>{() => <TasksPage />}</RequireAuth>,
});

const taskCardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tasks/$taskId',
  component: () => <RequireAuth>{() => <TaskCardPage />}</RequireAuth>,
});

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile',
  component: () => <RequireAuth>{(me) => <ProfilePage me={me} />}</RequireAuth>,
});

const usersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/users',
  component: () => <RequireAuth adminOnly>{() => <UsersPage />}</RequireAuth>,
});

const dictionariesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/dictionaries',
  component: () => <RequireAuth adminOnly>{() => <DictionariesPage />}</RequireAuth>,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  resetRoute,
  dashboardRoute,
  clientsRoute,
  clientCardRoute,
  tasksRoute,
  taskCardRoute,
  profileRoute,
  usersRoute,
  dictionariesRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
