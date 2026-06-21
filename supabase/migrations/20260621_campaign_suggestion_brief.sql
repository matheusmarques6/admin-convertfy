-- ============================================================
-- Campo `brief` (briefing de estrutura & tom da copy) em campaign_suggestions.
--
-- Transversal ao board unificado (Fases 2/3). O COO descreve, por campanha,
-- COMO a copy deve ser gerada: estrutura por bloco, tom de cada parte, regras
-- e o que evitar. O texto é injetado como seção ADITIVA no prompt de geração:
--   - copy-master.service.ts   → guia a estrutura dos blocks da MASTER
--   - campaign-copy.service.ts → guia a adaptação POR LOJA (buildUserPrompt)
--
-- Shape (espelha CampaignBrief em src/types/campaign-central.ts):
--   { structure?, tone?, constraints?, must_include? }
-- Todos os campos são opcionais. A UI principal (campaign-detail-modal) usa
-- um único textarea mapeado para `brief.structure` (modelo gerado por
-- "Usar modelo"); os demais campos ficam disponíveis para uso futuro/avançado.
--
-- NOTA OPERACIONAL: este .sql NÃO foi aplicado automaticamente. Aplicar no
-- Supabase (SQL Editor / `supabase db push`) antes de usar o campo em produção.
-- IF NOT EXISTS garante idempotência.
-- ============================================================

ALTER TABLE campaign_suggestions
  ADD COLUMN IF NOT EXISTS brief JSONB;
