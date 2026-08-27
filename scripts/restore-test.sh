#!/usr/bin/env bash
# Еженедельная автопроверка бэкапа (04-deployment.md): без неё о битом дампе
# узнают в худший возможный день — при настоящей аварии. Поднимает временный
# Postgres, восстанавливает последний дамп, проверяет, что в нём вообще есть
# данные, гасит контейнер. Продовую БД и volume не трогает — только db.dump.
#
# Запускается из /etc/cron.d/wise-crm-backup раз в неделю.
set -euo pipefail

cd "$(dirname "$0")/.."

DEST=/var/backups/wise-crm
LATEST=$(ls -1d "$DEST"/20*/ 2>/dev/null | tail -1 || true)
if [ -z "$LATEST" ]; then
  echo "ПОМИЛКА: у $DEST немає жодного снапшоту — backup.sh ще не запускався" >&2
  exit 1
fi
DUMP="$LATEST/db.dump"
if [ ! -s "$DUMP" ]; then
  echo "ПОМИЛКА: $DUMP відсутній або порожній" >&2
  exit 1
fi

CONTAINER=wise-crm-restore-test
cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# Ізольований контейнер, без volume і без publish портів — не займає нічого,
# що потрібно проду; той самий образ, що й у docker-compose.prod.yml.
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=restore-test -e POSTGRES_DB=restore_test \
  postgres:17-alpine >/dev/null

for _ in $(seq 1 30); do
  docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

docker cp "$DUMP" "$CONTAINER":/tmp/restore.dump
docker exec "$CONTAINER" pg_restore --no-owner -U postgres -d restore_test /tmp/restore.dump

# Порог — сам факт, що в критичних таблицях є рядки. Мета не «точна цифра
# збігається», а «дамп не порожній і не побитий» — саме це і є головний ризик.
CLIENTS=$(docker exec "$CONTAINER" psql -U postgres -d restore_test -tAc 'select count(*) from "Client"')
TASKS=$(docker exec "$CONTAINER" psql -U postgres -d restore_test -tAc 'select count(*) from "Task"')
echo "Відновлено з $DUMP: клієнтів=$CLIENTS, задач=$TASKS"

MIN_ROWS="${RESTORE_TEST_MIN_ROWS:-1}"
if [ "$CLIENTS" -lt "$MIN_ROWS" ] && [ "$TASKS" -lt "$MIN_ROWS" ]; then
  echo "ПОМИЛКА: після відновлення обидві таблиці порожні (< $MIN_ROWS) — дамп підозрілий" >&2
  exit 1
fi

[ -z "${HC_PING_URL_RESTORE:-}" ] || curl -fsS -m 10 --retry 3 "$HC_PING_URL_RESTORE" >/dev/null

echo "Перевірка відновлення пройдена: $LATEST"
