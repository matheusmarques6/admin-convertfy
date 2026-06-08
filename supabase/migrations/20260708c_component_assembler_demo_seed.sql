-- ============================================================
-- Epic AE — Component Assembler: seed de demonstração
--
-- (a) Outlines (estrutura geral) derivados dos blueprints detalhados já
--     existentes em email_blueprints — objective vira objective, messaging
--     vira guidance, e a SEQUÊNCIA de tipos de bloco vira suggested_blocks.
-- (b) Componentes genéricos de EXEMPLO (1 por block_type, wildcard de
--     matching) para o Montador ter candidatos e montar o reference.
--
-- ATENÇÃO: após este seed, isArchitectConfigured() passa a TRUE e o agente
-- é disparado no onboarding. Os componentes 'exemplo' são PLACEHOLDERS —
-- substitua pelos reais (ou desative) antes de usar em produção:
--   UPDATE email_component_variants SET is_active = false
--     WHERE 'exemplo' = ANY(tags);
--
-- Idempotente (WHERE NOT EXISTS). Requer as migrations 20260708 e 20260708b.
-- ============================================================

-- (a) Outlines a partir dos blueprints detalhados existentes.
INSERT INTO email_outline_templates (
  flow_type, email_number, objective, guidance,
  suggested_blocks, tone_hint, is_active, version
)
SELECT
  b.flow_type,
  b.email_number,
  b.objective,
  b.messaging,
  COALESCE(
    (
      SELECT jsonb_agg(elem->>'type' ORDER BY ord)
      FROM jsonb_array_elements(b.blocks) WITH ORDINALITY AS t(elem, ord)
    ),
    '[]'::jsonb
  ),
  b.tone_override,
  true,
  1
FROM email_blueprints b
WHERE NOT EXISTS (
  SELECT 1 FROM email_outline_templates o
  WHERE o.flow_type = b.flow_type
    AND o.email_number = b.email_number
);

-- (b) Componentes genéricos de exemplo (1 por block_type, wildcard).
INSERT INTO email_component_variants (
  block_type, name, html, slots,
  niche_affinity, positioning, mood, density, tags, is_active, version
)
SELECT
  bt,
  'Exemplo — ' || bt,
  '<div data-block="' || bt ||
    '" style="padding:16px;font-family:Arial,sans-serif;border:1px solid #eee">' ||
    '<!-- ' || bt || ' --> {{CONTEUDO}}</div>',
  '["{{CONTEUDO}}"]'::jsonb,
  '{}'::text[],
  '{}'::text[],
  '{}'::text[],
  'balanced',
  ARRAY['exemplo'],
  true,
  1
FROM unnest(ARRAY[
  'header','hero','body','products','reviews','cta','offer','footer'
]) AS bt
WHERE NOT EXISTS (
  SELECT 1 FROM email_component_variants v
  WHERE v.block_type = bt AND 'exemplo' = ANY(v.tags)
);
