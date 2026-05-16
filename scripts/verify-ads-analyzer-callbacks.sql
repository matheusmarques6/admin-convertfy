-- Verificação pós-teste dos 7 callbacks do Analisador de ADS.
-- Uso: rodar contra o mesmo STORE_ID usado no script de teste.
--
-- Espera ver:
--   - brand_thesis preenchido
--   - icp_demographics, icp_persona (jsonb), icp_day_in_life, icp_motivations[], icp_frictions[]
--   - tone_description, tone_do[], tone_dont[], tone_use_words[], tone_avoid_words[]
--   - ads_score, ads_summary, ads_sub_scores, ads_strengths, ads_opportunities, ads_risks, ads_reviewed_at
--   - 1 linha em store_top_products (após o teste idempotente substituir 5 por 1)
--   - 2 linhas em client_competitors com source='n8n'
--   - 1 store_briefings com status='current', generated_by='n8n:ads-analyzer'

\set STORE_ID '3b02aea2-327a-476f-b10f-8d80167b4721'

-- 1) Snapshot, ICP, Tone, Ads no client_stores
SELECT
  store_name,
  left(brand_thesis, 80) AS brand_thesis_preview,
  icp_demographics,
  icp_persona,
  left(icp_day_in_life, 80) AS day_in_life_preview,
  icp_motivations,
  icp_frictions,
  tone_description,
  tone_do,
  tone_dont,
  tone_use_words,
  tone_avoid_words,
  ads_score,
  ads_summary,
  ads_sub_scores,
  ads_reviewed_at
FROM client_stores
WHERE id = :'STORE_ID';

-- 2) Top produtos (deve ter 1 após o teste idempotente — substituiu os 5 anteriores)
SELECT rank, title, price, currency, source, captured_at
FROM store_top_products
WHERE store_id = :'STORE_ID'
ORDER BY rank;

-- 3) Concorrentes — devem aparecer ambos com source='n8n', sem duplicar Sallve
SELECT name, url, posicionamento, source
FROM client_competitors
WHERE store_id = :'STORE_ID'
ORDER BY created_at DESC;

-- 4) Briefing — deve ter 1 versão current do n8n:ads-analyzer
SELECT id, version, status, generated_by, generated_at,
       briefing_data->>'format' AS format,
       briefing_data->>'mode' AS mode,
       length(briefing_data->>'markdown') AS markdown_len
FROM store_briefings
WHERE store_id = :'STORE_ID'
ORDER BY version DESC
LIMIT 5;
