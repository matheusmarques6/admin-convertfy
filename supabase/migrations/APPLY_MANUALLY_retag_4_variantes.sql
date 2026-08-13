-- ============================================================
-- RETAGUEAMENTO DAS 4 VARIANTES ATINGIDAS EM 13/08
--
-- Tagueamento feito a partir do `html` de origem de cada uma. As trocas são
-- declaradas aqui e aplicadas SOBRE a coluna `html` do banco — o HTML não é
-- reescrito, só substituído em pontos nomeados. Grava em `html_tagged` e
-- deixa `tagging_status='pending'` para você revisar e aprovar na aba
-- Componentes. O `html` de origem não é tocado.
--
-- POR QUE O RETAG MECÂNICO FALHOU NESTAS: as artes são MOCKUPS. O texto
-- delas é `Lorem ipsum`, `Feature`, `ICON 1`, `CODECODE`, `(Brand's name)`.
-- Os `example` do schema são o texto real da campanha, que não está no HTML.
-- Casar frase com frase não tinha como funcionar — só reconhecer o PAPEL de
-- cada bloco resolve.
--
-- Cada troca abaixo foi verificada contra o fragmento real da arte em
-- PostgreSQL 16, incluindo os casos de dupla ocorrência (dois parágrafos com
-- o mesmo lorem, duas fotos com a mesma URL, cupom repetido na barra e na
-- pílula).
--
-- ORDEM: PARTE 1 (backup) → PARTE 2 (aplica) → PARTE 3 (confere).
-- ============================================================


-- ============================================================
-- PARTE 1 — BACKUP. Rode antes de tudo. Dois segundos.
-- ============================================================
CREATE TABLE IF NOT EXISTS email_component_variants_bkp_retag4 AS
SELECT id, html, html_tagged, tagging_status, tagging_meta
FROM email_component_variants
WHERE name IN (
  'body 2 - bridge textos linha produtos',
  'body 3 - bridge features cards',
  'body 5 - comparison table us vs them',
  'welcome - hero section 5'
);

-- Voltar atrás, se precisar:
-- UPDATE email_component_variants v
-- SET html_tagged = b.html_tagged, tagging_status = b.tagging_status,
--     tagging_meta = b.tagging_meta, updated_at = now()
-- FROM email_component_variants_bkp_retag4 b WHERE b.id = v.id;


-- ============================================================
-- PARTE 2 — APLICA
-- ============================================================

-- ── body 3 - bridge features cards ─────────────────── 7 de 7
-- Título e CTA já vinham com o texto real; os dois parágrafos são o MESMO
-- lorem (por isso `regexp_replace` sem 'g': o primeiro vira body_1, e a
-- segunda passada pega o que sobrou). Os três selos eram células com o
-- texto "ICON N" — viram <img> dentro do mesmo círculo, sem mexer na tabela.
UPDATE email_component_variants SET
  html_tagged = replace(replace(replace(replace(
    regexp_replace(
      regexp_replace(
        replace(html, 'The Gift That Fits Every Taste', '{{SECTION_HEADLINE}}'),
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit', '{{SECTION_BODY_1}}'),
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit', '{{SECTION_BODY_2}}'),
    'DIGITAL GIFT CARD', '{{SECTION_CTA_LABEL}}'),
    'ICON 1', '<img src="{{VALUE_SEAL_1_IMAGE}}" width="166" height="166" alt="" style="display:block;width:166px;height:166px;border-radius:83px;">'),
    'ICON 2', '<img src="{{VALUE_SEAL_2_IMAGE}}" width="166" height="166" alt="" style="display:block;width:166px;height:166px;border-radius:83px;">'),
    'ICON 3', '<img src="{{VALUE_SEAL_3_IMAGE}}" width="166" height="166" alt="" style="display:block;width:166px;height:166px;border-radius:83px;">'),
  tagging_status = 'pending',
  tagging_meta = jsonb_build_object(
    'model', 'manual_retag_13ago', 'generated_at', now(),
    'previous_status', tagging_status, 'previous_html_tagged', html_tagged,
    'fields', '[{"key":"section_headline","anchored_by":"exact"},
                {"key":"section_body_1","anchored_by":"inference"},
                {"key":"section_body_2","anchored_by":"inference"},
                {"key":"section_cta_label","anchored_by":"exact"},
                {"key":"value_seal_1_image","anchored_by":"inference"},
                {"key":"value_seal_2_image","anchored_by":"inference"},
                {"key":"value_seal_3_image","anchored_by":"inference"}]'::jsonb,
    'issues', '[]'::jsonb),
  updated_at = now()
WHERE name = 'body 3 - bridge features cards';


-- ── welcome - hero section 5 ───────────────────────── 7 de 7
-- `hero_image` já estava ancorado. A barra do topo e a pílula repetem o
-- MESMO cupom — as duas recebem a tag, que é o comportamento correto (o
-- merge troca todas as ocorrências porque é o mesmo conteúdo).
-- "LOGO HERE" vira {{LOGO}}: tag de SISTEMA, preenchida pela plataforma a
-- partir da loja, então não precisa (nem deve) estar no schema.
UPDATE email_component_variants SET
  html_tagged =
    replace(
      replace(
        regexp_replace(
          replace(replace(replace(replace(replace(
            html,
            'USE CODE', '{{COUPON_HINT}}'),
            'Use code', '{{COUPON_HINT}}'),
            'CODECODE', '{{COUPON_CODE}}'),
            'XXXX% OFF', '{{OFFER_VALUE}}'),
            'LOGO HERE', '<img src="{{LOGO}}" alt="" style="display:block;max-width:152px;height:auto;">'),
          'Welcome to<br>\s*<strong>\(Brand&rsquo;s name\)</strong>', '{{HERO_HEADLINE}}'),
        'Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium.', '{{HERO_SUBHEAD}}'),
      'SHOP NOW', '{{HERO_CTA_LABEL}}'),
  tagging_status = 'pending',
  tagging_meta = jsonb_build_object(
    'model', 'manual_retag_13ago', 'generated_at', now(),
    'previous_status', tagging_status, 'previous_html_tagged', html_tagged,
    'fields', '[{"key":"hero_headline","anchored_by":"inference"},
                {"key":"hero_subhead","anchored_by":"inference"},
                {"key":"offer_value","anchored_by":"inference"},
                {"key":"coupon_hint","anchored_by":"exact"},
                {"key":"coupon_code","anchored_by":"inference"},
                {"key":"hero_cta_label","anchored_by":"inference"},
                {"key":"hero_image","anchored_by":"exact"}]'::jsonb,
    'issues', '[]'::jsonb),
  updated_at = now()
WHERE name = 'welcome - hero section 5';


-- ── body 2 - bridge textos linha produtos ──────────── 8 de 8 keys
-- Os dois parágrafos: o texto do 2º é PREFIXO do 1º, então o 1º (mais
-- longo) tem de ser trocado primeiro — invertendo a ordem, o segundo
-- casaria dentro do primeiro. As duas fotos têm a MESMA URL: `regexp_replace`
-- sem 'g' pega uma de cada vez. A fita repete "Black Friday" ~14x e TODAS
-- viram {{CAMPAIGN_TAPE}} — é o desenho da fita, não um acidente.
-- ATENÇÃO: `campaign_tape` está DUPLICADO no schema. Os dois apontam para
-- {{CAMPAIGN_TAPE}} e a copy de um sobrescreve a do outro. Apague a linha
-- repetida no editor de schema.
UPDATE email_component_variants SET
  html_tagged = replace(
    replace(replace(
      regexp_replace(
        regexp_replace(
          replace(replace(
            regexp_replace(html,
              'It''s the Perfect Time<br>\s*to Bring Your Family Joy', '{{SECTION_HEADLINE}}'),
            'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor, Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor', '{{SECTION_BODY_1}}'),
            'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor, Lorem ipsum dolor sit amet,', '{{SECTION_BODY_2}}'),
          'https://www\.figma\.com/api/mcp/asset/d9880f17-4c4a-4c00-9c7c-bfeb3240d83c', '{{SECTION_IMAGE}}'),
        'https://www\.figma\.com/api/mcp/asset/d9880f17-4c4a-4c00-9c7c-bfeb3240d83c', '{{SECTION_IMAGE2}}'),
      'SHOP BLACK FRIDAY', '{{SECTION_CTA_LABEL}}'),
      'href="#"', 'href="{{SECTION_CTA_URL}}"'),
    'Black&nbsp;Friday', '{{CAMPAIGN_TAPE}}'),
  tagging_status = 'pending',
  tagging_meta = jsonb_build_object(
    'model', 'manual_retag_13ago', 'generated_at', now(),
    'previous_status', tagging_status, 'previous_html_tagged', html_tagged,
    'fields', '[{"key":"section_headline","anchored_by":"exact"},
                {"key":"section_body_1","anchored_by":"inference"},
                {"key":"section_body_2","anchored_by":"inference"},
                {"key":"campaign_tape","anchored_by":"exact"},
                {"key":"section_image","anchored_by":"inference"},
                {"key":"section_image2","anchored_by":"inference"},
                {"key":"section_cta_label","anchored_by":"exact"},
                {"key":"section_cta_url","anchored_by":"inference"}]'::jsonb,
    'issues', '["campaign_tape aparece duas vezes no output_schema — apague a linha repetida"]'::jsonb),
  updated_at = now()
WHERE name = 'body 2 - bridge textos linha produtos';


-- ── body 5 - comparison table us vs them ──────────── 2 de 6 (leia abaixo)
-- Só os dois rótulos das colunas têm lugar nesta arte. Os outros quatro NÃO
-- são problema de tagueamento:
--
--   compare_rows   — é um ARRAY JSON de linhas, e a arte tem 5 linhas fixas
--                    escritas na mão. Um {{COMPARE_ROWS}} só despejaria o
--                    JSON cru dentro do email. O correto são 15 campos
--                    (compare_1_criterion / _ours / _theirs, até o 5).
--   howto_1_steps  — schema de "como fazer" numa arte de tabela comparativa.
--   howto_2_steps    Não existe seção de passos aqui. É schema de outro
--                    componente colado neste.
--   section_image  — a arte não tem imagem nenhuma.
--
-- Por isso esta fica em 2/6 e é CURADORIA, não retag. Ela estava em 3/6
-- antes de 13/08 porque `compare_rows` estava ancorado em algum ponto — o
-- que produzia JSON no email, não copy.
UPDATE email_component_variants SET
  html_tagged = replace(replace(html,
    'Our Aftercare', '{{COMPARE_OURS_LABEL}}'),
    'Other Brands', '{{COMPARE_THEIRS_LABEL}}'),
  tagging_status = 'pending',
  tagging_meta = jsonb_build_object(
    'model', 'manual_retag_13ago', 'generated_at', now(),
    'previous_status', tagging_status, 'previous_html_tagged', html_tagged,
    'fields', '[{"key":"compare_ours_label","anchored_by":"exact"},
                {"key":"compare_theirs_label","anchored_by":"exact"},
                {"key":"compare_rows","anchored_by":"not_found"},
                {"key":"howto_1_steps","anchored_by":"not_found"},
                {"key":"howto_2_steps","anchored_by":"not_found"},
                {"key":"section_image","anchored_by":"not_found"}]'::jsonb,
    'issues', '["compare_rows e um array JSON: a arte tem 5 linhas fixas. Trocar por 15 campos planos (compare_N_criterion/_ours/_theirs).",
                "howto_1_steps e howto_2_steps sao de outro componente — a arte nao tem secao de passos.",
                "section_image: a arte nao tem imagem."]'::jsonb),
  updated_at = now()
WHERE name = 'body 5 - comparison table us vs them';


-- ============================================================
-- PARTE 3 — CONFERE. Quantos campos do schema ficaram ancorados
-- no HTML tagueado novo.
-- ============================================================
WITH v AS (
  SELECT name, coalesce(html_tagged, '') AS eff, output_schema
  FROM email_component_variants
  WHERE tagging_meta->>'model' = 'manual_retag_13ago'
),
campos AS (
  SELECT v.name, v.eff, btrim(coalesce(e->>'key','')) AS k,
         btrim(regexp_replace(upper(btrim(coalesce(e->>'key',''))), '[^A-Z0-9_]+', '_', 'g'), '_') AS ph
  FROM v, jsonb_array_elements(v.output_schema) e
  WHERE btrim(coalesce(e->>'key','')) <> ''
)
-- DISTINCT nos dois lados: `body 2` tem a mesma key duas vezes no schema, e
-- contá-la duas vezes daria um total que não bate com nada.
SELECT name AS variante,
       count(DISTINCT k) FILTER (WHERE eff ~ ('\{\{\s*' || ph || '\s*\}\}')) AS ancorados,
       count(DISTINCT k) AS campos_distintos,
       coalesce(string_agg(DISTINCT k, ', ') FILTER (
         WHERE NOT (eff ~ ('\{\{\s*' || ph || '\s*\}\}'))), '—') AS ainda_sem_tag
FROM campos GROUP BY name ORDER BY name;
