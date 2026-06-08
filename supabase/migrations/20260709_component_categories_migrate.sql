-- ============================================================
-- Epic AE — migra a biblioteca de componentes dos 19 block_types
-- técnicos para as 8 SEÇÕES DE NEGÓCIO.
--
-- Para ambientes que já aplicaram a versão com 19 tipos. Idempotente:
-- se já estiver nas 8 seções, vira no-op (re-cria o mesmo CHECK; o
-- re-seed usa WHERE NOT EXISTS).
-- ============================================================

-- 1. Remove o CHECK atual de block_type (o nome pode variar).
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'email_component_variants'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%block_type%';
  IF cname IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE email_component_variants DROP CONSTRAINT %I', cname
    );
  END IF;
END $$;

-- 2. Remove os exemplos antigos (serão re-seedados nas 8 seções).
DELETE FROM email_component_variants WHERE 'exemplo' = ANY(tags);

-- 3. Migra componentes reais: block_type técnico → seção de negócio.
UPDATE email_component_variants SET block_type = CASE block_type
  WHEN 'image' THEN 'hero'
  WHEN 'text' THEN 'body'
  WHEN 'headline' THEN 'body'
  WHEN 'features' THEN 'body'
  WHEN 'comparison' THEN 'body'
  WHEN 'story' THEN 'body'
  WHEN 'letter' THEN 'body'
  WHEN 'testimonials' THEN 'reviews'
  WHEN 'social_proof' THEN 'reviews'
  WHEN 'coupon' THEN 'offer'
  WHEN 'urgency' THEN 'offer'
  WHEN 'social' THEN 'footer'
  ELSE block_type
END
WHERE block_type IN (
  'image','text','headline','features','comparison','story','letter',
  'testimonials','social_proof','coupon','urgency','social'
);

-- 4. Remove componentes sem seção de negócio (estruturais: divider/spacer
--    e qualquer tipo legado que sobrou).
DELETE FROM email_component_variants
WHERE block_type NOT IN (
  'header','hero','body','products','reviews','cta','offer','footer'
);

-- 5. Reaplica o CHECK com as 8 seções.
ALTER TABLE email_component_variants
  ADD CONSTRAINT email_component_variants_block_type_check
  CHECK (block_type IN (
    'header','hero','body','products','reviews','cta','offer','footer'
  ));

-- 6. Re-seed dos exemplos genéricos nas 8 seções (idempotente).
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
