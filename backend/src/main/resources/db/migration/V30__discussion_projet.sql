-- Discussion d'un projet : un fil de messages partagé par tous les membres.
-- Plages Flyway : V1-V9 socle, V10-V19 génération, V20-V29 IA, V30-V39 discussion.
--
-- L'auteur peut disparaître (un invité est purgé au bout de 24 h) : le message reste, avec le nom affiché à l'envoi.

create table project_messages (
  id          bigint generated always as identity primary key,
  project_id  uuid not null references projects (id) on delete cascade,
  user_id     uuid references users (id) on delete set null,
  author_name varchar(120) not null,
  body        varchar(2000) not null check (length(btrim(body)) > 0),
  created_at  timestamptz not null default now()
);

-- Lire un fil (derniers messages, ou ceux qui suivent un identifiant) et élaguer les plus anciens.
create index project_messages_project on project_messages (project_id, id);
-- Compter les messages récents d'une personne (limite de débit).
create index project_messages_author_recent on project_messages (user_id, created_at);
