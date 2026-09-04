-- 20261114 — Objeções: Catalogador (macro) + Seletor (micro)
--
-- Plano: docs/email-generation/plano-objecoes-macro-micro.md. A objeção
-- existia em `client_stores.icp_objections` (35 lojas) e nenhum agente a
-- lia. Dois agentes novos:
--
--   catalogador — 1× por pesquisa. Produz o catálogo de argumento da loja
--     (objeções tipadas por risco/aliviador com lastro, veículos de
--     argumento, medos de categoria, incentivo) em
--     `client_stores.objection_catalog`. `icp_objections` vira PROJEÇÃO
--     ([{objection, treatment}]) para a UI, o n8n e o PATCH continuarem
--     funcionando sem mudar.
--   seletor — por email, a cada geração, ANTES do Estruturador. Decide o
--     alvo do toque (qual objeção, aliviador, profundidade; ou nenhuma nos
--     modos sem objeção) em `store_email_objection_targets`.
--
-- Uma migration só para as fases 1–3 do plano. Tudo aditivo; comportamento
-- vivo intocado até `seletor_mode` sair de 'off'.

-- ── 1. Catálogo da loja (coluna, decisão do owner) ──────────────────────
alter table client_stores
  add column if not exists objection_catalog jsonb,
  add column if not exists objection_catalog_source text
    check (objection_catalog_source in ('catalogador_v2','manual','legacy_import')),
  add column if not exists objection_catalog_updated_at timestamptz;

comment on column client_stores.objection_catalog is
  'Catálogo de argumento (Catalogador v2): {objecoes[], veiculos_de_argumento, medos_de_categoria, concorrente_nomeavel, incentivo, cobertura, descartadas}. icp_objections é a projeção [{objection,treatment}].';

-- ── 2. Alvo por loja × flow × email (saída do Seletor) ──────────────────
create table if not exists store_email_objection_targets (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references client_stores(id) on delete cascade,
  flow_type text not null,
  email_number int not null,
  -- sha8 do catálogo que gerou o alvo: catálogo mudou → alvo precisa ser refeito.
  catalog_sha8 text,
  -- schema §3.2 da spec: modo, alvos[], medos_alvo, promessa_a_pagar,
  -- angulo_do_tratamento, ja_atacadas, proibido_neste_toque, lacuna…
  target jsonb not null,
  -- true só quando `seletor_mode='on'` no momento da seleção (shadow grava
  -- false: existe, mede-se, ninguém consome).
  consumido boolean not null default false,
  run_id uuid,
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_seot_current
  on store_email_objection_targets (store_id, flow_type, email_number)
  where is_current;
create index if not exists idx_seot_store_flow
  on store_email_objection_targets (store_id, flow_type, email_number, created_at desc);

-- RLS habilitado SEM policies — acesso só pelo service role (mesma regra das
-- tabelas do vault, 20261081): a anon/authenticated key não lê via /rest/v1.
alter table store_email_objection_targets enable row level security;

-- ── 3. Alavanca do rollout do Seletor ───────────────────────────────────
alter table email_generation_settings
  add column if not exists seletor_mode text not null default 'off'
  check (seletor_mode in ('off','shadow','on'));

-- ── 4. CHECKs de agente (padrão 20261110: acha por conteúdo, dropa, recria) ─
-- Sem isto a run é DESCARTADA em silêncio (23514 engolido pelo
-- logGenerationRun) — precedentes copy_fit (20261096) e typography (20261110).
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
    FROM pg_constraint
   WHERE conrelid = 'email_generation_runs'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%agent%'
     AND pg_get_constraintdef(oid) ILIKE '%hero_section%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE email_generation_runs DROP CONSTRAINT %I', cname);
  END IF;
  ALTER TABLE email_generation_runs ADD CONSTRAINT email_generation_runs_agent_check
    CHECK (agent IN (
      'seed','copy','image','html','qa','blueprint','assembler','copy_dispatch',
      'assembler_chooser','campaign_image','refiner','component_test','subject',
      'hero_section','text_format','image_format','color_format','typography',
      'component_tagger','copy_merge','merge_verifier','estruturador','copy_fit',
      'background_fit',
      -- objeções (set/2026)
      'catalogador','seletor'
    ));
END $$;

DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
    FROM pg_constraint
   WHERE conrelid = 'email_agent_configs'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%agent_type%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE email_agent_configs DROP CONSTRAINT %I', cname);
  END IF;
  ALTER TABLE email_agent_configs ADD CONSTRAINT email_agent_configs_agent_type_check
    CHECK (agent_type IN (
      'copy','image','html','qa','blueprint','assembler','assembler_chooser',
      'campaign_suggestion','campaign_trends','campaign_copy_master',
      'campaign_architect','campaign_image','refiner','component_test','subject',
      'hero_section','text_format','image_format','color_format','typography',
      'component_tagger','merge_verifier','estruturador','copy_fit',
      'catalogador','seletor'
    ));
END $$;

-- ── 5. Configs dos dois agentes (prompts vazios → defaults in-code) ─────
insert into email_agent_configs
  (agent_type, model, system_prompt, user_template, temperature, max_tokens, version, is_active)
select 'catalogador', 'anthropic/claude-sonnet-4.6', '', '', 0.3, 8192, 1, true
where not exists (select 1 from email_agent_configs where agent_type = 'catalogador' and is_active);

insert into email_agent_configs
  (agent_type, model, system_prompt, user_template, temperature, max_tokens, version, is_active)
select 'seletor', 'anthropic/claude-sonnet-4.6', '', '', 0.2, 4096, 1, true
where not exists (select 1 from email_agent_configs where agent_type = 'seletor' and is_active);

-- Confere.
select
  (select pg_get_constraintdef(oid) like '%seletor%' from pg_constraint where conname = 'email_generation_runs_agent_check') as runs_aceita_seletor,
  (select pg_get_constraintdef(oid) like '%catalogador%' from pg_constraint where conname = 'email_agent_configs_agent_type_check') as configs_aceita_catalogador,
  (select count(*) from email_agent_configs where agent_type in ('catalogador','seletor') and is_active) as configs_ativas,
  (select seletor_mode from email_generation_settings limit 1) as seletor_mode;
