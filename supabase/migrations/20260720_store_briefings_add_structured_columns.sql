-- store_briefings: adiciona as colunas do formato estruturado
--
-- A tabela tem DUAS definições nas migrations: a de 20260220
-- (briefing_data/status — a que venceu em produção) e a de 20260607
-- (marca/briefing/raw_input/source), cujo CREATE TABLE IF NOT EXISTS
-- foi silenciosamente pulado porque a tabela já existia. Todo código
-- de junho/2026 em diante assume o formato novo → erros 42703
-- ("column store_briefings.marca does not exist") em produção:
--   - Montador e dispatch de copy rodam SEM contexto de marca (erro
--     engolido, caem em default)
--   - process-briefing ("tratar briefing com IA") e o PUT de briefing
--     dão 500 no insert
--
-- Correção ADITIVA: os dois formatos passam a conviver na mesma tabela.
-- Nada é removido nem migrado; leitores do formato antigo (webhook
-- briefing-markdown, aba de briefings, trigger do Epic AE) ficam
-- intocados.

ALTER TABLE store_briefings
  ADD COLUMN IF NOT EXISTS raw_input JSONB,
  ADD COLUMN IF NOT EXISTS marca JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS briefing JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id);

-- CHECK de source com nome explícito (padrão pós-Epic AE)
ALTER TABLE store_briefings
  DROP CONSTRAINT IF EXISTS store_briefings_source_check;
ALTER TABLE store_briefings
  ADD CONSTRAINT store_briefings_source_check
  CHECK (source IN ('ai_treatment', 'manual', 'edited'));

-- Inserts do formato novo não fornecem briefing_data (NOT NULL hoje):
-- default '{}' mantém o NOT NULL sem quebrar os leitores antigos.
ALTER TABLE store_briefings
  ALTER COLUMN briefing_data SET DEFAULT '{}'::jsonb;

-- Índice usado pelas queries "última versão" do formato novo.
-- NOTA: a UNIQUE(store_id, version) da definição de 20260607 foi
-- deliberadamente OMITIDA — o formato antigo gravou version DEFAULT 1
-- sem unicidade garantida (duplicatas históricas fariam o ALTER
-- falhar), e os consumidores não dependem dela (leitura via ORDER BY
-- version DESC LIMIT 1; escrita via max+1).
CREATE INDEX IF NOT EXISTS idx_store_briefings_store_version
  ON store_briefings(store_id, version DESC);

COMMENT ON COLUMN store_briefings.marca IS
  'Formato estruturado (20260607): nicho, slogan, diferencial, persona, tom, posicionamento, hashtags.';
COMMENT ON COLUMN store_briefings.briefing IS
  'Formato estruturado (20260607): liberdade, aprovação, sensibilidade, conceito, políticas, etc.';
