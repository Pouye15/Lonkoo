-- Compteur séparé pour le dialogue avec le copilote (chatbot) : un échange de dix messages ne doit pas épuiser
-- le quota des esquisses. Même ligne par personne et par jour (jour UTC), rien de plus n'est gardé : ni les
-- messages, ni les réponses. Le plafond de tout le service compte la somme calls + chat_calls.
alter table ai_usage
  add column chat_calls integer not null default 0 check (chat_calls >= 0);
