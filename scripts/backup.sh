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
# /etc/nginx на этом сервере закрыт для traversal кому угодно, кроме root
# (drwx------) — deploy прочитать конфиг не может физически. Не тихо теряем,
# а оставляем видимую пометку: конфиг и так живёт в git (docker/nginx/crm.conf).
cp /etc/nginx/sites-available/crm.wisexpert.com.ua.conf "$WORK/nginx-crm.conf" 2>/dev/null \
  || echo "недоступно для deploy (/etc/nginx root-only) — актуальная копия в git: docker/nginx/crm.conf" \
     > "$WORK/nginx-crm.conf.MISSING"

# Каждый пункт — best-effort: у deploy осознанно нет root/sudo (ufw, крон живёт
# в /etc/cron.d, а не в личном crontab) — это не повод рвать set'ом -e уже
# готовый дамп и снапшот uploads. Проверено на реальном сервере 27.08.2026:
# исходная версия падала именно здесь, а не на дампе/rsync.
{
  docker compose -f docker-compose.prod.yml images
  echo "--- /etc/cron.d/wise-crm-backup ---"
  cat /etc/cron.d/wise-crm-backup 2>/dev/null || echo "(недоступно)"
  echo "--- ufw status ---"
  ufw status numbered 2>&1 || echo "(потрібен root — недоступно для deploy)"
} > "$WORK/manifest.txt" 2>&1 || true

# 4. Ретеншен: не более трёх суточных копий (решение от 26.08.2026) —
#    окно восстановления 3 суток, зато диск не улетает за месяц.
ls -1d "$DEST"/20*/ 2>/dev/null | head -n -3 | xargs -r rm -rf

# 5. Контроль места — на 50 ГБ это не формальность (NFR-33: алерт при > 80%,
#    отдельно от отказа в загрузке файла при > 85% — тот уже в StorageService).
USED=$(df --output=pcent /var | tail -1 | tr -dc '0-9')
echo "Диск /var занят ${USED}%"
if [ "$USED" -ge 80 ]; then
  MSG="⚠️ Диск /var на сервері CRM зайнятий ${USED}% — див. NFR-33"
  echo "WARNING: $MSG"
  # Напряму через Telegram Bot API, а не через API застосунку: скрипт має
  # шуміти навіть якщо сам застосунок (і його AlertsService) вже лежить.
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${ALERT_TELEGRAM_CHAT_ID:-}" ]; then
    curl -fsS -m 10 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${ALERT_TELEGRAM_CHAT_ID}" \
      --data-urlencode "text=${MSG}" >/dev/null || echo "Не вдалося надіслати алерт про диск у Telegram"
  fi
fi

# Dead man's switch (Healthchecks.io): пинг только при успешном завершении —
# set -e выше гарантирует, что до этой строки дело не дойдёт при любой ошибке.
# Без HC_PING_URL в .env скрипт работает как раньше, просто без внешнего мониторинга.
[ -z "${HC_PING_URL:-}" ] || curl -fsS -m 10 --retry 3 "$HC_PING_URL" >/dev/null

echo "Бэкап завершён: $WORK"
