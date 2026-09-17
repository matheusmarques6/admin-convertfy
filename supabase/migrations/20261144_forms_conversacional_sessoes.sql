-- 20261144 — Formulários conversacionais: versões, sessões e eventos de sessão.
--
-- APLICADA EM PRODUÇÃO em 17/09/2026 via MCP. Este arquivo é o registro
-- fiel do que rodou (a migration deste repo é aplicada à mão e escorrega;
-- sem o arquivo, o próximo ambiente nasce sem o substrato).
--
-- Tudo ADITIVO: nenhuma coluna existente muda de tipo, nenhum default
-- existente é reescrito, e `display_mode` nasce 'classic' em TODO
-- formulário — a "Pagina de vendas" (/forms/pagina-de-vendas, 56 envios)
-- continua byte a byte o que era.
--
-- Três tabelas, três papéis distintos:
--
--   form_versions       — o schema PUBLICADO, imutável. A sessão aponta
--                         para a versão que ela viu: editar o formulário
--                         no meio da campanha não pode reescrever o
--                         passado de quem já respondeu.
--   form_sessions       — uma linha por visitante por passagem. É onde
--                         mora "até onde a pessoa foi" — a pergunta que
--                         o módulo inteiro existe para responder.
--   form_session_events — append-only. A sessão guarda o ESTADO; os
--                         eventos guardam o CAMINHO (viu, focou,
--                         respondeu, voltou, errou a validação).
--
-- Idempotência do abandono: `abandon_processed_at` é o carimbo, e o
-- índice parcial `idx_form_sessions_abandono` é a fila. Sem o carimbo o
-- cron mandaria o mesmo abandono ao CRM a cada rodada; sem o índice
-- parcial ele varreria a tabela inteira para achar as poucas pendentes.

-- ───────────────────────── crm_forms: colunas novas ─────────────────────

alter table public.crm_forms
  add column if not exists display_mode text not null default 'classic',
  add column if not exists draft_schema jsonb,
  add column if not exists published_version_id uuid,
  add column if not exists has_unpublished_changes boolean not null default false,
  add column if not exists locale text not null default 'pt-BR',
  add column if not exists settings jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crm_forms_display_mode_check'
  ) then
    alter table public.crm_forms
      add constraint crm_forms_display_mode_check
      check (display_mode in ('classic', 'conversational'));
  end if;
end $$;

comment on column public.crm_forms.display_mode is
  'classic = formulário de página única (comportamento histórico); conversational = uma pergunta por vez.';
comment on column public.crm_forms.draft_schema is
  'Rascunho editável. O que o público vê é form_versions.schema da published_version_id — editar não publica.';

-- ───────────────────────────── form_versions ────────────────────────────

create table if not exists public.form_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  form_id uuid not null references public.crm_forms(id) on delete cascade,
  version integer not null,
  schema jsonb not null,
  published_by uuid,
  published_at timestamptz not null default now(),
  unique (form_id, version)
);

create index if not exists idx_form_versions_form
  on public.form_versions (form_id, version desc);

-- ───────────────────────────── form_sessions ────────────────────────────

create table if not exists public.form_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  form_id uuid not null references public.crm_forms(id) on delete cascade,
  form_version_id uuid references public.form_versions(id) on delete set null,

  -- quem
  visitor_id text,
  lead_id uuid,
  deal_id uuid,
  submission_id uuid,

  -- onde parou
  status text not null default 'viewed'
    check (status in ('viewed','started','in_progress','contact_captured',
                      'abandoned','completed','disqualified')),
  current_field_ref text,
  last_answered_field_ref text,
  furthest_step_index integer not null default 0,
  total_steps_estimate integer,
  abandoned_field_ref text,
  time_on_last_step_ms integer,

  -- o que respondeu
  answers jsonb not null default '{}'::jsonb,
  variables jsonb not null default '{}'::jsonb,
  hidden jsonb not null default '{}'::jsonb,
  ending_ref text,

  -- de onde veio
  utm_source text, utm_medium text, utm_campaign text,
  utm_term text, utm_content text,
  gclid text, fbclid text, fbp text, fbc text,
  referrer text, landing_url text,
  device text, browser text, os text, country text,

  -- quando
  viewed_at timestamptz not null default now(),
  started_at timestamptz,
  contact_captured_at timestamptz,
  last_activity_at timestamptz not null default now(),
  abandoned_at timestamptz,
  abandon_processed_at timestamptz,
  completed_at timestamptz,
  recovered boolean not null default false,

  -- consentimento e retomada
  consent_at timestamptz,
  consent_text_version text,
  resume_token_hash text,
  resume_expires_at timestamptz,

  ab_variant text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_form_sessions_fila
  on public.form_sessions (form_id, status, last_activity_at);

create index if not exists idx_form_sessions_visitor
  on public.form_sessions (form_id, visitor_id) where visitor_id is not null;

create index if not exists idx_form_sessions_lead
  on public.form_sessions (lead_id) where lead_id is not null;

create index if not exists idx_form_sessions_resume
  on public.form_sessions (resume_token_hash) where resume_token_hash is not null;

-- A fila do cron de abandono: só o que ainda não foi processado e não
-- completou. Predicado LITERAL — índice parcial não serve query
-- parametrizada (o plano genérico do PostgREST não prova a inclusão).
create index if not exists idx_form_sessions_abandono
  on public.form_sessions (last_activity_at)
  where abandon_processed_at is null and completed_at is null;

comment on column public.form_sessions.resume_token_hash is
  'SHA-256 do token de retomada. O token em claro só existe no link enviado ao lead.';
comment on column public.form_sessions.abandon_processed_at is
  'Carimbo de idempotência: o cron de abandono já mandou esta sessão ao CRM.';

-- `clock_timestamp()`, não `now()`: `now()` é o início da TRANSAÇÃO e não
-- anda dentro dela — o autosave grava várias vezes e precisa que o carimbo
-- avance de verdade.
create or replace function public.form_sessions_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists trg_form_sessions_touch on public.form_sessions;
create trigger trg_form_sessions_touch
  before update on public.form_sessions
  for each row execute function public.form_sessions_touch();

-- ─────────────────────────── form_session_events ────────────────────────

create table if not exists public.form_session_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  form_id uuid not null references public.crm_forms(id) on delete cascade,
  session_id uuid not null references public.form_sessions(id) on delete cascade,
  type text not null,
  field_ref text,
  step_index integer,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  client_ts timestamptz,
  event_key text
);

create index if not exists idx_fse_sessao
  on public.form_session_events (session_id, occurred_at);

create index if not exists idx_fse_form_tipo
  on public.form_session_events (form_id, type, occurred_at desc);

-- Dedupe do batch: o cliente reenvia o lote quando a rede cai, e o mesmo
-- evento não pode virar duas linhas. Parcial porque evento sem chave
-- (telemetria solta) não deduplica.
create unique index if not exists uq_form_session_events_key
  on public.form_session_events (session_id, event_key) where event_key is not null;

-- ───────────────────────────────── RLS ──────────────────────────────────
-- `TO authenticated` + escopo por org. A tabela nasce fechada em vez de
-- nascer com o débito das irmãs do CRM (round 5A/5B). O público escreve
-- por rota pública com service role, que bypassa RLS.

alter table public.form_versions enable row level security;
alter table public.form_sessions enable row level security;
alter table public.form_session_events enable row level security;

drop policy if exists form_versions_member on public.form_versions;
create policy form_versions_member on public.form_versions
  for all to authenticated using (is_org_member()) with check (is_org_member());

drop policy if exists form_sessions_member on public.form_sessions;
create policy form_sessions_member on public.form_sessions
  for all to authenticated using (is_org_member()) with check (is_org_member());

drop policy if exists form_session_events_member on public.form_session_events;
create policy form_session_events_member on public.form_session_events
  for all to authenticated using (is_org_member()) with check (is_org_member());

-- ──────────────────────── backfill: v1 de cada form ─────────────────────
-- Todo formulário existente ganha uma versão 1 com os campos que ele tem
-- hoje, e passa a apontar para ela. Sem isso, a sessão de um form antigo
-- nasceria sem versão e o histórico ficaria sem referência de schema.

insert into public.form_versions (org_id, form_id, version, schema)
select
  f.org_id,
  f.id,
  1,
  jsonb_build_object(
    'version', 1,
    'display_mode', 'classic',
    'locale', coalesce(f.locale, 'pt-BR'),
    'fields', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'ref', c.id::text,
            'field_id', c.id,
            'type', c.field_type,
            'label', c.label,
            'placeholder', c.placeholder,
            'description', c.description,
            'required', c.required,
            'position', c.position,
            'options', c.options,
            'validation', c.validation,
            'map_to_lead_field', c.map_to_lead_field
          ) order by c.position
        )
        from public.crm_form_fields c
        where c.form_id = f.id
      ),
      '[]'::jsonb
    )
  )
from public.crm_forms f
where not exists (
  select 1 from public.form_versions v where v.form_id = f.id and v.version = 1
);

update public.crm_forms f
set published_version_id = v.id
from public.form_versions v
where v.form_id = f.id and v.version = 1 and f.published_version_id is null;
