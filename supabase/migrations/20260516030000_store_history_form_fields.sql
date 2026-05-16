-- Fase 2: extensão do formulário de onboarding com história da loja
--
-- Adiciona campos crus em store_onboarding_data (preenchidos pelo cliente
-- no formulário) que depois são processados via AI e persistidos nos
-- campos estruturados de client_stores (store_story + store_milestones).

ALTER TABLE store_onboarding_data
  ADD COLUMN IF NOT EXISTS history_raw TEXT,
  ADD COLUMN IF NOT EXISTS milestones_raw JSONB;
