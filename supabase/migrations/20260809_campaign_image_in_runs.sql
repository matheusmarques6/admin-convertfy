-- ─────────────────────────────────────────────────────────────────────
-- Surfacar o agente `campaign_image` na tela de Logs de Geração.
--
-- A geração de imagens por loja (Central de Campanhas →
-- campaign-image-generation.service.ts) passa a gravar um run em
-- email_generation_runs por imagem (running → success/error), pra aparecer
-- na página operacional `/admin/settings/email-generation-logs` "assim como
-- os outros agentes" — com contagem por agente em tempo real (polling de 30s
-- que a página já faz).
--
-- O CHECK da coluna `agent` só aceitava
-- ('seed','copy','image','html','qa','blueprint','assembler','copy_dispatch',
-- 'assembler_chooser'). Sem 'campaign_image', o INSERT falharia com 23514 e o
-- run seria descartado silenciosamente (logGenerationRun não relança) → o
-- agente sumiria da UI. Expande o CHECK incluindo 'campaign_image'.
--
-- Sem mudança na view `v_email_generation_logs`: ela já usa LEFT JOIN
-- (20260726_email_generation_logs_helpers.sql), então um run com
-- email_id/flow_id nulos (caso do campaign_image) ainda aparece, com
-- store_name preenchido e email/flow vazios.
--
-- Idempotente (mesmo padrão das migrations 20260728/20260730).
-- ─────────────────────────────────────────────────────────────────────

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
      'copy_dispatch','assembler_chooser','campaign_image'
    ));
END $$;
