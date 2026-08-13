-- ============================================================
-- P03 — tira do output_schema os campos de URL que a variante não endereça.
--
-- Regra: o endereço de um campo é {{MAIÚSCULA_DA_KEY}}. Quando o schema
-- declara `section_cta_url` e o HTML tem `{{PRODUCTS_CTA_URL}}`, o campo
-- fica sem âncora — e não adianta retaguear, porque quem preenche aquele
-- href é a PLATAFORMA (kind `url` no tag-registry), não a copy gerada.
-- Declarar o campo só faz ele aparecer como pendência em todo diagnóstico.
--
-- São dois casos diferentes, e a Parte 2 separa os dois:
--
--   (A) existe tag de plataforma assumindo o slot — 9 campos. Remover é
--       parar de declarar o que outro já preenche. Nada muda no email.
--
--   (B) NÃO existe slot nenhum na arte — 3 campos, todos em `review 6`
--       (`testimonial_N_product_url`). Aquela variante não tem link por
--       depoimento. Remover aqui é decisão de CONTEÚDO: se você quiser o
--       link, o caminho é o contrário — inserir o slot na arte e manter o
--       campo. Rode a Parte 3 só se concordar em não ter o link.
--
-- Rode uma parte por vez: o editor do Supabase só mostra o resultado do
-- ÚLTIMO statement.
-- ============================================================


-- ── Parte 1 · O QUE SERÁ REMOVIDO (não escreve nada) ────────
-- Confira antes. `tags_url_no_html` mostra quem assume o slot.

WITH v AS (
  SELECT id, name,
    CASE WHEN tagging_status='approved' AND COALESCE(html_tagged,'')<>''
         THEN html_tagged ELSE COALESCE(html,'') END AS eff,
    COALESCE(output_schema,'[]'::jsonb) AS sch
  FROM email_component_variants WHERE is_active = true
),
campos AS (
  SELECT v.id, v.name, f->>'key' AS key,
         regexp_replace(upper(btrim(f->>'key')),'[^A-Z0-9_]+','_','g') AS ph
  FROM v, jsonb_array_elements(v.sch) f
  WHERE COALESCE(btrim(f->>'key'),'')<>''
),
tags AS (
  SELECT DISTINCT v.id, m[1] AS tag
  FROM v, regexp_matches(v.eff,'\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}','g') m
)
SELECT
  c.name  AS variante,
  c.key   AS campo_a_remover,
  CASE WHEN c.key LIKE 'testimonial%\_product\_url' ESCAPE '\'
       THEN 'B — sem slot na arte (decisão de conteúdo)'
       ELSE 'A — plataforma assume' END AS caso,
  COALESCE((SELECT string_agg(t.tag,' · ' ORDER BY t.tag) FROM tags t
            WHERE t.id=c.id AND t.tag LIKE '%\_URL' ESCAPE '\'),
           '(nenhuma)') AS tags_url_no_html
FROM campos c
WHERE c.key LIKE '%\_url' ESCAPE '\'
  AND NOT EXISTS (SELECT 1 FROM tags t WHERE t.id=c.id AND t.tag=c.ph)
ORDER BY 3, 1, 2;


-- ── Parte 2 · CASO A — remove os 9 que a plataforma assume ──
-- Reconstrói o output_schema sem os campos alvo. Só mexe em variante ativa
-- cujo campo de URL de fato NÃO tem âncora — se alguém retaguear antes, a
-- condição deixa de casar e o campo fica, que é o desejado.

WITH v AS (
  SELECT id,
    CASE WHEN tagging_status='approved' AND COALESCE(html_tagged,'')<>''
         THEN html_tagged ELSE COALESCE(html,'') END AS eff,
    COALESCE(output_schema,'[]'::jsonb) AS sch
  FROM email_component_variants WHERE is_active = true
),
tags AS (
  SELECT DISTINCT v.id, m[1] AS tag
  FROM v, regexp_matches(v.eff,'\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}','g') m
),
alvo AS (
  SELECT v.id, f->>'key' AS key
  FROM v, jsonb_array_elements(v.sch) f
  WHERE COALESCE(btrim(f->>'key'),'') LIKE '%\_url' ESCAPE '\'
    AND (f->>'key') NOT LIKE 'testimonial%\_product\_url' ESCAPE '\'
    AND NOT EXISTS (
      SELECT 1 FROM tags t WHERE t.id = v.id
        AND t.tag = regexp_replace(upper(btrim(f->>'key')),'[^A-Z0-9_]+','_','g')
    )
),
novo AS (
  SELECT v.id,
         COALESCE(jsonb_agg(f ORDER BY ord) FILTER (
           WHERE (f->>'key') NOT IN (SELECT key FROM alvo a WHERE a.id = v.id)
         ), '[]'::jsonb) AS sch_novo
  FROM v, jsonb_array_elements(v.sch) WITH ORDINALITY AS x(f, ord)
  WHERE v.id IN (SELECT id FROM alvo)
  GROUP BY v.id
)
UPDATE email_component_variants ecv
SET output_schema = novo.sch_novo,
    updated_at = now()
FROM novo
WHERE ecv.id = novo.id
RETURNING ecv.name AS variante,
          jsonb_array_length(ecv.output_schema) AS campos_restantes;


-- ── Parte 3 · CASO B — só rode se concordar ─────────────────
-- Remove `testimonial_1/2/3_product_url` da `review 6`. A arte dessa
-- variante não tem link por depoimento; isto assume que ela não terá.
-- Se a decisão for o contrário (querer o link), NÃO rode: o caminho é
-- inserir o slot na arte e deixar o campo onde está.
--
-- Descomente para executar.
--
-- WITH novo AS (
--   SELECT id,
--          COALESCE(jsonb_agg(f ORDER BY ord) FILTER (
--            WHERE (f->>'key') NOT LIKE 'testimonial%\_product\_url' ESCAPE '\'
--          ), '[]'::jsonb) AS sch_novo
--   FROM email_component_variants,
--        jsonb_array_elements(COALESCE(output_schema,'[]'::jsonb)) WITH ORDINALITY AS x(f, ord)
--   WHERE is_active = true AND btrim(name) = 'review 6'
--   GROUP BY id
-- )
-- UPDATE email_component_variants ecv
-- SET output_schema = novo.sch_novo, updated_at = now()
-- FROM novo WHERE ecv.id = novo.id
-- RETURNING ecv.name, jsonb_array_length(ecv.output_schema) AS campos_restantes;


-- ── Parte 5 · CASO A-2 — o mesmo, para imagem e preço ───────
-- Rodada depois da Parte 4: dos 51 campos que sobraram, 12 são a MESMA
-- situação da Parte 2 — o schema declara o que a plataforma preenche, só
-- que em imagem e preço em vez de URL.
--
--   testimonial_N_image  →  {{REVIEW_N_IMAGE}}          kind `data`
--   product_1_price_new  →  {{PRODUCT_1_PRICE}}         kind `data`
--   product_1_price_old  →  {{PRODUCT_1_COMPARE_PRICE}} kind `data`
--
-- Foto e nota de avaliação vêm da plataforma de reviews; preço vem do
-- catálogo. Retaguear não resolveria: trocaria o nome de um slot que o
-- agente de copy nunca preenche, e o campo continuaria vazio no email.
--
-- Mesma proteção da Parte 2: só remove quando o campo NÃO tem âncora. Se
-- alguém retaguear antes, a condição deixa de casar e o campo fica.

WITH v AS (
  SELECT id,
    CASE WHEN tagging_status='approved' AND COALESCE(html_tagged,'')<>''
         THEN html_tagged ELSE COALESCE(html,'') END AS eff,
    COALESCE(output_schema,'[]'::jsonb) AS sch
  FROM email_component_variants WHERE is_active = true
),
tags AS (
  SELECT DISTINCT v.id, m[1] AS tag
  FROM v, regexp_matches(v.eff,'\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}','g') m
),
alvo AS (
  SELECT v.id, f->>'key' AS key
  FROM v, jsonb_array_elements(v.sch) f
  WHERE (
      (f->>'key') ~ '^testimonial_\d+_image$'
      OR (f->>'key') IN ('product_1_price_new','product_1_price_old')
    )
    AND NOT EXISTS (
      SELECT 1 FROM tags t WHERE t.id = v.id
        AND t.tag = regexp_replace(upper(btrim(f->>'key')),'[^A-Z0-9_]+','_','g')
    )
),
novo AS (
  SELECT v.id,
         COALESCE(jsonb_agg(f ORDER BY ord) FILTER (
           WHERE (f->>'key') NOT IN (SELECT key FROM alvo a WHERE a.id = v.id)
         ), '[]'::jsonb) AS sch_novo
  FROM v, jsonb_array_elements(v.sch) WITH ORDINALITY AS x(f, ord)
  WHERE v.id IN (SELECT id FROM alvo)
  GROUP BY v.id
)
UPDATE email_component_variants ecv
SET output_schema = novo.sch_novo, updated_at = now()
FROM novo
WHERE ecv.id = novo.id
RETURNING ecv.name AS variante,
          jsonb_array_length(ecv.output_schema) AS campos_restantes;


-- ── Parte 4 · Reauditoria ───────────────────────────────────
-- Quantos campos sem âncora sobraram por variante. Os de URL devem ter
-- sumido da conta; o que restar é retagueamento de verdade (item 04).

WITH v AS (
  SELECT id, name,
    CASE WHEN tagging_status='approved' AND COALESCE(html_tagged,'')<>''
         THEN html_tagged ELSE COALESCE(html,'') END AS eff,
    COALESCE(output_schema,'[]'::jsonb) AS sch
  FROM email_component_variants WHERE is_active = true
),
campos AS (
  SELECT v.id, f->>'key' AS key,
         regexp_replace(upper(btrim(f->>'key')),'[^A-Z0-9_]+','_','g') AS ph
  FROM v, jsonb_array_elements(v.sch) f
  WHERE COALESCE(btrim(f->>'key'),'')<>''
    AND COALESCE(f->>'nature',
          CASE WHEN f->>'type'='image' THEN 'imagem_gerada' ELSE 'copy' END) <> 'asset_fixo'
),
tags AS (
  SELECT DISTINCT v.id, m[1] AS tag
  FROM v, regexp_matches(v.eff,'\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}','g') m
)
SELECT v.name AS variante,
       (SELECT count(*) FROM campos c WHERE c.id=v.id) AS campos,
       (SELECT count(*) FROM campos c WHERE c.id=v.id
          AND NOT EXISTS (SELECT 1 FROM tags t WHERE t.id=c.id AND t.tag=c.ph)) AS sem_ancora,
       (SELECT string_agg(c.key,' · ' ORDER BY c.key) FROM campos c WHERE c.id=v.id
          AND NOT EXISTS (SELECT 1 FROM tags t WHERE t.id=c.id AND t.tag=c.ph)) AS quais
FROM v
WHERE EXISTS (SELECT 1 FROM campos c WHERE c.id=v.id
       AND NOT EXISTS (SELECT 1 FROM tags t WHERE t.id=c.id AND t.tag=c.ph))
ORDER BY 3 DESC, 1;
