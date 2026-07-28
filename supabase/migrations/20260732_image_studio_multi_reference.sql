-- Estúdio de Imagens: MÚLTIPLAS imagens-base por lote + modo de uso.
--
-- Antes: 1 imagem-base por lote (reference_image_url). Com N imagens o
-- operador pode mandar 3 ângulos do produto / 3 referências de estilo e
-- decidir COMO elas alimentam a geração:
--
--   reference_mode = 'all'           → todas as imagens entram como
--                                      referência em CADA imagem gerada
--   reference_mode = 'per_variation' → a variação i usa a imagem
--                                      (i mod N) — cada variação nasce
--                                      ancorada numa referência diferente
--
-- A coluna singular fica (deprecada) para o deploy poder ser revertido
-- sem perder o valor já gravado; o service lê o array e só cai nela
-- quando o array está vazio.

ALTER TABLE image_studio_batches
  ADD COLUMN IF NOT EXISTS reference_image_urls TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reference_mode TEXT NOT NULL DEFAULT 'all';

-- CHECK com nome explícito (padrão do projeto pós-Epic AE).
ALTER TABLE image_studio_batches
  DROP CONSTRAINT IF EXISTS image_studio_batches_reference_mode_check;
ALTER TABLE image_studio_batches
  ADD CONSTRAINT image_studio_batches_reference_mode_check
  CHECK (reference_mode IN ('all', 'per_variation'));

-- Backfill: lotes que já tinham a imagem única passam a ter o array com ela.
-- Uma linha só de propósito: colado em pedaços no SQL editor, um WHERE
-- multilinha vira "syntax error at or near AND".
UPDATE image_studio_batches SET reference_image_urls = ARRAY[reference_image_url] WHERE coalesce(reference_image_url, '') != '' AND cardinality(reference_image_urls) = 0;

COMMENT ON COLUMN image_studio_batches.reference_image_urls IS
  'Imagens-base do lote (0..N). Substitui reference_image_url, mantida deprecada como fallback de leitura.';
COMMENT ON COLUMN image_studio_batches.reference_mode IS
  'Como as imagens-base alimentam a geração: all = todas em cada imagem; per_variation = variação i usa a imagem (i mod N).';
