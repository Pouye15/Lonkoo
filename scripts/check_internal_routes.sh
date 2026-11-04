#!/usr/bin/env bash
# Vérifie qu'aucune route interne (réservée au backend et au serveur temps réel) n'est joignable depuis l'extérieur.
#
# Usage : bash scripts/check_internal_routes.sh BASE_URL [OPTIONS_CURL...]
#   ex. : bash scripts/check_internal_routes.sh https://lonkoo.example.org
#         bash scripts/check_internal_routes.sh https://lonkoo.internal -k --resolve lonkoo.internal:443:127.0.0.1
#
# Lancé par la CI (job « pile-production ») et par le workflow de déploiement.
#
# Pourquoi on exige « 404 ET aucun octet » et pas seulement « 404 » : l'interface répond aussi 404 à une adresse
# inconnue. Le refus de Caddy ne s'exécutait pas (voir infra/Caddyfile) et les routes internes passaient à l'interface,
# qui répondait 404 : le contrôle « 404 » était vert pour la mauvaise raison. Le refus de Caddy a un corps vide ; la page 404
# de l'interface, et toute réponse du backend ou du serveur temps réel (401, JSON…), ont un corps.
#
# Les chemins sous /ws autres que la poignée de main et /ws/health sont refusés eux aussi : une fois le préfixe /ws retiré,
# ils arriveraient aux routes /internal du serveur temps réel.
set -euo pipefail

base="${1:?Usage : check_internal_routes.sh BASE_URL [OPTIONS_CURL...]}"
shift
id="00000000-0000-0000-0000-000000000000"

paths=(
  "/internal/canvases/$id/snapshot"
  "/internal/canvases/$id/state"
  "/ws/internal/canvases/$id/snapshot"
  "/ws/internal/canvases/$id/restore"
  "/ws/internal/canvases/$id/close"
  "/WS/internal/canvases/$id/snapshot"
  "/ws/%69nternal/canvases/$id/snapshot"
  "/ws/../internal/canvases/$id/snapshot"
  "/ws/anything"
)

failures=0
for method in GET POST; do
  for path in "${paths[@]}"; do
    # « || true » : un échec de curl (réseau) est signalé plus bas comme un résultat inattendu, pas comme une fin brutale.
    result="$(curl -s --path-as-is -m 10 -X "$method" -o /dev/null -w '%{http_code} %{size_download}' "$@" "$base$path" || true)"
    if [ "$result" != "404 0" ]; then
      echo "ROUTE INTERNE JOIGNABLE : $method $path -> $result (attendu : 404 sans corps, refusé par Caddy)" >&2
      failures=$((failures + 1))
    fi
  done
done

if [ "$failures" -gt 0 ]; then
  echo "$failures route(s) interne(s) joignable(s) depuis l'extérieur." >&2
  exit 1
fi
echo "Aucune route interne joignable depuis l'extérieur (${#paths[@]} chemins, GET et POST)."
