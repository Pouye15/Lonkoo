#!/usr/bin/env bash
# Sauvegarde de la base PostgreSQL de Lonkoo (production) : pg_dump au format « custom » (compressé), vérifié
# avant d'être gardé, avec rotation des anciennes sauvegardes.
#
# Usage (par cron, une fois par jour : voir docs/DEPLOIEMENT.md) :
#   /opt/lonkoo/app/infra/backup.sh
#
# Variables facultatives : APP_DIR (/opt/lonkoo/app), ENV_FILE (/opt/lonkoo/.env), BACKUP_DIR (/opt/lonkoo/backups),
# KEEP_DAYS (14 : les sauvegardes plus anciennes sont supprimées).
#
# Une sauvegarde gardée sur le serveur ne protège pas de la perte du serveur : copiez régulièrement le dossier
# BACKUP_DIR ailleurs (les sauvegardes automatiques du VPS en sont une autre couche). La restauration se teste avec
# infra/restore.sh --test.
set -euo pipefail
umask 077

APP_DIR="${APP_DIR:-/opt/lonkoo/app}"
ENV_FILE="${ENV_FILE:-/opt/lonkoo/.env}"
BACKUP_DIR="${BACKUP_DIR:-/opt/lonkoo/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"

compose() {
  docker compose -f "$APP_DIR/infra/docker-compose.prod.yml" --env-file "$ENV_FILE" "$@"
}

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%d-%H%M%S)"
final="$BACKUP_DIR/lonkoo-$stamp.dump"
partial="$final.partial"
trap 'rm -f "$partial"' EXIT

# Les variables POSTGRES_* sont celles du conteneur : le mot de passe ne passe jamais par la ligne de commande.
# shellcheck disable=SC2016  # les apostrophes sont voulues : $POSTGRES_* se lit dans le conteneur, pas sur l'hôte
compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner' > "$partial"

if [ ! -s "$partial" ]; then
  echo "Sauvegarde vide : abandon." >&2
  exit 1
fi
# L'archive doit se relire et contenir la table des utilisateurs. (Pas de « | grep -q » : avec pipefail, grep qui s'arrête
# dès la première correspondance ferait échouer le tube à tort.)
listing="$(compose exec -T db pg_restore --list < "$partial")"
if ! grep -Eq 'TABLE public users ' <<< "$listing"; then
  echo "Sauvegarde illisible ou incomplète (table users absente) : abandon." >&2
  exit 1
fi

mv "$partial" "$final"
find "$BACKUP_DIR" -maxdepth 1 -name 'lonkoo-*.dump' -mtime +"$KEEP_DAYS" -delete

echo "Sauvegarde : $final ($(du -h "$final" | cut -f1))"
