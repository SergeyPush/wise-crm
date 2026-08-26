import { Badge, Button, Card, Grid, Group, Paper, Stack, Tabs, Text, Timeline, Title } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { Link, useParams } from '@tanstack/react-router';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';
import { PROTO_CLIENTS } from './prototype-data';

/** ПРОТОТИП карточки (этап 1): две колонки + вкладки, данные демонстрационные. */
export function ClientCardPage() {
  const { clientId } = useParams({ from: '/clients/$clientId' });
  const client = PROTO_CLIENTS.find((c) => c.id === clientId);

  if (!client) {
    return (
      <EmptyState
        title="Клієнта не знайдено"
        description="Можливо, його видалили або посилання застаріле"
        action={
          <Button component={Link} to="/clients" variant="light">
            До списку
          </Button>
        }
      />
    );
  }

  return (
    <>
      <PageHeader
        title={client.displayName}
        subtitle={`${client.type} · ${client.taxSystem}`}
        actions={
          <Button component={Link} to="/clients" variant="subtle" leftSection={<IconArrowLeft size={16} />}>
            До списку
          </Button>
        }
      />

      <Grid>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack>
            <Card withBorder radius="md">
              <Group justify="space-between" mb="sm">
                <Title order={5}>Реквізити</Title>
                <Badge color={client.status.color} variant="light">
                  {client.status.label}
                </Badge>
              </Group>
              <Grid>
                <Field label="Телефон" value={client.phone} />
                <Field label="Система оподаткування" value={client.taxSystem} />
                <Field label="ЄДРПОУ" value="12345678" />
                <Field label="Відповідальний" value={client.assignee} />
              </Grid>
            </Card>

            <Tabs defaultValue="activity">
              <Tabs.List>
                <Tabs.Tab value="activity">Активність</Tabs.Tab>
                <Tabs.Tab value="tasks">Задачі</Tabs.Tab>
                <Tabs.Tab value="files">Документи</Tabs.Tab>
                <Tabs.Tab value="contacts">Контактні особи</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="activity" pt="md">
                <Paper withBorder p="md" radius="md">
                  <Timeline active={2} bulletSize={18} lineWidth={2}>
                    <Timeline.Item title="Статус змінено на «Договір підписано»">
                      <Text size="xs" c="dimmed">
                        Олена П. · сьогодні, 11:20
                      </Text>
                    </Timeline.Item>
                    <Timeline.Item title="Задачу «Надіслати договір» виконано">
                      <Text size="xs" c="dimmed">
                        Олена П. · вчора, 15:40
                      </Text>
                    </Timeline.Item>
                    <Timeline.Item title="Клієнта створено із заявки з сайту">
                      <Text size="xs" c="dimmed">
                        Система · 20.08.2026
                      </Text>
                    </Timeline.Item>
                  </Timeline>
                </Paper>
              </Tabs.Panel>

              <Tabs.Panel value="tasks" pt="md">
                <Paper withBorder p="md" radius="md">
                  <Text size="sm">{client.nextTask ?? 'Задач немає'}</Text>
                </Paper>
              </Tabs.Panel>

              <Tabs.Panel value="files" pt="md">
                <EmptyState title="Документів ще немає" description="Перетягніть файли сюди" />
              </Tabs.Panel>

              <Tabs.Panel value="contacts" pt="md">
                <Paper withBorder p="md" radius="md">
                  <Text size="sm">Петренко Олена — директор, {client.phone}</Text>
                </Paper>
              </Tabs.Panel>
            </Tabs>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack>
            {/* Блок «Для тарифу» — то, без чего не порахувати вартість (FR-2.0.5) */}
            <Card withBorder radius="md">
              <Title order={5} mb="sm">
                Для тарифу
              </Title>
              <Stack gap="xs">
                <Text size="sm">Документів на місяць: 40–60</Text>
                <Text size="sm">Працівників: 3</Text>
                <Text size="sm">Дія.City: ні</Text>
                <Text size="sm">Напрям: Послуги</Text>
              </Stack>
            </Card>
            <Card withBorder radius="md">
              <Title order={5} mb="sm">
                Договір
              </Title>
              <Stack gap="xs">
                <Text size="sm">№ 114 від 25.08.2026</Text>
                <Text size="sm">Абонплата: 8 500 ₴</Text>
              </Stack>
            </Card>
          </Stack>
        </Grid.Col>
      </Grid>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Grid.Col span={6}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm">{value}</Text>
    </Grid.Col>
  );
}
