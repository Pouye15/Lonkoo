#!/usr/bin/env bash
# Restauration d'une sauvegarde de la base PostgreSQL de Lonkoo (production).
#
#   infra/restore.sh --test FICHIER
#       Restaure dans une base temporaire, vérifie qu'elle contient des données et que l'historique des migrations est
#       là, puis la supprime. NE TOUCHE PAS à la production : à faire régulièrement, c'est la preuve que la
#       sauvegarde sert.
#
#   CONFIRM=oui infra/restore.sh --live FICHIER
#       REMPLACE la base de production par la sauvegarde (le backend et le temps réel sont arrêtés pendant l'opération
#       puis relancés). Tout ce qui a été écrit après la sauvegarde est perdu.
#
# Variables facultatives : APP_DIR (/opt/lonkoo/app), ENV_FILE (/opt/lonkoo/.env).
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/lonkoo/app}"
ENV_FILE="${ENV_FILE:-/opt/lonkoo/.env}"
SCRATCH="lonkoo_restore_test"

usage() {
  echo "Usage : infra/restore.sh --test FICHIER | CONFIRM=oui infra/restore.sh --live FICHIER" >&2
  exit 2
}

[ "$#" -eq 2 ] || usage
mode="$1"
file="$2"
[ -f "$file" ] || { echo "Fichier introuvable : $file" >&2; exit 2; }

compose() {
  docker compose -f "$APP_DIR/infra/docker-compose.prod.yml" --env-file "$ENV_FILE" "$@"
}

# psql_in BASE REQUÊTE : une valeur par ligne, sans décor. Les arguments passent sans interprétation par le shell.
psql_in() {
  # shellcheck disable=SC2016  # les apostrophes sont voulues : $POSTGRES_USER, $1 et $2 se lisent dans le conteneur
  compose exec -T db sh -c 'PGOPTIONS="-c client_min_messages=warning" psql -U "$POSTGRES_USER" -d "$1" -tA -v ON_ERROR_STOP=1 -c "$2"' sh "$1" "$2"
}

restore_into() { # BASE
  # shellcheck disable=SC2016  # idem : $POSTGRES_USER et $1 se lisent dans le conteneur
  compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$1" --no-owner --exit-on-error' sh "$1" < "$file"
}

case "$mode" in
  --test)
    trap 'psql_in postgres "drop database if exists $SCRATCH with (force)" >/dev/null 2>&1 || true' EXIT
    psql_in postgres "drop database if exists $SCRATCH with (force)" >/dev/null
    psql_in postgres "create database $SCRATCH" >/dev/null
    restore_into "$SCRATCH"
    users="$(psql_in "$SCRATCH" 'select count(*) from users')"
    projects="$(psql_in "$SCRATCH" 'select count(*) from projects')"
    migration="$(psql_in "$SCRATCH" 'select coalesce(max(version::int), 0) from flyway_schema_history where success')"
    if [ "$migration" -lt 1 ]; then
      echo "Restauration incomplète : aucune migration dans l'historique." >&2
      exit 1
    fi
    echo "Restauration vérifiée dans une base temporaire (supprimée ensuite) : $users utilisateurs, $projects projets, migration $migration."
    ;;
  --live)
    if [ "${CONFIRM:-}" != "oui" ]; then
      echo "Cette opération REMPLACE la base de production par $file." >&2
      echo "Tout ce qui a été écrit après la sauvegarde sera perdu. Pour continuer : CONFIRM=oui $0 --live $file" >&2
      exit 1
    fi
    echo "Arrêt du backend et du temps réel…"
    compose stop backend realtime
    # shellcheck disable=SC2016  # idem : $POSTGRES_DB se lit dans le conteneur
    database="$(compose exec -T db sh -c 'printf %s "$POSTGRES_DB"')"
    psql_in postgres "drop database if exists \"$database\" with (force)" >/dev/null
    psql_in postgres "create database \"$database\"" >/dev/null
    restore_into "$database"
    echo "Redémarrage du backend et du temps réel…"
    compose start backend realtime
    echo "Base de production restaurée depuis $file."
    ;;
  *)
    usage
    ;;
esac
