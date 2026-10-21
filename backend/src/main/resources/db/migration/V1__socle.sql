-- Socle : utilisateurs, projets, membres, canvas, état courant.
-- Plages Flyway : V1-V9 socle (Pouye), V10-V19 génération (Gaye), V20-V29 IA (Ngom).

create table users (
  id           uuid primary key default gen_random_uuid(),
  github_id    bigint unique,                      -- null pour un invité
  login        varchar(64) not null,
  display_name varchar(120),
  avatar_url   text,
  is_guest     boolean not null default false,
  expires_at   timestamptz,                        -- invités : purge planifiée
  created_at   timestamptz not null default now(),
  constraint users_identite check (is_guest or github_id is not null)
);

create table projects (
  id          uuid primary key default gen_random_uuid(),
  name        varchar(80) not null,
  description varchar(500),
  visibility  varchar(10) not null default 'private' check (visibility in ('private', 'public')),
  owner_id    uuid not null references users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table project_members (
  project_id uuid not null references projects (id) on delete cascade,
  user_id    uuid not null references users (id) on delete cascade,
  role       varchar(12) not null check (role in ('OWNER', 'MAINTAINER', 'WRITE', 'TRIAGE', 'READ')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table canvases (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects (id) on delete cascade,
  name          varchar(80) not null,
  seed_snapshot jsonb,                             -- contenu initial, lu par le temps réel au premier chargement
  created_at    timestamptz not null default now()
);

create table canvas_states (
  canvas_id  uuid primary key references canvases (id) on delete cascade,
  state      bytea not null,                       -- état Yjs
  updated_at timestamptz not null default now()
);