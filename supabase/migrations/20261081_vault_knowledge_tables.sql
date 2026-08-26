-- 20261081 — Tabelas do conhecimento do vault (Estruturador, fase 1: a ponte)
--
-- O vault Obsidian (git) é a autoria; o runtime lê EXCLUSIVAMENTE estas
-- tabelas, populadas pelo sync (webhook de push + cron). ADR:
-- docs/architecture/adr-estruturador-adaptativo.md.
--
-- RLS: habilitado SEM policies — acesso só pelo service role (as rotas usam
-- createAdminClient). Regra do incidente ago/2026: nada de TO PUBLIC; aqui
-- nem authenticated lê direto, a UI passa pela API.

-- ── Conteúdo ────────────────────────────────────────────────────────────

create table if not exists email_intents (
  id uuid primary key default gen_random_uuid(),
  flow_type text not null,
  -- 'intencao' (por email ou _flow) | 'progressao'
  kind text not null check (kind in ('intencao','progressao')),
  -- null para _flow e _progressao
  email_number int,
  slug text not null,
  status text not null default 'pendente',
  is_active boolean not null default false,
  frontmatter jsonb not null default '{}'::jsonb,
  body_md text not null,
  file_path text not null,
  synced_commit_sha text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (flow_type, slug)
);

create table if not exists email_structure_refs (
  id uuid primary key default gen_random_uuid(),
  flow_type text not null,
  slug text not null,
  emails int[] not null default '{}',
  escopo text,
  loja text,
  amostra text,
  procedencia text,
  -- sequência ORIGINAL do frontmatter (o vault descreve o email completo)
  secoes text[] not null default '{}',
  -- sequência SERVÍVEL (pós-absorção header/cta) + endereços dos papéis
  secoes_normalizadas text[] not null default '{}',
  absorcoes jsonb not null default '[]'::jsonb,
  status text not null default 'pendente',
  is_active boolean not null default false,
  frontmatter jsonb not null default '{}'::jsonb,
  body_md text not null,
  performance jsonb,
  file_path text not null,
  synced_commit_sha text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (flow_type, slug)
);

create table if not exists email_learnings (
  id uuid primary key default gen_random_uuid(),
  -- null = _global (cross-flow); aplica_a diz onde vale
  flow_type text,
  slug text not null,
  aplica_a text[] not null default '{}',
  origem_estrutura text,
  autor text,
  status text not null default 'pendente',
  is_active boolean not null default false,
  frontmatter jsonb not null default '{}'::jsonb,
  body_md text not null,
  file_path text not null,
  synced_commit_sha text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- UNIQUE com flow_type nullable (o _global usa sentinela).
create unique index if not exists uq_email_learnings_flow_slug
  on email_learnings (coalesce(flow_type, '_global'), slug);

-- ── Estado e telemetria do sync ─────────────────────────────────────────

create table if not exists vault_sync_state (
  id text primary key default 'default',
  repo text,
  branch text,
  last_commit_sha text,
  last_synced_at timestamptz
);

create table if not exists vault_sync_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null check (trigger in ('webhook','cron','manual')),
  commit_sha text,
  files_total int not null default 0,
  upserted int not null default 0,
  deactivated int not null default 0,
  skipped_invalid jsonb not null default '[]'::jsonb,
  duration_ms int not null default 0,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_vault_sync_runs_recent
  on vault_sync_runs (created_at desc);

-- Índices de leitura do runtime (uma query por flow na geração).
create index if not exists idx_email_intents_flow_active
  on email_intents (flow_type) where is_active;
create index if not exists idx_email_structure_refs_flow_active
  on email_structure_refs (flow_type) where is_active;
create index if not exists idx_email_learnings_active
  on email_learnings (flow_type) where is_active;

-- ── RLS: service role only ──────────────────────────────────────────────
alter table email_intents enable row level security;
alter table email_structure_refs enable row level security;
alter table email_learnings enable row level security;
alter table vault_sync_state enable row level security;
alter table vault_sync_runs enable row level security;
