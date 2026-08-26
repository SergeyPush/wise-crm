#!/usr/bin/env bash
# Добирает список слабых паролей до полных 10 000 (NFR-14).
# Запускается разово, результат коммитится: в рантайме приложение в сеть не ходит.
set -euo pipefail

DEST="$(dirname "$0")/../apps/api/src/modules/auth/data/weak-passwords.txt"
SRC="https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/10k-most-common.txt"
TMP="$(mktemp)"

echo "Завантаження $SRC"
curl -fsSL "$SRC" -o "$TMP"

# Заголовок с пояснением остаётся, дубликаты убираются
{
  sed -n '/^#/p' "$DEST"
  { sed -n '/^[^#]/p' "$DEST"; cat "$TMP"; } | tr '[:upper:]' '[:lower:]' | sort -u
} > "$DEST.new"

mv "$DEST.new" "$DEST"
echo "Готово: $(grep -vc '^#' "$DEST") паролів у $DEST"
