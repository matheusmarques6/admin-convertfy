-- ─────────────────────────────────────────────────────────────────────
-- commemorative_dates: coluna `source` pra rastrear origem das datas
-- (manual = seed/curadoria; nager = sincronizado da Nager.Date API;
-- ai = futuro, IA preenchendo gaps).
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE commemorative_dates
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'nager', 'ai'));

ALTER TABLE commemorative_dates
  ADD COLUMN IF NOT EXISTS external_id TEXT;

-- Permite vários países pra mesma fonte (Nager retorna 1 row por feriado
-- por país, com countryCode + date como chave natural).
CREATE INDEX IF NOT EXISTS idx_commemorative_dates_source_external
  ON commemorative_dates(source, external_id) WHERE external_id IS NOT NULL;

-- Aceita CC dos novos países do popover sem quebrar (FR, DE, IT, MX,
-- AR, CO, CL, CA, AU, JP, GB). Mantém UK por back-compat do seed.
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'commemorative_dates'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%country%IN%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE commemorative_dates DROP CONSTRAINT %I', cname);
  END IF;
  ALTER TABLE commemorative_dates
    ADD CONSTRAINT commemorative_dates_country_check
    CHECK (country IN (
      'BR','US','PT','UK','ES','MX','AR','CO','CL','DE','FR','IT','GB','CA','AU','JP'
    ));
END $$;
