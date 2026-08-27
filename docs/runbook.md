# Runbook WiseCRM — закріпити в Telegram-групі моніторингу

> Мета одна: побачив алерт → знайшов тут, що робити → зробив, не гортаючи репозиторії.
> Сервер: `62.72.21.150` (той самий, що й сайт wisexpert.com.ua — обережно з nginx, розділ нижче).

---

## Доступ

- SSH під `deploy` (ключ, без sudo, у групі `docker`) — для всього, що стосується CRM
- SSH під `root` — тільки для nginx і системних речей; **окремо, не для щоденної роботи**
- Проєкт на сервері: `/opt/wise-crm`, `.env` там же (chmod 600, не в git)
- Бэкапи: `/var/backups/wise-crm/<дата>/`
- Логи застосунку: `docker logs wise-crm-api`
- Логи бэкапу: `/var/log/wise-crm-backup.log`, `/var/log/wise-crm-restore.log`

---

## Що робити на кожен алерт

**🔴 5xx на API**
1. `docker logs wise-crm-api --since 15m | grep <requestId з алерту>`
2. Знайти стек помилки, зрозуміти, чи це разова похибка, чи посипалось масово
3. Якщо масово і незрозуміло — відкат: `TAG=<попередній_sha> docker compose -f docker-compose.prod.yml up -d` в `/opt/wise-crm`

**🟠 Диск ≥ 80%**
1. `df -h /var`
2. `du -sh /var/backups/wise-crm/*` — ретеншен 3 доби, старе не повинно накопичуватись
3. `du -sh /var/lib/docker/volumes/wise-crm_uploads/_data` — чи хтось не залив забагато файлів
4. Не панікувати раніше 85% — вище цього CRM сама відмовляє у завантаженні файлів (не 500-та)

**🟡 Бэкап не відпрацював (dead man's switch мовчить)**
1. `bash -x /opt/wise-crm/scripts/backup.sh` вручну, дивитись, на чому впало
2. Найчастіша причина — місце на диску або тимчасова недоступність postgres
3. Дамп за вчора все одно лежить у `/var/backups/wise-crm/` — це не привід відкладати, але і не привід панікувати

**⚫ Контейнер лежить / `docker compose ps` показує не `healthy`**
1. `cd /opt/wise-crm && docker compose -f docker-compose.prod.yml ps`
2. `docker logs wise-crm-api --tail 100` — зрозуміти причину падіння
3. Перед будь-яким втручанням, що може зачепити дані: `./scripts/pre-deploy-dump.sh`
4. `docker compose -f docker-compose.prod.yml up -d` — підняти назад

**⚪ Падіння фонової джоби (дайджест / прострочення / Telegram-черга / чистка файлів)**
1. Зазвичай самолікується наступним запуском (крон раз на хвилину/день)
2. Якщо повторюється — `docker logs wise-crm-api | grep "Фонова задача впала"`

---

## Відновлення з бэкапу (детально — `04-deployment.md`, тут стисло)

**Сценарій А — зіпсували дані, сервер живий** (найчастіший, ~10 хв)
```
docker compose -f docker-compose.prod.yml stop api
pg_restore -c -d wisecrm /var/backups/wise-crm/<дата>/db.dump
docker compose -f docker-compose.prod.yml start api
```
Перевірити: логін, список клієнтів.

**Сценарій Б — сервер втрачено.** Відновлення з снапшоту Hostinger (hPanel), не з дампів — вони пропали разом із диском. TTL DNS 300с, переключення A-запису ≈30 хв.

**Сценарій В — втрачено доступ до акаунту Hostinger.** Відновлення немає. Код і конфіги — з GitHub, дані втрачені. Це прийнятий ризик (немає offsite-копії).

---

## Golden rule для nginx

Сервер спільний із сайтом `wisexpert.com.ua`. Перед будь-якою правкою конфігу:
```
nginx -t && systemctl reload nginx   # НІКОЛИ restart
```
Копія конфігу перед правкою: `cp /etc/nginx/sites-enabled/*.conf ~/nginx-backup-$(date +%F)/`

---

## Хто відповідає

Зараз — Сергій (единий доступ). Якщо з'явиться ще хтось із SSH-доступом — дописати сюди.

---
*Востаннє оновлено: 27.08.2026, після першого реального деплою.*
