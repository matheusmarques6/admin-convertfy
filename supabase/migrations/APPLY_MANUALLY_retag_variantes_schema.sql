-- ============================================================
-- RETAGUEAMENTO EM MASSA — o HTML se ajusta ao schema
--
-- Origem: DIAGNOSTICO_schema_x_tags.sql apontou 18 variantes ativas em que
-- o `output_schema` declara um campo e o HTML endereça OUTRA tag. Nenhuma
-- copy ancora nesses blocos: o `copy_merge` devolve merged=0, tudo cai em
-- `left_for_llm`, o merge_verifier marca `slot_vazio` com
-- `acao_sugerida: remove_row` e o text_format obedece — a caixa some do
-- email. Foi assim que produtos e reviews saíram vazios na Luxe Lift.
--
-- Regra (migration 20261064): o endereço de um campo é {{MAIÚSCULA_DA_KEY}}
-- e mais nada. Quando schema e HTML divergem, quem se ajusta é o HTML.
--
-- ============================================================
-- O QUE ESTE SCRIPT **NÃO** RENOMEIA — e por quê
-- ============================================================
-- No tag-registry existem tags de PLATAFORMA (`kind` data/url): quem as
-- preenche é o feed do produto / a plataforma de envio, não o agente de
-- copy. Renomeá-las para o vocabulário do schema tira o slot de quem o
-- preenche hoje e NINGUÉM passa a preenchê-lo — o email fica pior do que
-- está. São elas, entre as órfãs do relatório:
--
--   PRODUCT_N_NAME · PRODUCT_N_PRICE · PRODUCT_N_COMPARE_PRICE
--   REVIEW_N_IMAGE · PRODUCTS_BG_IMAGE · USP_N_ICON
--
-- Quando o schema declara um campo equivalente a uma dessas (por exemplo
-- `product_1_price_new` ↔ {{PRODUCT_1_PRICE}}), o conserto é do lado do
-- SCHEMA: remover o campo do `output_schema` da variante (a plataforma já
-- resolve). A lista está na Parte 4, para decisão humana.
--
-- ============================================================
-- COMO RODAR
-- ============================================================
-- O editor do Supabase mostra só o resultado do ÚLTIMO statement. Rode
-- uma PARTE por vez, conferindo o resultado antes de seguir.
--   Parte 1 — renomeia (devolve uma linha por variante alterada)
--   Parte 2 — reauditoria das variantes tocadas (esperado: 0 problemas
--             de copy; sobram só as pendências das Partes 3 e 4)
--   Parte 3 — quais lojas precisam de reassemble (o HTML já montado em
--             store_email_references carrega as tags ANTIGAS)
--   Parte 4 — worklist de curadoria (o SQL não resolve)
--
-- Idempotente: rodar duas vezes não faz nada na segunda (o `de` já não
-- existe mais no HTML).
-- ============================================================


-- ============================================================
-- PARTE 1 — RENOMEAÇÃO
-- ============================================================
-- Guardas embutidas, para que um nome de variante duplicado ou um schema
-- diferente do esperado não produza estrago:
--   (a) só renomeia se a variante DECLARA no próprio output_schema a key
--       cujo placeholder canônico é o `para` — sem isso, o rename criaria
--       uma tag que ninguém reivindica;
--   (b) só renomeia o token completo `{{TAG}}`, então prefixo não colide
--       ({{PRODUCT_1_DESC}} não casa dentro de {{PRODUCT_1_DESC_2}});
--   (c) mexe em `html` e `html_tagged` — o consumidor usa o efetivo
--       (html_tagged aprovado, senão html) e os dois têm de concordar.

WITH RECURSIVE mapa(variante, de, para) AS (
  VALUES
    -- ── PRODUTOS ────────────────────────────────────────────────
    -- Vocabulário antigo da seção (PRODUCTS_*) → vocabulário do schema
    -- (SECTION_*), que é o que o Curador passou a cadastrar.
    ('produtos 9 - 4 produtos',      'PRODUCTS_TITLE',      'SECTION_HEADLINE'),
    ('produtos 9 - 4 produtos',      'PRODUCTS_SUBHEAD',    'SECTION_SUBHEAD'),
    ('produtos 9 - 4 produtos',      'PRODUCTS_CTA_LABEL',  'SECTION_CTA_LABEL'),

    ('produto 8 - 4 produtos',       'PRODUCTS_TITLE',      'SECTION_HEADLINE'),
    ('produto 8 - 4 produtos',       'PRODUCTS_CTA_LABEL',  'SECTION_CTA_LABEL'),
    ('produto 8 - 4 produtos',       'PRODUCT_1_DESC',      'PRODUCT_1_BENEFIT'),

    ('produtos 6',                   'PRODUCTS_TITLE',      'SECTION_HEADLINE'),
    ('produtos 6',                   'PRODUCTS_CTA_LABEL',  'SECTION_CTA_LABEL'),
    ('produtos 6',                   'PRODUCT_1_DESC',      'PRODUCT_1_BENEFIT'),
    ('produtos 6',                   'PRODUCT_2_DESC',      'PRODUCT_2_BENEFIT'),

    -- O bloco de um produto usa o corpo da seção como descrição longa:
    -- por isso DESC → SECTION_BODY_1 e DESC_2 → SECTION_BODY_2.
    ('produtos 4 - um produto',      'PRODUCTS_TITLE',      'SECTION_HEADLINE'),
    ('produtos 4 - um produto',      'PRODUCTS_CTA_LABEL',  'SECTION_CTA_LABEL'),
    ('produtos 4 - um produto',      'PRODUCT_1_DESC',      'SECTION_BODY_1'),
    ('produtos 4 - um produto',      'PRODUCT_1_DESC_2',    'SECTION_BODY_2'),

    ('produtos 7 - dois produtos',   'PRODUCTS_CTA_LABEL',  'SECTION_CTA_LABEL'),
    ('produtos 7 - dois produtos',   'PRODUCT_1_DESC',      'PRODUCT_1_BODY'),

    -- Grid de 4: a arte usa USP_N_TEXT como item de lista.
    ('produtos 3 - grid 4 produtos', 'PRODUCTS_TITLE',      'SECTION_HEADLINE'),
    ('produtos 3 - grid 4 produtos', 'PRODUCTS_CTA_LABEL',  'SECTION_CTA_LABEL'),
    ('produtos 3 - grid 4 produtos', 'PRODUCTS_IMAGE',      'SECTION_IMAGE'),
    ('produtos 3 - grid 4 produtos', 'USP_1_TEXT',          'LIST_ITEM_1'),
    ('produtos 3 - grid 4 produtos', 'USP_2_TEXT',          'LIST_ITEM_2'),
    ('produtos 3 - grid 4 produtos', 'USP_3_TEXT',          'LIST_ITEM_3'),
    ('produtos 3 - grid 4 produtos', 'USP_4_TEXT',          'LIST_ITEM_4'),

    ('produtos 8 - 9 produtos',      'PRODUCTS_TITLE',      'SECTION_HEADLINE'),
    ('produtos 8 - 9 produtos',      'PRODUCTS_SUBHEAD',    'SECTION_SUBHEAD'),

    -- ── REVIEWS ─────────────────────────────────────────────────
    -- REVIEW_N_* (registro antigo) → TESTIMONIAL_N_* (schema atual).
    -- REVIEW_N_IMAGE fica FORA: é tag de plataforma (ver cabeçalho).
    ('review 6', 'REVIEWS_TITLE',      'SECTION_HEADLINE'),
    ('review 6', 'REVIEWS_CTA_LABEL',  'SECTION_CTA_LABEL'),
    ('review 6', 'REVIEW_1_TEXT',      'TESTIMONIAL_1_QUOTE_BODY'),
    ('review 6', 'REVIEW_1_NAME',      'TESTIMONIAL_1_AUTHOR'),
    ('review 6', 'REVIEW_2_TEXT',      'TESTIMONIAL_2_QUOTE_BODY'),
    ('review 6', 'REVIEW_2_NAME',      'TESTIMONIAL_2_AUTHOR'),
    ('review 6', 'REVIEW_3_TEXT',      'TESTIMONIAL_3_QUOTE_BODY'),
    ('review 6', 'REVIEW_3_NAME',      'TESTIMONIAL_3_AUTHOR'),

    -- Nesta variante o META é a credencial ("cliente desde 2021").
    ('review 1', 'REVIEWS_TITLE',      'SECTION_HEADLINE'),
    ('review 1', 'REVIEWS_TEXT',       'SECTION_BODY_1'),
    ('review 1', 'REVIEW_1_TEXT',      'TESTIMONIAL_1_QUOTE_BODY'),
    ('review 1', 'REVIEW_1_NAME',      'TESTIMONIAL_1_AUTHOR'),
    ('review 1', 'REVIEW_1_META',      'TESTIMONIAL_1_CREDENTIAL'),
    ('review 1', 'REVIEW_2_TEXT',      'TESTIMONIAL_2_QUOTE_BODY'),
    ('review 1', 'REVIEW_2_NAME',      'TESTIMONIAL_2_AUTHOR'),
    ('review 1', 'REVIEW_2_META',      'TESTIMONIAL_2_CREDENTIAL'),

    -- Aqui o mesmo META é o título do depoimento.
    ('review 3', 'REVIEWS_TITLE',      'SECTION_HEADLINE'),
    ('review 3', 'REVIEWS_CTA_LABEL',  'SECTION_CTA_LABEL'),
    ('review 3', 'REVIEW_1_TEXT',      'TESTIMONIAL_1_QUOTE_BODY'),
    ('review 3', 'REVIEW_1_NAME',      'TESTIMONIAL_1_AUTHOR'),
    ('review 3', 'REVIEW_1_META',      'TESTIMONIAL_1_TITLE'),
    ('review 3', 'REVIEW_2_TEXT',      'TESTIMONIAL_2_QUOTE_BODY'),
    ('review 3', 'REVIEW_2_NAME',      'TESTIMONIAL_2_AUTHOR'),
    ('review 3', 'REVIEW_2_META',      'TESTIMONIAL_2_TITLE'),

    ('review 5', 'REVIEWS_TITLE',      'SECTION_HEADLINE'),
    ('review 5', 'REVIEW_1_TEXT',      'TESTIMONIAL_1_QUOTE_BODY'),
    ('review 5', 'REVIEW_1_NAME',      'TESTIMONIAL_1_AUTHOR'),
    ('review 5', 'REVIEW_2_TEXT',      'TESTIMONIAL_2_QUOTE_BODY'),
    ('review 5', 'REVIEW_2_NAME',      'TESTIMONIAL_2_AUTHOR'),
    ('review 5', 'REVIEW_3_TEXT',      'TESTIMONIAL_3_QUOTE_BODY'),
    ('review 5', 'REVIEW_3_NAME',      'TESTIMONIAL_3_AUTHOR')
),

-- Placeholder canônico de cada campo declarado (mesma normalização do
-- código: upper(key), não-alfanumérico vira "_").
campos AS (
  SELECT
    v.id,
    regexp_replace(upper(btrim(f->>'key')), '[^A-Z0-9_]+', '_', 'g') AS ph
  FROM email_component_variants v,
       jsonb_array_elements(COALESCE(v.output_schema, '[]'::jsonb)) f
  WHERE v.is_active = true
    AND COALESCE(btrim(f->>'key'), '') <> ''
),

-- Pares aplicáveis: variante ativa + o schema DECLARA o destino + o HTML
-- ainda tem a tag de origem. `ord` dá a ordem do fold.
pares AS (
  SELECT
    v.id,
    m.de,
    m.para,
    row_number() OVER (PARTITION BY v.id ORDER BY m.de) AS ord
  FROM email_component_variants v
  JOIN mapa m ON m.variante = v.name
  WHERE v.is_active = true
    AND EXISTS (SELECT 1 FROM campos c WHERE c.id = v.id AND c.ph = m.para)
    AND (
      position('{{' || m.de || '}}' in COALESCE(v.html, '')) > 0
      OR position('{{' || m.de || '}}' in COALESCE(v.html_tagged, '')) > 0
    )
),

base AS (
  SELECT DISTINCT
    p.id,
    COALESCE(v.html, '')        AS html,
    COALESCE(v.html_tagged, '') AS tagged
  FROM pares p
  JOIN email_component_variants v ON v.id = p.id
),

-- Aplica os renames em cascata, um por passo.
fold AS (
  -- 0::bigint: `row_number()` devolve bigint e o Postgres exige que o
  -- termo não-recursivo tenha o MESMO tipo do recursivo.
  SELECT id, 0::bigint AS ord, html, tagged FROM base
  UNION ALL
  SELECT
    f.id,
    p.ord,
    replace(f.html,   '{{' || p.de || '}}', '{{' || p.para || '}}'),
    replace(f.tagged, '{{' || p.de || '}}', '{{' || p.para || '}}')
  FROM fold f
  JOIN pares p ON p.id = f.id AND p.ord = f.ord + 1
),

aplicados AS (
  SELECT
    id,
    count(*) AS n,
    string_agg(de || ' → ' || para, ' · ' ORDER BY ord) AS lista
  FROM pares
  GROUP BY id
),

final AS (
  SELECT DISTINCT ON (f.id)
    f.id, f.html, f.tagged, a.n, a.lista
  FROM fold f
  JOIN aplicados a ON a.id = f.id
  ORDER BY f.id, f.ord DESC
)

UPDATE email_component_variants v
SET
  html        = fi.html,
  html_tagged = NULLIF(fi.tagged, '')
FROM final fi
WHERE fi.id = v.id
  AND (
    v.html IS DISTINCT FROM fi.html
    OR COALESCE(v.html_tagged, '') IS DISTINCT FROM fi.tagged
  )
RETURNING
  v.name                       AS variante,
  v.block_type                 AS secao,
  COALESCE(v.tagging_status, '—') AS tag_status,
  fi.n                         AS tags_renomeadas,
  fi.lista                     AS de_para;


-- ============================================================
-- PARTE 2 — REAUDITORIA (rodar depois da Parte 1)
-- ============================================================
-- Mesma régua do código (`auditSchemaTags`), restrita às variantes do
-- lote. Esperado: as pendências que sobram são só as das Partes 3/4 —
-- campo que a plataforma preenche e campo que a arte não tem.

WITH v AS (
  SELECT
    id, name, block_type,
    CASE
      WHEN tagging_status = 'approved' AND COALESCE(html_tagged, '') <> ''
        THEN html_tagged
      ELSE COALESCE(html, '')
    END AS eff_html,
    COALESCE(output_schema, '[]'::jsonb) AS schema
  FROM email_component_variants
  WHERE is_active = true
    AND name IN (
      'produtos 9 - 4 produtos','produto 8 - 4 produtos','produtos 6',
      'produtos 4 - um produto','produtos 7 - dois produtos',
      'produtos 3 - grid 4 produtos','produtos 8 - 9 produtos',
      'review 6','review 1','review 3','review 5'
    )
),
campos AS (
  SELECT
    v.id,
    regexp_replace(upper(btrim(f->>'key')), '[^A-Z0-9_]+', '_', 'g') AS ph
  FROM v, jsonb_array_elements(v.schema) f
  WHERE COALESCE(btrim(f->>'key'), '') <> ''
    AND COALESCE(
          f->>'nature',
          CASE WHEN f->>'type' = 'image' THEN 'imagem_gerada' ELSE 'copy' END
        ) <> 'asset_fixo'
),
tags AS (
  SELECT DISTINCT v.id, m[1] AS tag
  FROM v, regexp_matches(v.eff_html, '\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}', 'g') m
)
SELECT
  v.name AS variante,
  (SELECT count(*) FROM campos c
    WHERE c.id = v.id
      AND EXISTS (SELECT 1 FROM tags t WHERE t.id = v.id AND t.tag = c.ph))
    AS ancorados,
  (SELECT count(*) FROM campos c WHERE c.id = v.id) AS total_campos,
  (SELECT string_agg(c.ph, ' · ' ORDER BY c.ph) FROM campos c
    WHERE c.id = v.id
      AND NOT EXISTS (SELECT 1 FROM tags t WHERE t.id = v.id AND t.tag = c.ph))
    AS ainda_sem_ancora
FROM v
-- Por ordinal: `ancorados` é alias de saída e o Postgres não o aceita
-- dentro de expressão no ORDER BY.
ORDER BY 4 DESC NULLS LAST, 2 ASC, 1 ASC;


-- ============================================================
-- PARTE 3 — QUEM PRECISA DE REASSEMBLE
-- ============================================================
-- O rename conserta a BIBLIOTECA. O HTML já montado por loja
-- (store_email_references) foi gerado com as tags antigas e continua com
-- elas — a copy nova não vai ancorar lá. Esta query lista as referências
-- que ainda carregam alguma tag renomeada; para cada loja, regerar em
-- POST /api/admin/stores/{store_id}/generate-blueprints.

SELECT
  r.store_id,
  count(*)                                   AS referencias_afetadas,
  string_agg(DISTINCT r.flow_type, ', ')     AS fluxos,
  max(r.updated_at)                          AS ultima_montagem
FROM store_email_references r
WHERE r.html ~ '\{\{(PRODUCTS_TITLE|PRODUCTS_SUBHEAD|PRODUCTS_CTA_LABEL|PRODUCTS_IMAGE|PRODUCT_[0-9]+_DESC(_[0-9]+)?|USP_[0-9]+_TEXT|REVIEWS_TITLE|REVIEWS_TEXT|REVIEWS_CTA_LABEL|REVIEW_[0-9]+_(TEXT|NAME|META))\}\}'
GROUP BY r.store_id
ORDER BY referencias_afetadas DESC;


-- ============================================================
-- PARTE 4 — WORKLIST DE CURADORIA (o SQL não resolve)
-- ============================================================
-- Cada item abaixo é decisão humana na aba Componentes. Divididos por
-- natureza do problema.
--
-- (A) SCHEMA DECLARA O QUE A PLATAFORMA PREENCHE → remover o campo do
--     output_schema (a tag da arte fica como está):
--       produtos 4 - um produto : product_1_price_old  ({{PRODUCT_1_COMPARE_PRICE}} é data)
--                                 product_1_price_new  ({{PRODUCT_1_PRICE}} é data)
--       review 1/3/5/6          : testimonial_N_image  ({{REVIEW_N_IMAGE}} é data)
--       vários                  : section_cta_url      ({{*_CTA_URL}} é url)
--
-- (B) A ARTE TEM SLOT QUE O SCHEMA NÃO DESCREVE → adicionar campo:
--       produtos 9 - 4 produtos : product_4_image  (arte tem 4, schema descreve 3)
--       produto 8 - 4 produtos  : product_2/3/4_name e _benefit
--       produtos 7 - dois prod. : product_1/2_thumb_1..3, product_2_*, *_cta_label
--       produtos 8 - 9 produtos : o schema tem UM campo `product_1_9_*` para
--                                 os nove produtos. Não há rename possível —
--                                 precisa virar 9 × (nome, imagem, url).
--       review 3                : review_verified_label
--       produtos 6              : products_bg_image (ou remover da arte)
--
-- (C) SCHEMA NÃO PERTENCE À ARTE → recadastro:
--       hero - routine minimal  : schema é de HERO (hero_headline, hero_cta_*),
--                                 arte é de BODY/USP (BODY_TITLE, USP_N_*).
--                                 Nenhum dos 5 campos existe na arte.
--       body 5 - comparison...  : schema pede howto_1_steps/howto_2_steps numa
--                                 tabela comparativa. Campos de outra variante.
--
-- (D) VARIANTE NÃO TAGUEADA (tags_orfas = null, campos sem ancora) →
--     rodar o Taguedor e aprovar:
--       welcome - hero sectiion 8 (7 de 8 campos sem placeholder)
--       welcome - hero section 3  (4 de 7)
--       welcome - hero section 6  (3 de 7)
--       welcome - hero section 4  (só offer_value)
--
-- (E) welcome - hero section 9 — a variante do email quebrado:
--       schema declara `hero_subhead` que a arte não tem;
--       a arte tem {{OFFER_VALUE}} e {{COUPON_CODE}} que o schema não
--       declara. Não é rename (subhead ≠ oferta/cupom): ou o schema ganha
--       offer_value + coupon_code, ou perde hero_subhead. Enquanto ficar
--       assim, o agente de hero vê slot sem valor e remove a linha.
--
-- Para reabrir o relatório completo: DIAGNOSTICO_schema_x_tags.sql
-- ============================================================
