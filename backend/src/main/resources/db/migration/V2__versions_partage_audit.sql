-- Versions nommées, liens de partage et journal d'audit.

create table canvas_versions (
  id             uuid primary key default gen_random_uuid(),
  canvas_id      uuid not null references canvases (id) on delete cascade,
  name           varchar(80) not null,
  message        varchar(500),
  schema_version int not null default 1,
  snapshot       jsonb not null,                   -- validé par canvas.schema.json
  author_id      uuid references users (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index canvas_versions_par_canvas on canvas_versions (canvas_id, created_at desc);

create table share_links (
  token_hash char(64) primary key,                 -- SHA-256 du jeton, jamais le jeton
  canvas_id  uuid not null references canvases (id) on delete cascade,
  role       varchar(12) not null check (role in ('WRITE', 'READ')),
  expires_at timestamptz not null,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table audit_log (
  id       bigint generated always as identity primary key,
  at       timestamptz not null default now(),
  actor_id uuid,                                   -- pas de clé étrangère : le journal survit à la purge des invités
  action   varchar(40) not null,
  target   varchar(80),
  detail   jsonb                                   -- jamais de jeton ni de contenu sensible
);