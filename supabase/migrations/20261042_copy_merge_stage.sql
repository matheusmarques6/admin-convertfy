-- ============================================================
-- Fase A (arquitetura por slots): estágio copy_merge.
--
-- O merge determinístico de copy (código, sem LLM) ganha run próprio em
-- email_generation_runs (agent='copy_merge') para a metrificação exigida:
-- slots_total / merged / left_for_llm / skipped por razão, custo zero.
-- Não há config em email_agent_configs — não é um agente LLM.
-- ============================================================

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
      'copy_merge'
    ));
END $$;
