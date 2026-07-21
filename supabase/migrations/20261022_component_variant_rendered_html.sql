-- Campo próprio para o exemplo real do email renderizado, colado
-- manualmente na aba "HTML renderizado" do editor de variantes.
-- Independente de `html` (o HTML do componente usado pelo pipeline).

ALTER TABLE email_component_variants
  ADD COLUMN IF NOT EXISTS rendered_html TEXT;

COMMENT ON COLUMN email_component_variants.rendered_html IS
  'Exemplo real do email renderizado, colado manualmente no editor (aba HTML renderizado). Não é usado pelo pipeline.';
