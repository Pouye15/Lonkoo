# Caddy avec sa configuration intégrée.
#
# Un Caddyfile monté depuis le serveur resterait périmé après un déploiement qui remplace le dossier du code (le
# conteneur garde l'ancien fichier). Intégré à l'image, un changement du Caddyfile reconstruit l'image et recrée le
# conteneur : la configuration déployée est toujours celle du commit.
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
# La syntaxe est vérifiée dès la construction (domaine factice : seule la forme du fichier compte).
# Les variables doivent porter les noms que lit le Caddyfile (DOMAINS pour les adresses, DOMAIN pour l'adresse principale) :
# sans elles, l'adresse du site est vide et la validation échoue.
RUN DOMAIN=lonkoo.example.org DOMAINS=lonkoo.example.org caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
