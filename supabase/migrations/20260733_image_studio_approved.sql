-- Estúdio de Imagens: APROVAR uma imagem para congelá-la.
--
-- Imagem aprovada não é regerada quando o lote inteiro é gerado de novo:
-- o operador aprova o que já ficou bom e segue gerando o resto sem medo
-- (e sem pagar de novo pelas que já estavam certas).
--
-- approved_at NULL = não aprovada. A aprovação é ORTOGONAL ao status
-- (a linha continua ready/adjustment); congelar é decisão do humano,
-- não estado da geração.
--
-- FORMATO: um comando por LINHA (statement multilinha quebra quando o
-- SQL editor executa um recorte parcial).

ALTER TABLE image_studio_results ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_image_studio_results_approved ON image_studio_results(batch_id) WHERE approved_at IS NOT NULL;

COMMENT ON COLUMN image_studio_results.approved_at IS 'Quando a imagem foi aprovada pelo operador. NOT NULL = congelada: a geração do lote pula este par (loja, variação) e a regeração individual é recusada até desaprovar.';
