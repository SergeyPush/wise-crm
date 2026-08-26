# Технический стек и архитектура

## Итоговый выбор

| Слой        | Решение                                                      | Почему                                                                                                                                                                |
| ----------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend     | **NestJS 11 + Fastify adapter**                              | Ваш выбор, он же правильный: DI, guards, декларативные права, модульность. Fastify — ~2× throughput против Express.                                                   |
| ORM         | **Prisma**                                                   | Типобезопасность, миграции, отличный DX. Альтернатива — Drizzle (легче, ближе к SQL), но Prisma быстрее для команды 1–2 человека.                                     |
| БД          | **PostgreSQL 17**                                            | Расширения: `pg_trgm` (поиск), `citext` (email), `pgcrypto` (`gen_random_uuid()`).                                                                                    |
| Кэш/очереди | **Ничего в MVP.** Позже — Redis + BullMQ                     | Планировщик (дайджест, просрочки, напоминания по КЕП) — `@nestjs/schedule` в процессе. Redis только когда появятся тяжёлые фоновые задачи (docx-генерация, рассылки). |
| Frontend    | **React 19 + Vite + TypeScript**                             | SPA. **Не Next.js**: внутренняя админка за логином, SSR/SEO не нужны, а Next добавляет Node-рантайм, кэш-слои и класс багов на ровном месте.                          |
| Роутинг     | **TanStack Router**                                          | Типобезопасные search-params — фильтры списка живут в URL (FR-2.11) без ручного парсинга.                                                                             |
| Данные      | **TanStack Query**                                           | Кэш, инвалидация, оптимистичные апдейты (FR-8.8), ретраи. Без него NFR-3 не выполнить.                                                                                |
| **UI-кит**  | **Mantine 8** (+ `mantine-datatable`, `mantine-contextmenu`) | См. разбор ниже — с учётом требования по ПКМ выбор однозначен.                                                                                                        |
| Таблицы     | **mantine-datatable** (поверх собственной вирт. таблицы)     | Серверная пагинация/сортировка, выделение строк, **встроенный `rowContextMenu`**, вирт. скролл.                                                                       |
| Формы       | **`@mantine/form` + Zod-резолвер**                           | Одна Zod-схема на форму и на типы API.                                                                                                                                |
| Состояние   | TanStack Query + `useState`; Zustand — только для UI-стейта  | Redux здесь оверинжиниринг.                                                                                                                                           |
| Auth        | JWT в httpOnly cookie, `@nestjs/passport` + custom guard     | NFR-15.                                                                                                                                                               |
| Деплой      | Docker Compose за существующим nginx на VPS                  | `04-deployment.md`.                                                                                                                                                   |

## UI-кит: почему Mantine, а не shadcn

Вы спросили прямо: хватит ли Mantine на уведомления, карточки клиентов и ПКМ. **Да, и это самый весомый аргумент за него.**

Что закрывается пакетами Mantine из коробки, без единой строчки вёрстки с нуля:

| Нужно в CRM                                  | Mantine                                                                                             |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Уведомления/тосты + «Скасувати» 5 с (FR-8.8) | `@mantine/notifications` — `notifications.show/update/hide`, действия внутри тоста                  |
| Модалки, подтверждения удаления              | `@mantine/modals` — `modals.openConfirmModal`, менеджер вместо ручного стейта                       |
| Карточка клиента                             | `Card`, `Paper`, `Tabs`, `Timeline` (лента активности!), `Badge`, `Avatar`, `Grid`                  |
| Таблица клиентов                             | `mantine-datatable`: серверная пагинация, сортировка, выделение, контекстное меню                   |
| **ПКМ где угодно**                           | `mantine-contextmenu`: `showContextMenu([...])`, подменю, иконки, `disabled/hidden`, `danger`-стиль |
| Глобальный поиск `Ctrl+K` (NFR-25)           | `@mantine/spotlight` — готовый командный палет                                                      |
| Даты, периоды, дедлайны                      | `@mantine/dates` — `DateInput`, `DatePickerInput` с range, локаль `uk`                              |
| Загрузка файлов                              | `@mantine/dropzone`                                                                                 |
| Комментарии с форматированием                | `@mantine/tiptap`                                                                                   |
| Дашборд-графики                              | `@mantine/charts` (обёртка над Recharts)                                                            |
| Горячие клавиши (FR-8.9)                     | `@mantine/hooks` — `useHotkeys`                                                                     |

Обе библиотеки — `mantine-datatable` и `mantine-contextmenu` — от одного автора (icflorescu), живые и специально сделаны под админки/CRM. С shadcn вы бы собирали DataTable из TanStack Table руками, дата-рейндж-пикер и мультиселект добирали отдельно, а контекстное меню (Radix ContextMenu — сам по себе отличный) стыковали с таблицей самостоятельно. Это 1–2 недели работы, которых при вашем приоритете «не задумываться над дизайном» брать неоткуда.

Цена решения, честно: рантайм ~90–110 КБ gzip и темизация «по-мантиновски» (CSS-переменные + `theme` объект) вместо полного контроля над кодом компонента. При 10 пользователях и внутренней админке это не имеет значения.

**Когда всё-таки shadcn:** если вы уже уверенно живёте в Tailwind и хотите владеть кодом компонентов. Тогда связка `Radix ContextMenu` + `TanStack Table` + `sonner` + `cmdk` + `react-day-picker` даёт тот же результат, но собирается руками. Оба варианта рабочие; **AntD/MUI — нет** (вес, чужой дизайн-язык, тяжёлая кастомизация плотных таблиц).

Дополнительно, независимо от кита: `@tabler/icons-react`, `mantine-datatable`, `@tanstack/react-query`, `zod`. `dnd-kit` не нужен — канбан ушёл в v1.1 (FR-2.12).

## Архитектура быстрых действий (реестр)

Контекстное меню, кнопка «⋮», тулбар массовых действий и хоткеи должны быть **одним источником правды** — иначе права разъедутся между четырьмя местами (FR-8.4).

```ts
// features/clients/actions.ts
export type Action<T> = {
  id: string;
  label: string;
  icon?: Icon;
  danger?: boolean;
  hidden?: (ctx: Ctx<T>) => boolean; // нет права / не применимо
  disabled?: (ctx: Ctx<T>) => boolean;
  hotkey?: string;
  items?: Action<T>[]; // подменю: статусы, исполнители, сроки
  run: (ctx: Ctx<T>) => Promise<void> | void;
};

export function useClientActions(): Action<Client>[] {
  /* ... */
}
```

Потребители реестра:

- `mantine-contextmenu` — `showContextMenu(toMenuItems(actions, ctx))`;
- `mantine-datatable` — проп `rowContextMenu`;
- `<Menu>` под кнопкой «⋮» — тот же массив;
- `useHotkeys` — фильтр по `action.hotkey`;
- тулбар массовых действий — подмножество с флагом `bulk: true`.

Мутации — через TanStack Query с `onMutate` (оптимистично) и тостом с кнопкой «Скасувати»: запрос уходит **сразу**, а «Скасувати» вызывает компенсирующую мутацию (FR-8.8). Придерживать запрос через `setTimeout` не нужно — закрытая вкладка теряла бы действие.

Перехват ПКМ: обработчик на строке проверяет `e.shiftKey` и наличие выделенного текста (`window.getSelection()`), и в этих случаях `return` без `preventDefault()` (FR-8.5).

## Типы между фронтом и бэком

1. Nest отдаёт **OpenAPI** (`@nestjs/swagger`, схемы из `class-validator` декораторов).
2. Фронт генерирует клиент: `openapi-typescript` + `openapi-fetch`, команда `pnpm gen:api`.

Альтернатива — **tRPC вместо REST**: быстрее в разработке, но теряете Swagger и удобство внешних интеграций (телефония, банки, портал клиента из backlog). При таких планах — REST + OpenAPI.

## Структура репозитория (монорепо, pnpm workspaces)

```
wise-crm/
├─ apps/
│  ├─ api/                    # NestJS
│  │  ├─ src/
│  │  │  ├─ modules/
│  │  │  │  ├─ auth/          # login, refresh, guards, strategies
│  │  │  │  ├─ users/
│  │  │  │  ├─ clients/       # + contacts, status-history, comments
│  │  │  │  ├─ tasks/
│  │  │  │  ├─ files/
│  │  │  │  ├─ dictionaries/  # статусы, источники, причины отказа, теги
│  │  │  │  ├─ notifications/
│  │  │  │  ├─ audit/
│  │  │  │  └─ dashboard/
│  │  │  ├─ common/           # guards, interceptors, filters, pagination, logger
│  │  │  └─ prisma/
│  │  └─ prisma/schema.prisma + migrations/
│  └─ web/                    # React + Vite
│     └─ src/
│        ├─ routes/           # TanStack Router
│        ├─ features/         # clients/, tasks/, auth/, dashboard/ — компоненты+хуки+actions
│        ├─ components/       # общие обёртки над Mantine
│        ├─ lib/              # api client, query client, formatters (uk-UA), permissions
│        └─ hooks/
├─ packages/shared/           # enums, матрица прав, общие zod-схемы
├─ docker/                    # Dockerfile, nginx/crm.conf (для сервера)
├─ docker-compose.yml         # локальная разработка
├─ docker-compose.prod.yml
└─ docs/
```

Модуль Nest: `*.controller.ts` (HTTP + Swagger), `*.service.ts` (единственное место бизнес-логики), `dto/`, `*.spec.ts`. Контроллер не знает про Prisma, сервис не знает про HTTP.

## Модель данных (ядро, украинские реквизиты)

```prisma
model User {
  id            String   @id @default(uuid()) @db.Uuid
  email         String   @unique @db.Citext
  passwordHash  String
  fullName      String
  phone         String?
  role          Role     @default(USER)     // ADMIN | USER
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  clients       ClientAssignee[]
  tasksAssigned Task[]   @relation("assignee")
}

model Client {
  id             String   @id @default(uuid()) @db.Uuid
  displayName    String
  legalName      String?
  type           ClientType              // COMPANY(ТОВ) | FOP | PERSON | OTHER
  edrpou         String?  @db.VarChar(8)   // юрособи
  rnokpp         String?  @db.VarChar(10)  // ФОП / фізособи
  vatNumber      String?  @db.VarChar(12)  // ІПН платника ПДВ
  isVatPayer     Boolean  @default(false)
  vatRegDate     DateTime? @db.Date
  taxSystem      TaxSystem?              // GENERAL | EP1 | EP2 | EP3_5 | EP3_3_VAT | EP4
  kved           String?
  employeeCount  Int?
  documentsPerMonth Int?                  // з веб-форми (DocumentQuantity) — вхід для розрахунку тарифу
  isDiiaCity     Boolean  @default(false)  // з веб-форми (DiyaCity)
  businessTypes  String[] @default([])     // з веб-форми (OrganizationalType): Продажі, Послуги, ...
  needsQualification Boolean @default(false) // заявка без імені (FR-W3), знімається при зміні displayName
  legalAddress   String?
  actualAddress  String?
  statusId       String   @db.Uuid
  status         ClientStatus @relation(fields: [statusId], references: [id])
  assignees      ClientAssignee[]            // 1+ відповідальних (FR-2.0), а не скалярне поле
  sourceId       String?  @db.Uuid
  lostReasonId   String?  @db.Uuid
  monthlyFee     Decimal? @db.Decimal(12,2)   // ₴
  contractNo     String?
  contractDate   DateTime? @db.Date
  notes          String?
  customFields   Json     @default("{}")
  lastActivityAt DateTime?                   // денормалізація з activity_events → FR-5.2.1
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  deletedAt      DateTime?

  contacts       ClientContact[]
  tasks          Task[]
  statusHistory  ClientStatusHistory[]
  comments       Comment[]
  files          Attachment[]
  tags           ClientTag[]

  @@index([statusId]) @@index([edrpou]) @@index([rnokpp])
  @@index([deletedAt]) @@index([lastActivityAt])
}

// Кілька відповідальних на клієнта (FR-2.0). Рівно один PRIMARY — гарантується
// частковим унікальним індексом у міграції: UNIQUE (client_id) WHERE role = 'PRIMARY'
model ClientAssignee {
  clientId  String       @db.Uuid
  userId    String       @db.Uuid
  role      AssigneeRole @default(SECONDARY)  // PRIMARY | SECONDARY
  createdAt DateTime     @default(now())
  client    Client       @relation(fields: [clientId], references: [id])
  user      User         @relation(fields: [userId], references: [id])
  @@id([clientId, userId])
  @@index([userId])                            // «мої клієнти» — головний запит системи
}

// Заявка з веб-форми сайту (FR-W2). Сирий payload зберігається ДО розбору,
// щоб невідоме значення поля на сайті не втратило заявку.
model WebLead {
  id          String   @id @default(uuid()) @db.Uuid
  rawPayload  Json
  receivedAt  DateTime @default(now())
  processedAt DateTime?
  clientId    String?  @db.Uuid           // створений або знайдений клієнт
  isDuplicate Boolean  @default(false)    // повторна заявка (FR-W6)
  error       String?                     // текст помилки розбору
  sourceIp    String?
  @@index([receivedAt]) @@index([processedAt])
}

// Відповідність значень веб-форми полям CRM (FR-W4). У БД, бо значення
// на сайті змінюються без релізу CRM.
model WebFormMapping {
  id         String @id @default(uuid()) @db.Uuid
  field      String                       // OrganisationalForm | TaxSystem | AdditionalInfo | ...
  rawValue   String                       // «Загальна система»
  targetPath String                       // client.taxSystem
  mappedValue String                      // GENERAL
  @@unique([field, rawValue])
}

model ClientStatus {              // справочник, не enum
  id             String  @id @default(uuid()) @db.Uuid
  code           String  @unique
  label          String
  color          String
  sortOrder      Int
  stage          Stage                     // LEAD | IN_WORK | WON | LOST — семантика для логіки (FR-2.6)
  isTerminal     Boolean @default(false)
  requiresReason Boolean @default(false)   // FR-2.8 замість хардкоду LOST
  isDefaultForNew Boolean @default(false)  // стартовий статус ліда (FR-2.6.1);
                                           // partial unique: UNIQUE WHERE is_default_for_new
  isActive       Boolean @default(true)
}

// Лента активности (FR-2.16). Append-only, пишется в одной транзакции с мутацией.
// Единственный источник ленты на карточке и Client.lastActivityAt.
model ActivityEvent {
  id         String   @id @default(uuid()) @db.Uuid
  clientId   String?  @db.Uuid
  type       String                        // status_changed | comment | task_created | file_added | field_changed
  actorId    String   @db.Uuid
  entityType String?                       // на что ссылается событие
  entityId   String?  @db.Uuid
  payload    Json                          // {from,to} | {field,old,new} | {taskId,title}
  createdAt  DateTime @default(now())
  @@index([clientId, createdAt(sort: Desc)])
}

// Настройки приложения, меняемые админом без передеплоя (FR-0.1)
model AppSetting {
  key       String   @id                   // USER_CAN_SEE_ALL_CLIENTS, FILE_MAX_MB, ...
  value     Json
  updatedAt DateTime @updatedAt
  updatedBy String?  @db.Uuid
}

model ClientStatusHistory {
  id        String   @id @default(uuid()) @db.Uuid
  clientId  String   @db.Uuid
  fromId    String?  @db.Uuid
  toId      String   @db.Uuid
  reasonId  String?  @db.Uuid
  comment   String?
  userId    String   @db.Uuid
  createdAt DateTime @default(now())
  @@index([clientId, createdAt])
}

model Task {
  id          String     @id @default(uuid()) @db.Uuid
  title       String
  description String?
  type        TaskType                  // CALL | PROPOSAL | CONTRACT | DOCS | MEETING | OTHER
  status      TaskStatus @default(OPEN) // OPEN | IN_PROGRESS | DONE | CANCELLED
  priority    Priority   @default(NORMAL)
  clientId    String?    @db.Uuid
  assigneeId  String?    @db.Uuid           // nullable: задача з пулу без виконавця (FR-W5)
  authorId    String     @db.Uuid
  dueAt       DateTime?                 // timestamptz; «день» рахується по Europe/Kyiv (FR-3.1.1)
  completedAt DateTime?
  result      String?                   // обов'язковий при DONE для CALL/PROPOSAL/CONTRACT (FR-3.5)
  cancelReason String?                  // обов'язковий при CANCELLED (FR-3.5)
  recurrenceId String?  @db.Uuid        // шаблон повторення (FR-3.6, v1.1); поле закладаємо одразу
  sourceKey   String?   @unique         // ідемпотентність системних задач (заявка з сайту, FR-W5/W6)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  deletedAt   DateTime?                 // м'яке видалення (FR-3.8)
  @@index([assigneeId, status, dueAt]) @@index([clientId]) @@index([dueAt]) @@index([deletedAt])
}
```

Плюс `ClientContact` с обязательной нормализованной колонкой телефона:

```prisma
model ClientContact {
  id              String  @id @default(uuid()) @db.Uuid
  clientId        String  @db.Uuid
  fullName        String?                 // необов'язкове: у веб-формі імені немає (FR-W3)
  position        String?
  phone           String?                 // як ввів користувач
  phoneNormalized String?                 // +380XXXXXXXXX — пошук і дублі (NFR-5.1)
  email           String? @db.Citext
  messenger       String?                 // telegram / viber
  isPrimary       Boolean @default(false)
  @@index([clientId]) @@index([phoneNormalized]) @@index([email])
}
```

Плюс: `TaskRecurrence` (RRULE + шаблон полей задачи, FR-3.6, v1.1), `Comment` (`entityType/entityId`), `Attachment`, `Tag`/`ClientTag`, `Notification`, `NotificationDelivery`, `AuditLog`, `RefreshToken`, справочники `LeadSource`/`LostReason`/`TaskTypeRef`/`DocumentCategory`.

Чего в схеме **нет** и почему (решения от 26.08.2026, см. `08-gap-analysis.md`): `ClientGroup` и `Client.groupId` — группы не делаем; `ImportJob` — импорта нет (FR-2.15); `ExportJob` — экспорт синхронный, XLSX по фильтру (FR-2.14); `SavedView` и `UserPreference` — сохранённых представлений и настройки колонок в MVP нет, фильтры живут в URL (FR-2.11.1); `FileBlob` — дедупликация файлов ушла в v1.1 (FR-F14); поля обслуживания (`serviceCycle`, `serviceStart`, `serviceEnd`) и весь КЕП-контур (`kepExpiresAt`, `kepHandedOver`, `kepMedia`) вместе с `accountingApp`, `reportingApp`, `usesRro`, `rroSolution`, `bankName`, `iban` — воронка заканчивается на подписанном договоре.

Правила: id — `uuid v4` (безопаснее в URL); все таймстемпы `timestamptz` в UTC, а **календарные вычисления** («сьогодні», «прострочено», дайджест) — в `Europe/Kyiv` (FR-3.1.1, NFR-45); деньги — `Decimal`, не `float`; мягкое удаление у `Client`, `Task` и `Attachment`; `updatedAt` участвует в оптимистичной блокировке при редактировании (NFR-46) — мутации карточки принимают его и отвечают `409` при расхождении.

Валидация украинских реквизитов на бэке: ЄДРПОУ — 8 цифр + контрольная сумма, РНОКПП — 10 цифр + контрольная сумма, IBAN — 29 символов формата `UA…` с mod-97. Дешёвые проверки, ловят половину опечаток при импорте.

## Ключевые API-соглашения

- Префикс `/api/v1`, kebab-case, множественное число: `GET /api/v1/clients`.
- Пагинация `?page=1&limit=25&sort=-createdAt` → `{ items, total, page, limit }`.
- Фильтры — плоские query-параметры: `?status=lead&assigneeId=…&q=петренко`. `assigneeId` совпадает по **любому** из ответственных (FR-2.0), а не только по основному; `assigneeId=none` возвращает пул нераспределённых (FR-2.0.3).
- Ошибки единого формата: `{ statusCode, code: "CLIENT_DUPLICATE_EDRPOU", message, details, requestId }` — `code` машиночитаемый, `message` украинский для показа, `requestId` тот же, что в логе (NFR-31.2), и показывается пользователю как «Код: a3f9c1».
- Мутации возвращают полный обновлённый объект (TanStack Query кладёт его в кэш без рефетча).

## Порядок разработки

Этапы, их состав и критерии готовности — в `09-implementation-plan.md`, раздел 4. Здесь они намеренно не дублируются: два описания одного плана расходятся при первой же правке, и в этом документе план работ — гость, а не хозяин.

Коротко: **~6 недель** одним разработчиком, пять этапов, каждый заканчивается деплоем на прод.

## Размещение: поддомен `crm.wisexpert.com.ua`

Сайт компании (Next.js за nginx на Hostinger) занимает корень домена. **Решение заказчика от 26.08.2026 — вариант Г: поддомен `crm.wisexpert.com.ua` на том же VPS**, плюс 301-редирект с `wisexpert.com.ua/crm`, чтобы привычная ссылка продолжала работать. Полные варианты и конфиги — в `04-deployment.md`; на архитектуру приложения это влияет так:

- **В коде не меняется ничего.** `BASE_PATH` остаётся `/`, префикс никуда не протягивается. Переменная в схеме сохраняется на случай будущего переезда:

```ts
// packages/shared/config.ts
export const BASE_PATH = import.meta.env.VITE_BASE_PATH ?? '/';
```

- **CRM получает свой origin — это главное.** XSS в зависимости маркетингового сайта не даёт доступа к API CRM: cookie отправится (поддомен и домен — один *site* для `SameSite=Lax`), но прочитать ответ нельзя из-за same-origin policy, а CORS мы не открываем. CSRF-токен (NFR-15) при этом остаётся нечитаемым для атакующего и продолжает работать. На общем origin обе защиты падали бы одновременно.
- **CSP не приходится совмещать с сайтом** — строгий `default-src 'self'` без inline (NFR-42) живёт только на CRM, и ошибка в конфиге сайта его не ослабляет.
- Fastify поднимается с `trustProxy: true` — приложение стоит за обратным прокси, иначе rate limit (NFR-16) и аудит-лог (FR-7.1) запишут IP nginx вместо IP пользователя. При Cloudflare реальный IP берётся из `CF-Connecting-IP`.
- Загрузка документов упирается в лимиты прокси: `client_max_body_size 25M` в nginx должен совпадать с лимитом файла из FR-F7. Рассинхрон даёт 413 без внятной ошибки в интерфейсе.
- Cookie сессии ставится **host-only** (без атрибута `Domain`) — тогда она вообще не уходит в запросы к `wisexpert.com.ua`.
