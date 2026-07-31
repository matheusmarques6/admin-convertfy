-- ============================================================
-- "Quais variantes NÃO seguem o schema?" — relatório de UM statement.
--
-- Regra auditada (a mesma do código, em `auditSchemaTags`):
--   o endereço de um campo no HTML é {{MAIÚSCULA_DA_KEY}}, e só isso.
--   `hero_headline` mora em {{HERO_HEADLINE}}. Não existe apelido.
--
-- Três colunas de resultado:
--   campos_sem_tag   — o schema declara e o HTML não endereça. A copy volta
--                      do n8n e não tem onde entrar: placeholder cru no email.
--   tags_sem_campo   — o HTML tem o slot e ninguém escreve nele.
--   proposta_rename  — quando dá pra deduzir qual tag do HTML ocupa o papel
--                      do campo (vocabulário antigo do tag-registry), a linha
--                      já diz o de/para do retagueamento.
--
-- Audita o HTML EFETIVO: html_tagged quando a tag está aprovada, senão html —
-- o mesmo que o pipeline consome.
--
-- Não escreve nada. Ordena as piores primeiro.
-- ============================================================

WITH v AS (
  SELECT
    id, name, block_type, tagging_status,
    CASE
      WHEN tagging_status = 'approved' AND COALESCE(html_tagged, '') <> ''
        THEN html_tagged
      ELSE COALESCE(html, '')
    END AS eff_html,
    COALESCE(output_schema, '[]'::jsonb) AS schema
  FROM email_component_variants
  WHERE is_active = true
),

-- Campos do schema → placeholder canônico. asset_fixo fica de fora: a arte
-- da biblioteca não vira placeholder, por desenho.
campos AS (
  SELECT
    v.id,
    f->>'key' AS key,
    regexp_replace(upper(btrim(f->>'key')), '[^A-Z0-9_]+', '_', 'g') AS ph
  FROM v, jsonb_array_elements(v.schema) f
  WHERE COALESCE(btrim(f->>'key'), '') <> ''
    AND COALESCE(
          f->>'nature',
          CASE WHEN f->>'type' = 'image' THEN 'imagem_gerada' ELSE 'copy' END
        ) <> 'asset_fixo'
),

-- {{TAGS}} distintas do HTML efetivo.
tags AS (
  SELECT DISTINCT v.id, m[1] AS tag
  FROM v,
       regexp_matches(v.eff_html, '\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}', 'g') m
),

-- Tags preenchidas pela PLATAFORMA (logo, preheader, href, alt, preço do
-- produto...): nunca são órfãs — não é papel do schema da variante declará-las.
-- Espelha os kinds 'data'/'url' do tag-registry, com os índices normalizados
-- (HEADER_LINK_2_URL → HEADER_LINK_N_URL).
sistema AS (
  SELECT unnest(ARRAY[
    'EMAIL_TITLE','PREHEADER','BRAND_NAME','YEAR','WEBSITE_URL','LOGO',
    'LOGO_URL','HEADER_LINK_N_LABEL','HEADER_LINK_N_URL','HERO_CTA_URL',
    'HERO_CTA_N_URL','HERO_IMAGE_ALT','BODY_CTA_URL','BODY_IMAGE_ALT',
    'BODY_BG_IMAGE','OFFER_CTA_URL','PRODUCTS_CTA_URL','PRODUCTS_IMAGE_ALT',
    'PRODUCTS_BG_IMAGE','PRODUCT_N_NAME','PRODUCT_N_PRICE',
    'PRODUCT_N_COMPARE_PRICE','PRODUCT_N_REVIEWS_COUNT','PRODUCT_N_URL',
    'PRODUCT_N_IMAGE_ALT','USP_N_ICON','USP_ICON','USP_N_IMAGE_ALT',
    'STEP_N_NUMBER','REVIEWS_CTA_URL','REVIEWS_IMAGE_ALT','REVIEW_N_RATING',
    'REVIEW_N_IMAGE','REVIEW_N_INITIAL','REVIEW_N_PHOTOS','REVIEW_N_URL',
    'BADGE_N_ICON','COUNTDOWN_DD','COUNTDOWN_HH','COUNTDOWN_MM',
    'COUNTDOWN_SS','FINAL_CTA_URL','CTA_URL','FOOTER_ADDRESS',
    'FOOTER_LINK_N_LABEL','FOOTER_LINK_N_URL','INSTAGRAM_URL','FACEBOOK_URL',
    'TIKTOK_URL','PINTEREST_URL','YOUTUBE_URL','INSTAGRAM_ICON',
    'FACEBOOK_ICON','TIKTOK_ICON','PINTEREST_ICON','YOUTUBE_ICON',
    'UNSUBSCRIBE_LABEL','UNSUBSCRIBE_URL','PREFERENCES_LABEL',
    'PREFERENCES_URL'
  ]) AS tag
),

-- Campo sem o próprio placeholder no HTML.
faltando AS (
  SELECT c.id, c.key, c.ph
  FROM campos c
  WHERE NOT EXISTS (SELECT 1 FROM tags t WHERE t.id = c.id AND t.tag = c.ph)
),

-- Tag no HTML que nenhum campo reivindica e que a plataforma não preenche.
sobrando AS (
  SELECT t.id, t.tag
  FROM tags t
  WHERE NOT EXISTS (SELECT 1 FROM campos c WHERE c.id = t.id AND c.ph = t.tag)
    AND regexp_replace(t.tag, '_\d+', '_N', 'g') NOT IN (SELECT tag FROM sistema)
),

-- De/para provável: a tag sobrando cujo nome, sem o prefixo de seção, bate
-- com a key do campo faltando (HERO_BODY ↔ body). Só uma sugestão — quem
-- decide é o revisor na aba Componentes.
rename AS (
  SELECT DISTINCT ON (f.id, f.key)
    f.id, f.key, f.ph, s.tag AS de
  FROM faltando f
  JOIN sobrando s ON s.id = f.id
  WHERE s.tag LIKE '%\_' || f.ph ESCAPE '\'
     OR f.ph LIKE '%\_' || s.tag ESCAPE '\'
  ORDER BY f.id, f.key, length(s.tag)
)

SELECT
  v.name                                                   AS variante,
  v.block_type                                             AS secao,
  COALESCE(v.tagging_status, '—')                          AS tag_status,
  COALESCE(fa.n, 0) + COALESCE(so.n, 0)                    AS problemas,
  COALESCE(fa.lista, '—')                                  AS campos_sem_tag,
  COALESCE(so.lista, '—')                                  AS tags_sem_campo,
  COALESCE(re.lista, '—')                                  AS proposta_rename,
  v.id                                                     AS variant_id
FROM v
LEFT JOIN (
  SELECT id, count(*) AS n,
         string_agg(key || ' → {{' || ph || '}}', ' · ' ORDER BY key) AS lista
  FROM faltando GROUP BY id
) fa ON fa.id = v.id
LEFT JOIN (
  SELECT id, count(*) AS n,
         string_agg('{{' || tag || '}}', ' · ' ORDER BY tag) AS lista
  FROM sobrando GROUP BY id
) so ON so.id = v.id
LEFT JOIN (
  SELECT id, string_agg('{{' || de || '}} → {{' || ph || '}}', ' · ' ORDER BY key) AS lista
  FROM rename GROUP BY id
) re ON re.id = v.id
ORDER BY problemas DESC, v.block_type, v.name;
