-- ─────────────────────────────────────────────────────────────────────
-- Campaign Design Pipeline
--
-- Pos-aprovacao, a campanha entra num pipeline de DESIGN de 4 etapas,
-- reusando o mecanismo de operational pipeline + tasks + deliverables +
-- gate de visibilidade por funcao (o mesmo do onboarding):
--
--   1. estrutura       (designer)  -> 1 task, 1 loja piloto, entregavel = link Figma
--   2. aprovacao       (coo)       -> COO aprova ou pede mudancas (nova versao)
--   3. producao        (designer)  -> 3 tasks: imagens, textos, identidade visual
--   4. finalizacao     (designer)  -> 1 task por loja (liga no prod_stage/Omnisend)
--
-- O pipeline + colunas sao criados via bootstrap (campaign-design-bootstrap.
-- service.ts), igual ao onboarding. Esta migration so adiciona o ESTADO da
-- etapa de design na campanha (paralelo a onboardings.current_column_id/
-- current_version). Aditiva: nao altera nada existente.
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE campaign_suggestions
  ADD COLUMN IF NOT EXISTS design_pipeline_id UUID
    REFERENCES operational_pipelines(id) ON DELETE SET NULL;

ALTER TABLE campaign_suggestions
  ADD COLUMN IF NOT EXISTS design_column_id UUID
    REFERENCES operational_pipeline_columns(id) ON DELETE SET NULL;

ALTER TABLE campaign_suggestions
  ADD COLUMN IF NOT EXISTS design_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE campaign_suggestions
  ADD COLUMN IF NOT EXISTS design_pilot_store_id UUID;

ALTER TABLE campaign_suggestions
  ADD COLUMN IF NOT EXISTS design_started_at TIMESTAMPTZ;

COMMENT ON COLUMN campaign_suggestions.design_column_id IS
  'Etapa atual do pipeline de design (FK operational_pipeline_columns). NULL = campanha ainda nao entrou em design.';
COMMENT ON COLUMN campaign_suggestions.design_version IS
  'Versao do retrabalho de design (incrementa quando o COO pede mudancas).';
COMMENT ON COLUMN campaign_suggestions.design_pilot_store_id IS
  'Loja representativa usada na etapa de Estrutura para o COO visualizar o email.';

CREATE INDEX IF NOT EXISTS idx_campaign_suggestions_design_column
  ON campaign_suggestions(design_column_id)
  WHERE design_column_id IS NOT NULL;
