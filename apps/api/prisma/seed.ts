/**
 * Seed справочников (09-implementation-plan.md, раздел 3).
 * Это не «тестовые данные» — без них система не запускается: у лида нет статуса,
 * у задачи нет типа. Идемпотентен: гоняется на каждом деплое.
 *
 * Демо-клиентов здесь нет намеренно — они в seed-dev.ts, который на прод не попадает.
 */
import { PrismaClient, Stage, TaskType } from '@prisma/client';

const prisma = new PrismaClient();

// Порядок, stage и флаги критичны: по ним работает логика воронки (FR-2.6).
// Цвета — из палитры темы Mantine, а не выдуманные на месте (06-ui-layout.md).
const STATUSES = [
  { code: 'NEW', label: 'Лід', stage: Stage.LEAD, sortOrder: 10, color: 'gray', isDefaultForNew: true },
  { code: 'IN_PROGRESS', label: 'Переговори', stage: Stage.IN_WORK, sortOrder: 20, color: 'blue' },
  { code: 'PROPOSAL_SENT', label: 'КП надіслано', stage: Stage.IN_WORK, sortOrder: 30, color: 'indigo' },
  { code: 'CONTRACT_SENT', label: 'Договір на підписанні', stage: Stage.IN_WORK, sortOrder: 40, color: 'violet' },
  { code: 'WON', label: 'Договір підписано', stage: Stage.WON, sortOrder: 50, color: 'green', isTerminal: true },
  { code: 'LOST', label: 'Відмова', stage: Stage.LOST, sortOrder: 60, color: 'red', isTerminal: true, requiresReason: true },
] as const;

const TASK_TYPES = [
  { code: TaskType.CALL, label: 'Дзвінок', sortOrder: 10 },
  { code: TaskType.PROPOSAL, label: 'КП', sortOrder: 20 },
  { code: TaskType.CONTRACT, label: 'Договір', sortOrder: 30 },
  { code: TaskType.DOCS, label: 'Документи', sortOrder: 40 },
  { code: TaskType.MEETING, label: 'Зустріч', sortOrder: 50 },
  { code: TaskType.OTHER, label: 'Інше', sortOrder: 60 },
] as const;

const DOCUMENT_CATEGORIES = [
  { code: 'PROPOSAL', label: 'КП', sortOrder: 10 },
  { code: 'CONTRACT', label: 'Договори', sortOrder: 20 },
  { code: 'FOUNDING', label: 'Установчі', sortOrder: 30 },
  { code: 'POA', label: 'Довіреності', sortOrder: 40 },
  { code: 'CORRESPONDENCE', label: 'Листування', sortOrder: 50 },
  { code: 'OTHER', label: 'Інше', sortOrder: 60 },
] as const;

// Рабочая заглушка до ответа заказчика (07-open-questions.md, раздел 2).
// «Сайт» системный: его проставляет обработчик веб-заявок (FR-W5).
const LEAD_SOURCES = [
  { code: 'WEBSITE', label: 'Сайт', sortOrder: 10, isSystem: true },
  { code: 'REFERRAL', label: 'Рекомендація', sortOrder: 20 },
  { code: 'ADS', label: 'Реклама', sortOrder: 30 },
  { code: 'COLD_CALL', label: 'Холодний обдзвін', sortOrder: 40 },
  { code: 'OTHER', label: 'Інше', sortOrder: 50 },
] as const;

const LOST_REASONS = [
  { code: 'PRICE', label: 'Ціна', sortOrder: 10 },
  { code: 'COMPETITOR', label: 'Пішов до конкурента', sortOrder: 20 },
  { code: 'CLOSED_BUSINESS', label: 'Закрив ФОП/бізнес', sortOrder: 30 },
  { code: 'NO_CONTACT', label: 'Не виходить на звʼязок', sortOrder: 40 },
  { code: 'OTHER', label: 'Інше', sortOrder: 50 },
] as const;

const APP_SETTINGS = [
  { key: 'PROPOSAL_NO_REPLY_DAYS', value: 5 }, // FR-5.2
  { key: 'LEAD_INACTIVE_DAYS', value: 7 },
  { key: 'FILE_MAX_MB', value: 25 },
] as const;

async function main(): Promise<void> {
  for (const s of STATUSES) {
    await prisma.clientStatus.upsert({
      where: { code: s.code },
      create: {
        code: s.code,
        label: s.label,
        color: s.color,
        sortOrder: s.sortOrder,
        stage: s.stage,
        isTerminal: 'isTerminal' in s ? s.isTerminal : false,
        requiresReason: 'requiresReason' in s ? s.requiresReason : false,
        isDefaultForNew: 'isDefaultForNew' in s ? s.isDefaultForNew : false,
      },
      // label и цвет админ может поменять — обновляем только структурные поля
      update: { sortOrder: s.sortOrder, stage: s.stage },
    });
  }

  for (const t of TASK_TYPES) {
    await prisma.taskTypeRef.upsert({
      where: { code: t.code },
      create: t,
      update: { sortOrder: t.sortOrder },
    });
  }

  for (const c of DOCUMENT_CATEGORIES) {
    await prisma.documentCategory.upsert({
      where: { code: c.code },
      create: c,
      update: { sortOrder: c.sortOrder },
    });
  }

  for (const s of LEAD_SOURCES) {
    await prisma.leadSource.upsert({
      where: { code: s.code },
      create: {
        code: s.code,
        label: s.label,
        sortOrder: s.sortOrder,
        isSystem: 'isSystem' in s ? s.isSystem : false,
      },
      update: { sortOrder: s.sortOrder },
    });
  }

  for (const r of LOST_REASONS) {
    await prisma.lostReason.upsert({
      where: { code: r.code },
      create: r,
      update: { sortOrder: r.sortOrder },
    });
  }

  for (const s of APP_SETTINGS) {
    await prisma.appSetting.upsert({
      where: { key: s.key },
      create: { key: s.key, value: s.value },
      update: {}, // значение мог поменять админ — не затираем
    });
  }

  console.log('Довідники засіяно:');
  console.log(`  статуси: ${STATUSES.length}, типи задач: ${TASK_TYPES.length}`);
  console.log(`  категорії документів: ${DOCUMENT_CATEGORIES.length}`);
  console.log(`  джерела: ${LEAD_SOURCES.length}, причини відмови: ${LOST_REASONS.length}`);
  console.log(`  налаштування: ${APP_SETTINGS.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
