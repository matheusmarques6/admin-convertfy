-- Trilha B (set/2026) — B1 gate de prontidão + B2 lint de renderização.
--
-- 1. Agentes novos no CHECK de `email_generation_runs.agent`. Sem isto a run
--    é DESCARTADA em silêncio (23514 engolido pelo logGenerationRun) e o nó
--    some da telemetria — precedentes copy_fit (20261096), typography
--    (20261110) e seletor (20261116). `gerador_anatomia` (B4) já entra aqui
--    para não redefinir a constraint três vezes na mesma semana.
--
--      gate              — prontidão da loja avaliada antes de enfileirar
--                          (`skipped` = bloqueou; `success` = passou, com
--                          avisos em parsed_output)
--      gate_override     — o operador gerou mesmo assim, com motivo
--      lint_envio        — lint de renderização + pós-processador (código,
--                          custo zero), entre background_fit e o QA
--      gerador_anatomia  — gerador offline de anatomias da biblioteca
--
-- 2. `email_generation_settings.gate_mode` (off | shadow | on, default on) e
--    `lint_mode` (off | shadow | enforce, default enforce) — mesmo desenho
--    do `qa_mode` (20261141): a env (`EMAIL_GATE_MODE`/`EMAIL_LINT_MODE`)
--    VENCE o banco como freio de emergência.
--
-- 3. `email_flow_emails.render_previews` — prints do HTML final a 600 e
--    375px (`{desktop, mobile, captured_at}`), gravados pela fase 2 depois
--    do pós-processador. Coluna, não run: a tela do e-mail lê a linha do
--    e-mail, e o print é do e-mail, não de um passo.

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
      'catalogador','seletor',
      -- Trilha B (set/2026)
      'gate','gate_override','lint_envio','gerador_anatomia'
    ));
END $$;

ALTER TABLE email_generation_settings
  ADD COLUMN IF NOT EXISTS gate_mode TEXT NOT NULL DEFAULT 'on'
    CHECK (gate_mode IN ('off','shadow','on')),
  ADD COLUMN IF NOT EXISTS lint_mode TEXT NOT NULL DEFAULT 'enforce'
    CHECK (lint_mode IN ('off','shadow','enforce'));

COMMENT ON COLUMN email_generation_settings.gate_mode IS
  'Gate de prontidão da loja (B1): off = não avalia; shadow = grava o run gate e não corta; on = bloqueio impede enfileirar/gerar (422 nas rotas manuais). EMAIL_GATE_MODE no ambiente vence. Ver src/lib/stores/prontidao.service.ts.';
COMMENT ON COLUMN email_generation_settings.lint_mode IS
  'Lint de renderização (B2): off = não roda; shadow = grava o run lint_envio sem bloquear; enforce = achado bloqueante reprova a peça (failed: lint_<id>) antes do QA. EMAIL_LINT_MODE no ambiente vence. Ver src/lib/agents/html/lint-envio.ts.';

ALTER TABLE email_flow_emails
  ADD COLUMN IF NOT EXISTS render_previews JSONB;

COMMENT ON COLUMN email_flow_emails.render_previews IS
  'Prints do HTML final: {desktop: url 600px, mobile: url 375px, captured_at}. Gravado pela fase 2 após o pós-processador; fail-open (nulo quando o Chromium falhou).';
