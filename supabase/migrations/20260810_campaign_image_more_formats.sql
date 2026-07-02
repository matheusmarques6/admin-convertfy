-- ─────────────────────────────────────────────────────────────────────
-- Mais formatos de imagem de campanha: Retrato (4:5), Paisagem (16:9),
-- Banner (2:1) e Vertical (9:16) — além dos já existentes hero/square/story.
--
-- A coluna campaign_image_batches.format é TEXT + CHECK inline
-- (20260807_campaign_images.sql) que só aceitava ('hero','square','story').
-- Sem expandir o CHECK, criar/editar um lote com formato novo violaria a
-- constraint (23514). O aspect final é garantido pelo sharp (resize fit:cover)
-- — qualquer proporção é viável; só o CHECK do banco precisa acompanhar.
--
-- Idempotente (descobre o nome da constraint via pg_constraint + drop/recreate,
-- mesmo padrão de 20260807/20260809).
-- ─────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'campaign_image_batches'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%format%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE campaign_image_batches DROP CONSTRAINT %I', cname);
  END IF;
  ALTER TABLE campaign_image_batches
    ADD CONSTRAINT campaign_image_batches_format_check
    CHECK (format IN (
      'hero','square','story','portrait','landscape','banner','vertical'
    ));
END $$;
