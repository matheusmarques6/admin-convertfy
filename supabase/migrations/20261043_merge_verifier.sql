-- ============================================================
-- Verificador de merge (7b — arquitetura por views).
--
-- Novo agente LLM barato que roda logo após o copy_merge (estágio de
-- código) e AUDITA o resultado: julga o que o relatório mecânico não
-- enxerga (valor no slot errado, vazio/truncado, copy órfã que tem dono,
-- slot que deve ser removido). Output = fila de exceções padronizada
-- que alimenta o agente de exceção (text_format modo exception_slots).
-- Ele NUNCA escreve no HTML — output é só roteamento.
--
-- Kill-switch sem deploy: email_generation_settings.merge_verifier_mode
--   'on_flag' (default) → roda só quando o relatório do merge acusa algo
--   'always'            → audita toda geração (mesmo merge 100% limpo)
--   'off'               → comportamento anterior (fila mecânica decide)
-- ============================================================

-- 1. CHECK email_agent_configs.agent_type (+merge_verifier)
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'email_agent_configs'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%agent_type%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE email_agent_configs DROP CONSTRAINT %I', cname);
  END IF;
  ALTER TABLE email_agent_configs
    ADD CONSTRAINT email_agent_configs_agent_type_check
    CHECK (agent_type IN (
      'copy','image','html','qa','blueprint','assembler','assembler_chooser',
      'campaign_suggestion','campaign_trends','campaign_copy_master',
      'campaign_architect','campaign_image','refiner','component_test',
      'subject',
      'hero_section','text_format','image_format','color_format',
      'component_tagger',
      'merge_verifier'
    ));
END $$;

-- 2. CHECK email_generation_runs.agent (+merge_verifier)
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'email_generation_runs'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%agent%'
    AND pg_get_constraintdef(oid) NOT ILIKE '%status%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE email_generation_runs DROP CONSTRAINT %I', cname);
  END IF;
  ALTER TABLE email_generation_runs
    ADD CONSTRAINT email_generation_runs_agent_check
    CHECK (agent IN (
      'seed','copy','image','html','qa','blueprint','assembler',
      'copy_dispatch','assembler_chooser','campaign_image','refiner',
      'component_test','subject',
      'hero_section','text_format','image_format','color_format',
      'component_tagger',
      'copy_merge',
      'merge_verifier'
    ));
END $$;

-- 3. Seed da config (prompt vazio → o chain usa o DEFAULT in-code; editar
--    na aba Agentes sobrescreve). Haiku direto na Anthropic (sem "/"):
--    julgamento curto sobre views pequenas — barato e rápido.
INSERT INTO email_agent_configs (
  agent_type, model, system_prompt, user_template, temperature, max_tokens, is_active, version
)
SELECT 'merge_verifier', 'claude-haiku-4-5', '', '', 0.2, 2048, true, 1
WHERE NOT EXISTS (
  SELECT 1 FROM email_agent_configs WHERE agent_type = 'merge_verifier' AND is_active = true
);

-- 4. Modo do verificador nas settings do pipeline (kill-switch sem deploy).
ALTER TABLE email_generation_settings
  ADD COLUMN IF NOT EXISTS merge_verifier_mode TEXT NOT NULL DEFAULT 'on_flag'
    CHECK (merge_verifier_mode IN ('always', 'on_flag', 'off'));

COMMENT ON COLUMN email_generation_settings.merge_verifier_mode IS
  'Quando o Verificador de merge (7b) roda: on_flag = só quando o relatório do copy_merge acusa algo (default); always = toda geração; off = fila mecânica decide (comportamento pré-verificador).';
