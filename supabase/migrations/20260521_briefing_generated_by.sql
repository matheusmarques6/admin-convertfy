-- Rastreia qual etapa da cascata de fallback produziu o briefing IA.
-- Valores esperados:
--   'anthropic_sonnet'    — T1 (Anthropic SDK direto, Claude Sonnet 4.6)
--   'openrouter_sonnet'   — T2 (OpenRouter, Claude Sonnet 4.6)
--   'raw_template'        — T3 (template determinístico, sem IA)
--   NULL                  — briefing legado pré-cascata

ALTER TABLE onboardings
  ADD COLUMN IF NOT EXISTS briefing_generated_by text NULL;

COMMENT ON COLUMN onboardings.briefing_generated_by IS
  'Etapa da cascata de fallback que gerou o briefing: anthropic_sonnet | openrouter_sonnet | raw_template. NULL para briefings legados.';
