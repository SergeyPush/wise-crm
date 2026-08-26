/**
 * Демо-учётки для локальной разработки и Playwright (09-implementation-plan.md,
 * раздел 3). Не часть схемы, как справочники в seed.ts, — на прод не попадает
 * никогда (гейт по NODE_ENV, как и в PrismaService.truncateAll).
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// Те же параметры, что и в PasswordService — скрипт разовый, не тестовый прогон,
// экономить на Argon2 здесь незачем.
const ARGON_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export const DEV_PASSWORD = 'DevPassword2026x';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed-dev заборонено у production');
  }

  const passwordHash = await argon2.hash(DEV_PASSWORD, ARGON_OPTIONS);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@dev.local' },
    create: {
      email: 'admin@dev.local',
      fullName: 'Адміністратор (dev)',
      role: 'ADMIN',
      passwordHash,
      isProtected: true,
    },
    update: {},
  });

  const manager = await prisma.user.upsert({
    where: { email: 'manager@dev.local' },
    create: { email: 'manager@dev.local', fullName: 'Менеджер (dev)', role: 'USER', passwordHash },
    update: {},
  });

  console.log('Dev-користувачі готові (лише для локальної розробки й e2e):');
  console.log(`  ${admin.email} / ${DEV_PASSWORD} (ADMIN)`);
  console.log(`  ${manager.email} / ${DEV_PASSWORD} (USER)`);

  await seedDemoData(admin.id, manager.id);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (n: number): Date => new Date(Date.now() + n * DAY_MS);

/**
 * Клиенты и задачи — только для того, чтобы список и воронка не были пустыми
 * на свежей локальной базе. Заполняется один раз: если клиенты уже есть
 * (демо или настоящие), скрипт их не трогает и не плодит дубли при повторном запуске.
 */
async function seedDemoData(adminId: string, managerId: string): Promise<void> {
  const statuses = await prisma.clientStatus.findMany();
  const statusByCode = new Map(statuses.map((s) => [s.code, s]));
  const sources = await prisma.leadSource.findMany();
  const sourceByCode = new Map(sources.map((s) => [s.code, s]));
  const priceReason = await prisma.lostReason.findFirst({ where: { code: 'PRICE' } });

  const demoClients = [
    {
      key: 'romashka',
      displayName: 'ТОВ «Кларус»',
      type: 'COMPANY' as const,
      statusCode: 'WON',
      sourceCode: 'REFERRAL',
      taxSystem: 'EP3_5' as const,
      documentsPerMonth: 45,
      employeeCount: 8,
      contractNo: '114',
      contractDate: inDays(-30),
      monthlyFee: 8500,
      assigneeId: managerId,
      contact: { phone: '0671234567', email: 'buh@romashka.ua', isPrimary: true },
    },
    {
      key: 'petrenko',
      displayName: 'ФОП Петренко І. В.',
      type: 'FOP' as const,
      statusCode: 'PROPOSAL_SENT',
      sourceCode: 'ADS',
      taxSystem: 'EP2' as const,
      documentsPerMonth: 15,
      assigneeId: managerId,
      contact: { phone: '0637403599', isPrimary: true },
    },
    {
      key: 'budmaister',
      displayName: 'ТОВ «Будмайстер»',
      type: 'COMPANY' as const,
      statusCode: 'IN_PROGRESS',
      sourceCode: 'COLD_CALL',
      isVatPayer: true,
      taxSystem: 'GENERAL' as const,
      assigneeId: adminId,
      contact: { phone: '0509876543', isPrimary: true },
    },
    {
      key: 'novyi-lid',
      displayName: 'ФОП · +380975551122',
      type: 'FOP' as const,
      statusCode: 'NEW',
      sourceCode: 'WEBSITE',
      needsQualification: true,
      assigneeId: null,
      contact: { phone: '0975551122', isPrimary: true },
    },
    {
      key: 'svitanok',
      displayName: 'ТОВ «Світанок»',
      type: 'COMPANY' as const,
      statusCode: 'LOST',
      sourceCode: 'OTHER',
      lostReasonId: priceReason?.id,
      assigneeId: managerId,
      contact: { phone: '0442223344', isPrimary: true },
    },
  ];

  const clientIds = new Map<string, string>();
  for (const c of demoClients) {
    // Идемпотентность по имени — на случай повторного запуска (реальные
    // клиенты, которых успели завести руками, не трогаем и не дублируем).
    const existing = await prisma.client.findFirst({ where: { displayName: c.displayName } });
    if (existing) {
      clientIds.set(c.key, existing.id);
      continue;
    }

    const status = statusByCode.get(c.statusCode);
    const source = sourceByCode.get(c.sourceCode);
    if (!status || !source) continue;

    const created = await prisma.client.create({
      data: {
        displayName: c.displayName,
        type: c.type,
        statusId: status.id,
        sourceId: source.id,
        taxSystem: c.taxSystem,
        isVatPayer: c.isVatPayer ?? false,
        documentsPerMonth: c.documentsPerMonth,
        employeeCount: c.employeeCount,
        contractNo: c.contractNo,
        contractDate: c.contractDate,
        monthlyFee: c.monthlyFee,
        needsQualification: c.needsQualification ?? false,
        lostReasonId: c.lostReasonId,
        contacts: { create: c.contact },
        ...(c.assigneeId ? { assignees: { create: { userId: c.assigneeId, role: 'PRIMARY' } } } : {}),
      },
    });
    clientIds.set(c.key, created.id);
  }

  const demoTasks = [
    {
      title: 'Передзвонити щодо КП',
      type: 'CALL' as const,
      clientKey: 'petrenko',
      authorId: managerId,
      assigneeId: managerId,
      dueAt: inDays(-1), // прострочена
    },
    {
      title: 'Надіслати договір на підпис',
      type: 'CONTRACT' as const,
      clientKey: 'romashka',
      authorId: managerId,
      assigneeId: managerId,
      dueAt: inDays(0),
    },
    {
      title: 'Подзвонити за заявкою',
      type: 'CALL' as const,
      clientKey: 'novyi-lid',
      authorId: null,
      assigneeId: null, // задача з пулу (FR-W5)
      dueAt: inDays(0),
    },
    {
      title: 'Зустріч в офісі',
      type: 'MEETING' as const,
      clientKey: 'budmaister',
      authorId: adminId,
      assigneeId: adminId,
      dueAt: inDays(3),
    },
    {
      title: 'Зафіксовано контакт',
      type: 'CALL' as const,
      clientKey: 'romashka',
      authorId: managerId,
      assigneeId: managerId,
      dueAt: inDays(-2),
      status: 'DONE' as const,
      completedAt: inDays(-2),
      result: "Домовились про дату підписання",
    },
  ];

  let tasksCreated = 0;
  for (const t of demoTasks) {
    const clientId = clientIds.get(t.clientKey);
    if (!clientId) continue;
    const existingTask = await prisma.task.findFirst({ where: { clientId, title: t.title } });
    if (existingTask) continue;

    await prisma.task.create({
      data: {
        title: t.title,
        type: t.type,
        clientId,
        authorId: t.authorId,
        assigneeId: t.assigneeId,
        dueAt: t.dueAt,
        status: t.status ?? 'OPEN',
        completedAt: t.completedAt,
        result: t.result,
      },
    });
    tasksCreated += 1;
  }

  console.log(`Демо-дані готові: клієнтів — ${clientIds.size}, нових задач — ${tasksCreated}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
