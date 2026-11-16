#!/usr/bin/env bash
# Backup diário do Universo Folks na VPS: banco (pg_dump) + arquivos enviados (volume storage).
# Só lê dados; nunca apaga nada além dos próprios backups mais antigos que BACKUP_KEEP_DAYS.
#
# Uso (na raiz do repositório):  bash deploy/scripts/backup.sh
# Cron diário às 3h:             0 3 * * * cd /opt/universo-folks && bash deploy/scripts/backup.sh >> /var/log/folks-backup.log 2>&1
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VARS="${ENV_FILE:-$ROOT/deploy/.env}"
COMPOSE=(docker compose -f "$ROOT/deploy/docker-compose.yml" --env-file "$VARS")

# lê só as variáveis de backup e banco (sem executar o arquivo)
val() { grep -E "^$1=" "$VARS" 2>/dev/null | tail -1 | cut -d= -f2- || true; }
PGUSER="$(val POSTGRES_USER)"; PGUSER="${PGUSER:-folks}"
PGDB="$(val POSTGRES_DB)"; PGDB="${PGDB:-universo_folks}"
KEEP="$(val BACKUP_KEEP_DAYS)"; KEEP="${KEEP:-14}"
REMOTE="$(val BACKUP_RCLONE_REMOTE)"

DEST="${BACKUP_DIR:-$ROOT/backups}"
STAMP="$(date +%Y%m%d-%H%M)"
mkdir -p "$DEST"
# se algo falhar no meio, não deixa arquivo pela metade parecendo backup
trap 'rm -f "$DEST"/*-"$STAMP".*.partial' EXIT

echo "[$(date -Is)] backup do banco $PGDB"
"${COMPOSE[@]}" exec -T postgres pg_dump -U "$PGUSER" -d "$PGDB" -Fc > "$DEST/db-$STAMP.dump.partial"
mv "$DEST/db-$STAMP.dump.partial" "$DEST/db-$STAMP.dump"

echo "[$(date -Is)] backup dos arquivos (storage)"
"${COMPOSE[@]}" exec -T api tar -C /app/backend/storage -czf - . > "$DEST/storage-$STAMP.tar.gz.partial"
mv "$DEST/storage-$STAMP.tar.gz.partial" "$DEST/storage-$STAMP.tar.gz"

if [ -n "$REMOTE" ]; then
  echo "[$(date -Is)] enviando para $REMOTE"
  rclone copy "$DEST/db-$STAMP.dump" "$REMOTE/"
  rclone copy "$DEST/storage-$STAMP.tar.gz" "$REMOTE/"
fi

find "$DEST" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'storage-*.tar.gz' \) -mtime +"$KEEP" -print -delete
echo "[$(date -Is)] ok: $DEST/db-$STAMP.dump e $DEST/storage-$STAMP.tar.gz"
