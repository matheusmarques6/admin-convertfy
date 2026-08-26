-- 20261082 — Estruturador em shadow (fase 2 do épico)
--
-- (a) CHECKs de agent aprendem 'estruturador' (email_generation_runs e
--     email_agent_configs — sem isso a run e a config seriam rejeitadas).
-- (b) `email_generation_settings.estruturador_mode`: off | shadow | on.
--     off    = agente nem roda (default — a virada é decisão explícita);
--     shadow = roda, grava a run com o embasamento completo, pipeline segue
--              no outline (mede-se a decisão sem arriscar um email);
--     on     = o output vira a estrutura (consumo chega na fase 3; até lá,
--              'on' se comporta como shadow).
-- (c) Seed da config do agente: prompts VAZIOS de propósito — caem nos
--     DEFAULTs in-code (padrão CM-3), editáveis pela aba Agentes.

alter table email_generation_runs
  drop constraint if exists email_generation_runs_agent_check;
alter table email_generation_runs
  add constraint email_generation_runs_agent_check
  check (agent = any (array[
    'seed','copy','image','html','qa','blueprint','assembler','copy_dispatch',
    'assembler_chooser','campaign_image','refiner','component_test','subject',
    'hero_section','text_format','image_format','color_format',
    'component_tagger','copy_merge','merge_verifier','estruturador'
  ]::text[]));

alter table email_agent_configs
  drop constraint if exists email_agent_configs_agent_type_check;
alter table email_agent_configs
  add constraint email_agent_configs_agent_type_check
  check (agent_type = any (array[
    'copy','image','html','qa','blueprint','assembler','assembler_chooser',
    'campaign_suggestion','campaign_trends','campaign_copy_master',
    'campaign_architect','campaign_image','refiner','component_test','subject',
    'hero_section','text_format','image_format','color_format',
    'component_tagger','merge_verifier','estruturador'
  ]::text[]));

alter table email_generation_settings
  add column if not exists estruturador_mode text not null default 'off'
  check (estruturador_mode in ('off','shadow','on'));

insert into email_agent_configs
  (agent_type, model, system_prompt, user_template, temperature, max_tokens, version, is_active)
select
  'estruturador', 'anthropic/claude-sonnet-4.6', '', '', 0.4, 4096, 1, true
where not exists (
  select 1 from email_agent_configs where agent_type = 'estruturador' and is_active
);
