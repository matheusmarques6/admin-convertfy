-- ============================================================
-- LIMPEZA FUTURA — NÃO APLICAR JUNTO COM AS MIGRATIONS NORMAIS.
--
-- Remove as dimensões LEGADAS de matching de email_component_variants
-- (niche_affinity / positioning / mood), substituídas por objectives/
-- tones na migration 20261003. O código parou de ler/escrever essas
-- colunas na mesma leva (deriver + assembler + API + UI).
--
-- Aplicar SOMENTE depois de 1-2 semanas de gerações OK com o novo
-- matching (validar nos logs que as escolhas do Curador continuam
-- boas). Rollback antes disso = restaurar o código antigo via git;
-- os dados legados seguem intactos até este script rodar.
-- ============================================================

DROP INDEX IF EXISTS idx_ecv_niche;
DROP INDEX IF EXISTS idx_ecv_mood;
DROP INDEX IF EXISTS idx_ecv_positioning;

ALTER TABLE email_component_variants
  DROP COLUMN IF EXISTS niche_affinity,
  DROP COLUMN IF EXISTS positioning,
  DROP COLUMN IF EXISTS mood;
