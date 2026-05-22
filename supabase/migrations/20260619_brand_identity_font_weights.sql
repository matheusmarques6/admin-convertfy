-- Adiciona colunas de peso/variante da fonte na identidade visual.
--
-- Ate agora, store_brand_identity armazenava apenas o nome da fonte
-- (font_heading, font_body). O novo design da tela de Identidade Visual
-- exibe tambem o peso (ex: "Inter · Black 900", "Inter · Regular 400 /
-- Medium 500"). Sem essas colunas o display fica limitado a "Inter".
--
-- Ambas colunas sao NULLABLE — rows pre-existentes ficam com NULL e a UI
-- exibe "—" como fallback. A IA do /capture-brand vai aprender a preencher
-- esses campos no proximo capture.

ALTER TABLE store_brand_identity
  ADD COLUMN IF NOT EXISTS font_heading_weight TEXT,
  ADD COLUMN IF NOT EXISTS font_body_weight TEXT;

COMMENT ON COLUMN store_brand_identity.font_heading_weight IS
  'Peso/variante da fonte de headlines. Ex: "Black 900", "Bold 700".';
COMMENT ON COLUMN store_brand_identity.font_body_weight IS
  'Peso/variante da fonte de body. Ex: "Regular 400 / Medium 500".';
