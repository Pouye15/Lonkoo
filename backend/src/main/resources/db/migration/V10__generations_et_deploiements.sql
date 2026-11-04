-- Génération de projets, envoi sur GitHub et déploiements (lot R8).

create table generations (
  id             uuid primary key default gen_random_uuid(),
  canvas_id      uuid not null references canvases (id) on delete cascade,
  version_id     uuid references canvas_versions (id) on delete set null,
  requested_by   uuid references users (id) on delete set null,
  target         varchar(20) not null check (target in ('spring-boot')),
  status         varchar(10) not null check (status in ('PENDING', 'RUNNING', 'DONE', 'FAILED')),
  project_name   varchar(80) not null,
  slug           varchar(40),
  snapshot       jsonb not null,                   -- instantané figé au lancement, validé par le contrat
  files          jsonb,                            -- {chemin: contenu}, rempli quand la génération est terminée
  file_count     int,
  total_bytes    bigint,
  warnings       jsonb not null default '[]',
  error          varchar(500),
  created_at     timestamptz not null default now(),
  finished_at    timestamptz,
  -- envoi sur GitHub (jamais de jeton ici : il ne quitte pas la session de l'utilisateur)
  push_status    varchar(10) check (push_status in ('RUNNING', 'DONE', 'FAILED')),
  repo_full_name varchar(140),
  repo_url       varchar(300),
  commit_sha     varchar(40),
  workflow_sent  boolean not null default false,   -- le fichier de workflow a-t-il pu être envoyé ?
  push_warnings  jsonb not null default '[]',
  push_error     varchar(500),
  pushed_at      timestamptz
);
create index generations_par_canvas on generations (canvas_id, created_at desc);

create table deployments (
  id             uuid primary key default gen_random_uuid(),
  generation_id  uuid not null references generations (id) on delete cascade,
  requested_by   uuid references users (id) on delete set null,
  method         varchar(10) not null check (method in ('WORKFLOW', 'MANUAL')),
  status         varchar(10) not null check (status in ('PENDING', 'RUNNING', 'DEPLOYED', 'FAILED', 'MANUAL')),
  public_url     varchar(200),
  run_id         bigint,
  run_url        varchar(300),
  detail         varchar(500),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index deployments_par_generation on deployments (generation_id, created_at desc);
