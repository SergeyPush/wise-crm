#!/usr/bin/env bash
# Обязательный дамп перед миграциями (NFR-36). Миграция необратима:
# откат образа без отката схемы данные не вернёт.
set -euo pipefail

cd "$(dirname "$0")/.."
source .env

STAMP=$(date +%Y%m%d-%H%M%S)
DEST="/var/backups/wise-crm/pre-deploy"
mkdir -p "$DEST"

docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom \
  > "$DEST/pre-deploy-$STAMP.dump"

echo "Дамп перед деплоєм: $DEST/pre-deploy-$STAMP.dump"

# Держим последние 10 — этого хватает на разбор неудачного релиза
ls -1t "$DEST"/pre-deploy-*.dump | tail -n +11 | xargs -r rm --
