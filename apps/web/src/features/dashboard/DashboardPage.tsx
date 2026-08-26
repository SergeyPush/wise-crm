import { Card, Grid, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { PageHeader } from '../../components/PageHeader';
import { Me } from '../auth/useAuth';

/** ПРОТОТИП дашборда (этап 1): 4 KPI + блок «потребує уваги» (06-ui-layout.md). */
export function DashboardPage({ me }: { me: Me }) {
  const kpis = [
    { label: 'Нові ліди за тиждень', value: '7' },
    { label: 'У роботі', value: '12' },
    { label: 'КП без відповіді', value: '3' },
    { label: 'Конверсія за місяць', value: '24 % (6 з 25)' },
  ];

  return (
    <>
      <PageHeader title={`Вітаємо, ${me.fullName.split(' ')[0]}`} subtitle="Прототип: дані демонстраційні" />

      <Grid mb="lg">
        {kpis.map((kpi) => (
          <Grid.Col span={{ base: 12, sm: 6, lg: 3 }} key={kpi.label}>
            <Card withBorder radius="md">
              <Text size="xs" c="dimmed">
                {kpi.label}
              </Text>
              <Text fw={700} size="xl">
                {kpi.value}
              </Text>
            </Card>
          </Grid.Col>
        ))}
      </Grid>

      <Paper withBorder p="md" radius="md">
        <Title order={5} mb="sm">
          Потребує уваги
        </Title>
        <Stack gap="xs">
          <Group justify="space-between">
            <Text size="sm">Нерозподілені ліди</Text>
            <Text size="sm" c="orange">
              1
            </Text>
          </Group>
          <Group justify="space-between">
            <Text size="sm">Прострочені задачі</Text>
            <Text size="sm" c="red">
              1
            </Text>
          </Group>
          <Group justify="space-between">
            <Text size="sm">Ліди без активності понад 7 днів</Text>
            <Text size="sm">2</Text>
          </Group>
        </Stack>
      </Paper>
    </>
  );
}
