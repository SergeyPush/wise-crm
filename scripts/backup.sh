#!/usr/bin/env bash
# Слой 2 бэкапа (04-deployment.md): ежедневный дамп БД + снапшот uploads на
# жёстких ссылках + конфигурация окружения. Слой 1 (снапшоты VPS у хостера) —
# отдельно, включается в hPanel, этот скрипт его не касается.
#
# Запускается из /etc/cron.d/wise-crm-backup под:
#   nice -n 19 ionice -c3 /opt/wise-crm/scripts/backup.sh
# nice/ionice — не украшение: ядро одно, gzip дампа не должен конкурировать
# с запросами, если кто-то работает ночью.
set -euo pipefail

cd "$(dirname "$0")/.."
source .env

DEST=/var/backups/wise-crm
STAMP=$(date +%F)
WORK="$DEST/$STAMP"
# Предыдущий снапшот — источник жёстких ссылок для rsync --link-dest.
# Без него первый прогон на пустом каталоге просто скопирует всё целиком.
PREV=$(ls -1d "$DEST"/20*/ 2>/dev/null | tail -1 || true)

install -d -m 700 -o deploy -g deploy "$DEST" "$WORK"

# 1. Дамп БД: сжатый custom-формат, небольшой, копируется целиком каждый день.
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$WORK/db.dump"

# 2. uploads: снапшот на ЖЁСТКИХ ССЫЛКАХ, а не архив. Неизменившиеся файлы не
#    копируются — три «полных» снапшота занимают примерно один объём плюс
#    дельты. Архив каждую ночь съел бы диск за месяц (раздел «Бэкапы»).
#    Том принадлежит root, поэтому читаем его через одноразовый контейнер.
docker run --rm -v wise-crm_uploads:/data:ro -v "$DEST":/backup alpine \
  sh -c "apk add --no-cache rsync >/dev/null && \
         rsync -a --delete ${PREV:+--link-dest=/backup/$(basename "$PREV")/uploads} \
               /data/ /backup/$STAMP/uploads/"

# 3. Конфигурация и состояние окружения — без этого восстановление
#    возвращает данные, но не тот же compose/nginx/крон, что были на проде.
cp .env docker-compose.prod.yml "$WORK/"
{ docker compose -f docker-compose.prod.yml images; crontab -l; ufw status numbered; } > "$WORK/manifest.txt" 2>&1

# 4. Ретеншен: не более трёх суточных копий (решение от 26.08.2026) —
#    окно восстановления 3 суток, зато диск не улетает за месяц.
ls -1d "$DEST"/20*/ 2>/dev/null | head -n -3 | xargs -r rm -rf

# 5. Контроль места — на 50 ГБ это не формальность.
USED=$(df --output=pcent /var | tail -1 | tr -dc '0-9')
echo "Диск /var занят ${USED}%"
if [ "$USED" -ge 85 ]; then
  echo "WARNING: диск /var занят ${USED}% — см. NFR-33, файлы могут начать отклоняться"
fi

# Dead man's switch (Healthchecks.io): пинг только при успешном завершении —
# set -e выше гарантирует, что до этой строки дело не дойдёт при любой ошибке.
# Без HC_PING_URL в .env скрипт работает как раньше, просто без внешнего мониторинга.
[ -z "${HC_PING_URL:-}" ] || curl -fsS -m 10 --retry 3 "$HC_PING_URL" >/dev/null

echo "Бэкап завершён: $WORK"
