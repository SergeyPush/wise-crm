-- Частичные уникальные индексы: Prisma их не описывает декларативно,
-- поэтому они заводятся SQL-миграцией и живут в схеме с первого дня.

-- Ровно один PRIMARY-ответственный на клиента (FR-2.0).
-- Без этого индекса «взять клиента себе» под гонкой оставит двух основных.
CREATE UNIQUE INDEX "client_assignees_one_primary_per_client"
  ON "ClientAssignee" ("clientId")
  WHERE "role" = 'PRIMARY';

-- Ровно один статус по умолчанию для нового лида (FR-2.6.1).
CREATE UNIQUE INDEX "client_statuses_single_default_for_new"
  ON "ClientStatus" ("isDefaultForNew")
  WHERE "isDefaultForNew" = true;

-- Поиск по имени клиента и контактного лица (FR-2.10): триграммы вместо LIKE '%…%',
-- иначе на нескольких тысячах записей поиск идёт seq scan'ом.
CREATE INDEX "clients_display_name_trgm" ON "Client" USING gin ("displayName" gin_trgm_ops);
CREATE INDEX "clients_legal_name_trgm" ON "Client" USING gin ("legalName" gin_trgm_ops);
CREATE INDEX "client_contacts_full_name_trgm" ON "ClientContact" USING gin ("fullName" gin_trgm_ops);

-- Активные (не удалённые) клиенты — основной фильтр каждого списка.
CREATE INDEX "clients_active_last_activity"
  ON "Client" ("lastActivityAt" DESC)
  WHERE "deletedAt" IS NULL;
