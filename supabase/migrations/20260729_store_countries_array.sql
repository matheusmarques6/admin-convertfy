-- 20260729_store_countries_array.sql
--
-- Multi-seleção de países da loja.
--
-- `country` (VARCHAR, singular) CONTINUA sendo o país PRINCIPAL da loja
-- (= countries[0]). É lido por ~12 consumidores (briefing, ai-context,
-- campaign-generate, attention-stores etc.) e NÃO muda de semântica.
--
-- `countries` (text[]) é a lista COMPLETA de países, usada apenas pela
-- Central de Campanhas (pesquisa de datas comemorativas + sugestões de
-- campanha) via fan-out: uma entrada de contexto por país.
--
-- Idempotente: pode rodar múltiplas vezes sem efeito colateral.

ALTER TABLE client_stores ADD COLUMN IF NOT EXISTS countries text[];

-- Backfill: lojas existentes ganham countries = [country] (o principal).
UPDATE client_stores SET countries = ARRAY[country]
  WHERE country IS NOT NULL AND (countries IS NULL OR countries = '{}');
