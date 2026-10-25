-- Quota de l'IA : un compteur d'appels par personne et par jour (jour UTC). Rien d'autre n'est gardé :
-- ni le texte saisi, ni la réponse du fournisseur. Les lignes de plus de 30 jours sont purgées chaque jour.
create table ai_usage (
  user_id uuid    not null references users(id) on delete cascade,
  day     date    not null,
  calls   integer not null check (calls >= 0),
  primary key (user_id, day)
);

create index ai_usage_day on ai_usage (day);
