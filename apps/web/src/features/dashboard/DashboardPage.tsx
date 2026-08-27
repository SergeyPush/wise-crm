import { Card, Grid, Group, Loader, Paper, SegmentedControl, Stack, Table, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState, ErrorState } from '../../components/EmptyState';
import { ApiRequestError, api } from '../../lib/api';
import { Me } from '../auth/useAuth';
import { AdminDashboardData, PERIOD_PRESETS, UserDashboardData } from './types';

/** Дашборд на справжніх даних (FR-5.1/5.2) — склад залежить від ролі, період лише для ADMIN. */
export function DashboardPage({ me }: { me: Me }) {
  const [period, setPeriod] = useState('90');
  const isAdmin = me.role === 'ADMIN';

  const query = useQuery({
    queryKey: ['dashboard', isAdmin ? period : 'user'],
    queryFn: () => api.get<AdminDashboardData | UserDashboardData>(`/dashboard?period=${period}`),
  });

  return (
    <>
      <PageHeader
        title={`Вітаємо, ${me.fullName.split(' ')[0]}`}
        actions={isAdmin ? <SegmentedControl value={period} onChange={setPeriod} data={PERIOD_PRESETS} /> : undefined}
      />

      {query.isError ? (
        <ErrorState
          message={query.error instanceof ApiRequestError ? query.error.message : 'Не вдалося завантажити дашборд'}
          requestId={query.error instanceof ApiRequestError ? query.error.requestId : undefined}
          onRetry={() => query.refetch()}
        />
      ) : query.isLoading || !query.data ? (
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      ) : isAdminData(query.data) ? (
        <AdminDashboard data={query.data} />
      ) : (
        <UserDashboard data={query.data} />
      )}
    </>
  );
}

/** `funnel` є лише у відповіді для ADMIN — надійніше, ніж довіряти `me.role` без перевірки форми даних. */
function isAdminData(data: AdminDashboardData | UserDashboardData): data is AdminDashboardData {
  return 'funnel' in data;
}

function Kpi({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <Grid.Col span={{ base: 12, sm: 6, lg: 3 }}>
      <Card withBorder radius="md">
        <Text size="xs" c="dimmed">
          {label}
        </Text>
        <Text fw={700} size="xl" c={color}>
          {value}
        </Text>
      </Card>
    </Grid.Col>
  );
}

function money(n: number): string {
  return `${n.toLocaleString('uk-UA')} ₴`;
}

function AdminDashboard({ data }: { data: AdminDashboardData }) {
  const totalOverdue = data.overdueByEmployee.reduce((s, e) => s + e.overdueCount, 0);

  return (
    <Stack>
      <Grid>
        <Kpi label="Нові ліди за період" value={data.newLeads} />
        <Kpi
          label="Конверсія лід → договір"
          value={`${data.leadToContract.pct}% (${data.leadToContract.contracts} з ${data.leadToContract.leads})`}
        />
        <Kpi label="Сума договорів за період" value={money(data.contractsSum)} />
        <Kpi label="Середній строк воронки" value={data.avgFunnelDays !== null ? `${data.avgFunnelDays} дн.` : '—'} />
        <Kpi label="Прострочені задачі" value={totalOverdue} color={totalOverdue > 0 ? 'red' : undefined} />
        <Kpi label="Нерозподілені ліди" value={data.unassignedCount} color={data.unassignedCount > 0 ? 'orange' : undefined} />
        <Kpi
          label="Договори без даних для тарифу"
          value={data.missingTariffDataCount}
          color={data.missingTariffDataCount > 0 ? 'yellow' : undefined}
        />
      </Grid>

      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Paper withBorder p="md" radius="md" h="100%">
            <Title order={5} mb="sm">
              Воронка за статусами
            </Title>
            {data.funnel.length === 0 ? (
              <EmptyState title="Клієнтів ще немає" />
            ) : (
              <Table verticalSpacing="xs">
                <Table.Tbody>
                  {data.funnel.map((f) => (
                    <Table.Tr key={f.statusId}>
                      <Table.Td>{f.label}</Table.Td>
                      <Table.Td ta="right">{f.count}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Paper>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6 }}>
          <Paper withBorder p="md" radius="md" h="100%">
            <Title order={5} mb="sm">
              Конверсія за джерелами
            </Title>
            {data.sourceConversion.length === 0 ? (
              <EmptyState title="Джерел ще немає" />
            ) : (
              <Table verticalSpacing="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Джерело</Table.Th>
                    <Table.Th ta="right">Ліди</Table.Th>
                    <Table.Th ta="right">Договори</Table.Th>
                    <Table.Th ta="right">%</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.sourceConversion.map((s) => (
                    <Table.Tr key={s.sourceId}>
                      <Table.Td>{s.label}</Table.Td>
                      <Table.Td ta="right">{s.leads}</Table.Td>
                      <Table.Td ta="right">{s.contracts}</Table.Td>
                      <Table.Td ta="right">{s.pct}%</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Paper>
        </Grid.Col>
      </Grid>

      <Paper withBorder p="md" radius="md">
        <Title order={5} mb="sm">
          Розріз по менеджерах
        </Title>
        {data.perManager.length === 0 ? (
          <EmptyState title="Співробітників ще немає" />
        ) : (
          <Table.ScrollContainer minWidth={600}>
            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Менеджер</Table.Th>
                  <Table.Th ta="right">У роботі</Table.Th>
                  <Table.Th ta="right">Договори за період</Table.Th>
                  <Table.Th ta="right">Прострочені</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.perManager.map((m) => (
                  <Table.Tr key={m.userId}>
                    <Table.Td>{m.fullName}</Table.Td>
                    <Table.Td ta="right">{m.leadsInWork}</Table.Td>
                    <Table.Td ta="right">{m.contractsInPeriod}</Table.Td>
                    <Table.Td ta="right" c={m.overdueCount > 0 ? 'red' : undefined}>
                      {m.overdueCount}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>
    </Stack>
  );
}

function UserDashboard({ data }: { data: UserDashboardData }) {
  return (
    <Stack>
      <Grid>
        <Kpi label="Задачі на сьогодні" value={data.myTasksToday} />
        <Kpi label="Прострочені задачі" value={data.myOverdue} color={data.myOverdue > 0 ? 'red' : undefined} />
        <Kpi label="Ліди без активності" value={data.leadsInactive} color={data.leadsInactive > 0 ? 'orange' : undefined} />
        <Kpi label="КП без відповіді" value={data.proposalsNoReply} color={data.proposalsNoReply > 0 ? 'orange' : undefined} />
      </Grid>

      <Paper withBorder p="md" radius="md">
        <Title order={5} mb="sm">
          Мої клієнти за статусами
        </Title>
        {data.myClientsByStatus.length === 0 ? (
          <EmptyState title="У роботі клієнтів немає" description="Візьміть ліда з пулу «Нерозподілені»" />
        ) : (
          <Table verticalSpacing="xs">
            <Table.Tbody>
              {data.myClientsByStatus.map((s) => (
                <Table.Tr key={s.statusId}>
                  <Table.Td>{s.label}</Table.Td>
                  <Table.Td ta="right">{s.count}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>

      {data.unassignedCount > 0 && (
        <Paper withBorder p="md" radius="md">
          <Group justify="space-between">
            <Text size="sm">Нерозподілені ліди в пулі</Text>
            <Text size="sm" fw={600} c="orange">
              {data.unassignedCount}
            </Text>
          </Group>
        </Paper>
      )}
    </Stack>
  );
}
