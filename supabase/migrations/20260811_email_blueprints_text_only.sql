-- ─────────────────────────────────────────────────────────────────────
-- Email "somente texto": flag global por (flow_type, email_number).
--
-- Fonte ÚNICA de verdade — NÃO existe em store_email_blueprints: o email
-- text_only ignora a camada por loja e usa sempre a estrutura global.
-- Efeitos no pipeline quando true:
--   1. Fila de dispatch: architect nasce "skipped" (não roda Montador/
--      Blueprint por loja — generateBlueprintAndReference curto-circuita).
--   2. Payload do n8n: email vai com text_only=true + estrutura_geral
--      (email_outline_templates: objective/guidance/suggested_blocks/
--      tone_hint) e blueprint GLOBAL (nunca o da loja).
--   3. Callback de copy: email vai direto copy -> ready (sem imagem,
--      sem HTML agent) — designers veem só o texto.
--
-- Idempotente. Código é fail-open: sem a coluna as queries text_only
-- falham -> conjunto vazio -> tudo se comporta como hoje.
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE email_blueprints
  ADD COLUMN IF NOT EXISTS text_only BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN email_blueprints.text_only IS
  'true: pula Montador/Blueprint por loja, n8n recebe estrutura geral + text_only, email vai copy->ready sem imagem/HTML';

-- Índice parcial: todos os leitores buscam apenas rows text_only=true.
CREATE INDEX IF NOT EXISTS idx_email_blueprints_text_only
  ON email_blueprints (flow_type, email_number) WHERE text_only = true;
