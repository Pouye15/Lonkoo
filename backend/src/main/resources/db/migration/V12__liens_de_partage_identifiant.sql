-- Lister et révoquer un lien de partage : il lui faut un identifiant qui ne révèle pas le jeton (seule son empreinte est gardée).
-- La valeur par défaut volatile donne un identifiant distinct à chaque lien déjà présent.
alter table share_links add column id uuid not null default gen_random_uuid();
create unique index share_links_identifiant on share_links (id);
