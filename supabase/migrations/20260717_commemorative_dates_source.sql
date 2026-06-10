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
-- Nota: DROP IF EXISTS direto pelo nome — a constraint nasceu inline no
-- CREATE TABLE da 20260716, então o nome auto-gerado é determinístico.
-- (Lookup dinâmico via pg_get_constraintdef ILIKE '%IN%' não funciona:
-- o Postgres normaliza IN pra "= ANY (ARRAY[...])".)
ALTER TABLE commemorative_dates
  DROP CONSTRAINT IF EXISTS commemorative_dates_country_check;
ALTER TABLE commemorative_dates
  ADD CONSTRAINT commemorative_dates_country_check
  CHECK (country IN (
    'BR','US','PT','UK','ES','MX','AR','CO','CL','DE','FR','IT','GB','CA','AU','JP'
  ));
