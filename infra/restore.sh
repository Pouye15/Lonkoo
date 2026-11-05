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
#       puis relancés). Tout ce qui a été écrit après la sauvegarde est perdu. Une copie de sécurité de la base actuelle est
#       prise AVANT d'y toucher (dans BACKUP_DIR, comme une sauvegarde ordinaire) : si elle échoue, la base n'est pas touchée ;
#       si la restauration échoue ou n'est pas la bonne, le script donne la commande pour revenir à l'état d'avant.
#       Base actuelle cassée ou vide (elle ne se sauvegarde pas) : ajouter SANS_COPIE=oui pour restaurer quand même.
#
# Variables facultatives : APP_DIR (/opt/lonkoo/app), ENV_FILE (/opt/lonkoo/.env), BACKUP_DIR (/opt/lonkoo/backups).
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/lonkoo/app}"
ENV_FILE="${ENV_FILE:-/opt/lonkoo/.env}"
BACKUP_DIR="${BACKUP_DIR:-/opt/lonkoo/backups}"
# Exportées : le script de sauvegarde lancé pour la copie de sécurité les lit dans son environnement.
export APP_DIR ENV_FILE BACKUP_DIR
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
    # Copie de sécurité de la base actuelle, prise une fois le backend arrêté (plus aucune écriture) et AVANT d'y toucher.
    echo "Copie de sécurité de la base actuelle avant de la remplacer…"
    safety=""
    if bash "$APP_DIR/infra/backup.sh"; then
      safety="$(find "$BACKUP_DIR" -maxdepth 1 -name 'lonkoo-*.dump' -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)"
    elif [ "${SANS_COPIE:-}" = "oui" ]; then
      # Cas d'une base déjà cassée ou vide : elle ne se sauvegarde pas (backup.sh refuse), et c'est justement quand on restaure.
      echo "Copie de sécurité impossible, restauration demandée quand même (SANS_COPIE=oui) : la base actuelle sera perdue." >&2
    else
      echo "Copie de sécurité impossible : la base de production n'a PAS été touchée. Redémarrage du backend et du temps réel…" >&2
      echo "Si la base actuelle est inutilisable et que vous voulez restaurer quand même : CONFIRM=oui SANS_COPIE=oui $0 --live $file" >&2
      compose start backend realtime
      exit 1
    fi
    # Dès ici, un échec laisse le backend et le temps réel ARRÊTÉS (jamais lancés sur une base incomplète) et dit comment revenir.
    # (Un « trap ERR » ne verrait pas les échecs survenus dans les fonctions ci-dessus : chaque étape est donc traitée ici.)
    revenir() {
      echo "La restauration a échoué : le backend et le temps réel restent ARRÊTÉS." >&2
      if [ -n "$safety" ]; then
        # SANS_COPIE : la base est maintenant incomplète, elle ne se sauvegarderait plus (et la copie qu'on restaure est celle d'avant).
        echo "Pour revenir à l'état d'avant : CONFIRM=oui SANS_COPIE=oui $0 --live $safety" >&2
      fi
      exit 1
    }
    # shellcheck disable=SC2016  # idem : $POSTGRES_DB se lit dans le conteneur
    database="$(compose exec -T db sh -c 'printf %s "$POSTGRES_DB"')" || revenir
    psql_in postgres "drop database if exists \"$database\" with (force)" >/dev/null || revenir
    psql_in postgres "create database \"$database\"" >/dev/null || revenir
    restore_into "$database" || revenir
    echo "Redémarrage du backend et du temps réel…"
    compose start backend realtime
    echo "Base de production restaurée depuis $file."
    if [ -n "$safety" ]; then
      echo "Copie de sécurité de l'état précédent : $safety"
    fi
    ;;
  *)
    usage
    ;;
esac
