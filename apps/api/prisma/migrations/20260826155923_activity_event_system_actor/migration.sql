-- ActivityEvent.actorId становится nullable: заявка с сайта (FR-W5/W6) —
-- системное событие без пользователя-инициатора, как уже сделано в AuditLog.
--
-- Индексы pg_trgm (clients_display_name_trgm и т.д.) не описаны в schema.prisma
-- декларативно (см. миграцию partial_unique_indexes) — `prisma migrate diff`
-- поэтому видит в них "дрейф" и норовит их удалить. Не трогаем: они нужны
-- поиску (FR-2.10).

-- DropForeignKey
ALTER TABLE "ActivityEvent" DROP CONSTRAINT "ActivityEvent_actorId_fkey";

-- AlterTable
ALTER TABLE "ActivityEvent" ALTER COLUMN "actorId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
