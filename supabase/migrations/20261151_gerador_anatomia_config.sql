-- Trilha B4 (set/2026) — Gerador de Anatomias (offline).
--
-- O agente `gerador_anatomia` escreve uma variante NOVA da biblioteca a
-- partir de dispositivo + requisitos + 1–2 referências, já com tokens de
-- identidade (B5) e validada pelo lint de envio (B2) antes de existir. A
-- variante nasce `is_active = false`, `source = 'gerada'`: quem ativa é a
-- curadoria, pela aba Componentes.
--
-- O CHECK de `email_generation_runs.agent` já aceita `gerador_anatomia`
-- desde a 20261147; falta o de `email_agent_configs.agent_type` e a config
-- ativa (prompts vazios → defaults in-code, como catalogador/seletor).

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
      'catalogador','seletor',
      -- Trilha B4
      'gerador_anatomia'
    ));
END $$;

INSERT INTO email_agent_configs
  (agent_type, model, system_prompt, user_template, temperature, max_tokens, version, is_active)
SELECT 'gerador_anatomia', 'anthropic/claude-sonnet-4.6', '', '', 0.4, 12000, 1, true
WHERE NOT EXISTS (SELECT 1 FROM email_agent_configs WHERE agent_type = 'gerador_anatomia' AND is_active);

-- Confere.
SELECT
  (SELECT pg_get_constraintdef(oid) LIKE '%gerador_anatomia%' FROM pg_constraint WHERE conname = 'email_agent_configs_agent_type_check') AS configs_aceita_gerador,
  (SELECT count(*) FROM email_agent_configs WHERE agent_type = 'gerador_anatomia' AND is_active) AS config_ativa;
