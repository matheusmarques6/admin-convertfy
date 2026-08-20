-- ============================================================
-- "Quanto do retagueamento sai sozinho?" — plano de adaptação.
--
-- Espelha as regras REAIS de `retag-mecanico.ts` (as 1–3 do Taguedor,
-- sem modelo), na mesma ordem:
--
--   ja_ancorado  — {{MAIÚSCULA_DA_KEY}} já está no HTML.
--   renomear     — existe tag no papel do campo (vocabulário antigo).
--   exemplo      — a frase do `example` (>= 4 chars) aparece UMA vez no
--                  HTML: troca a frase pelo placeholder.
--   sem_lugar    — nenhum dos anteriores. Precisa de mão humana: a arte
--                  não tem onde receber o campo, ou o exemplo não bate
--                  com o documento.
--
-- APROXIMAÇÃO CONHECIDA: o script re-audita a cada campo (ancorar um
-- muda o HTML e a unicidade das frases seguintes). Aqui cada campo é
-- avaliado de forma independente, então `ancoravel_pelo_exemplo` é uma
-- ESTIMATIVA OTIMISTA quando a variante repete exemplos. Serve para
-- dimensionar o trabalho; o número exato sai do dry-run do script.
--
-- A regra `renomear` quase não aparece hoje: a biblioteca está com 0
-- tags no HTML, então não há o que renomear — o plano depende quase
-- todo da regra do exemplo.
--
-- asset_fixo fica de fora por desenho: a arte não vira placeholder.
-- Nenhuma das duas consultas escreve nada.
-- ============================================================


-- ══════════════════════════════════════════════════════════
-- 0) ELEGIBILIDADE — rode ESTA primeiro
--
-- `variantHasPlaceholders` (component-assembler.service.ts:449) tira do
-- pool de candidatas TODA variante cujo HTML efetivo não tem nenhum
-- {{PLACEHOLDER}}. Não é aviso: o Montador nunca a escolhe.
--
-- O motivo está no próprio código — variante sem placeholder é
-- impreenchível ponta a ponta (o blueprint não a vê, o n8n não gera
-- copy, os agentes não têm o que substituir e o exemplo hardcoded vaza
-- pro cliente; caso "body 2" da Luxe Lift).
--
-- Espelha o regex ANY_PLACEHOLDER: /\{\{\s*[A-Z][A-Z0-9_]*\s*\}\}/
-- sobre o HTML EFETIVO (html_tagged quando approved, senão html).
--
-- Se `elegiveis` vier baixo, o retagueamento deixa de ser dívida
-- técnica e passa a ser o que sustenta a geração.
-- ══════════════════════════════════════════════════════════
WITH ef AS (
  SELECT
    id, name, block_type,
    coalesce(jsonb_array_length(output_schema), 0) AS n_campos,
    CASE
      WHEN tagging_status = 'approved' AND coalesce(html_tagged, '') <> ''
        THEN html_tagged
      ELSE coalesce(html, '')
    END AS eff_html
  FROM email_component_variants
  WHERE is_active = true
)
SELECT
  block_type AS secao,
  count(*)                                                        AS variantes,
  count(*) FILTER (WHERE eff_html ~ '\{\{\s*[A-Z][A-Z0-9_]*\s*\}\}') AS elegiveis,
  count(*) FILTER (WHERE eff_html !~ '\{\{\s*[A-Z][A-Z0-9_]*\s*\}\}') AS fora_do_pool,
  string_agg(name, ' · ' ORDER BY name)
    FILTER (WHERE eff_html !~ '\{\{\s*[A-Z][A-Z0-9_]*\s*\}\}')      AS excluidas
FROM ef
GROUP BY block_type
ORDER BY fora_do_pool DESC, secao;


-- ══════════════════════════════════════════════════════════
-- 1) RESUMO — o tamanho do trabalho
-- ══════════════════════════════════════════════════════════
WITH campos AS (
  SELECT
    v.id, v.name, v.block_type, v.html,
    btrim(f->>'key')                   AS key,
    btrim(coalesce(f->>'example', '')) AS exemplo,
    coalesce(
      f->>'nature',
      CASE WHEN f->>'type' = 'image' THEN 'imagem_gerada' ELSE 'copy' END
    ) AS natureza,
    regexp_replace(upper(btrim(f->>'key')), '[^A-Z0-9_]+', '_', 'g') AS ph
  FROM email_component_variants v,
       jsonb_array_elements(coalesce(v.output_schema, '[]'::jsonb)) f
  WHERE v.is_active = true
    AND coalesce(btrim(f->>'key'), '') <> ''
),
medido AS (
  SELECT c.*,
    (c.html ~ ('\{\{\s*' || c.ph || '\s*\}\}')) AS ja_ancorado,
    CASE WHEN length(c.exemplo) >= 4
         THEN (length(c.html) - length(replace(c.html, c.exemplo, ''))) / length(c.exemplo)
         ELSE 0 END AS occ_exata,
    CASE WHEN length(c.exemplo) >= 4
         THEN (length(lower(c.html)) - length(replace(lower(c.html), lower(c.exemplo), ''))) / length(c.exemplo)
         ELSE 0 END AS occ_ci
  FROM campos c
),
situado AS (
  SELECT m.*,
    CASE
      WHEN m.natureza = 'asset_fixo' THEN 'asset_fixo'
      WHEN m.ja_ancorado             THEN 'ja_ancorado'
      WHEN m.occ_exata = 1 OR (m.occ_exata = 0 AND m.occ_ci = 1)
                                     THEN 'ancoravel_pelo_exemplo'
      WHEN m.occ_exata > 1 OR m.occ_ci > 1
                                     THEN 'exemplo_ambiguo'
      WHEN length(m.exemplo) < 4     THEN 'sem_exemplo'
      ELSE                                'exemplo_nao_encontrado'
    END AS situacao
  FROM medido m
)
SELECT
  situacao,
  count(*)           AS campos,
  count(DISTINCT id) AS variantes,
  round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct
FROM situado
GROUP BY situacao
ORDER BY campos DESC;


-- ══════════════════════════════════════════════════════════
-- 2) VARIANTE A VARIANTE — onde vai doer
--    Ordena pelas que mais precisam de mão humana.
-- ══════════════════════════════════════════════════════════
WITH campos AS (
  SELECT
    v.id, v.name, v.block_type, v.html,
    btrim(f->>'key')                   AS key,
    btrim(coalesce(f->>'example', '')) AS exemplo,
    coalesce(
      f->>'nature',
      CASE WHEN f->>'type' = 'image' THEN 'imagem_gerada' ELSE 'copy' END
    ) AS natureza,
    regexp_replace(upper(btrim(f->>'key')), '[^A-Z0-9_]+', '_', 'g') AS ph
  FROM email_component_variants v,
       jsonb_array_elements(coalesce(v.output_schema, '[]'::jsonb)) f
  WHERE v.is_active = true
    AND coalesce(btrim(f->>'key'), '') <> ''
),
medido AS (
  SELECT c.*,
    (c.html ~ ('\{\{\s*' || c.ph || '\s*\}\}')) AS ja_ancorado,
    CASE WHEN length(c.exemplo) >= 4
         THEN (length(c.html) - length(replace(c.html, c.exemplo, ''))) / length(c.exemplo)
         ELSE 0 END AS occ_exata,
    CASE WHEN length(c.exemplo) >= 4
         THEN (length(lower(c.html)) - length(replace(lower(c.html), lower(c.exemplo), ''))) / length(c.exemplo)
         ELSE 0 END AS occ_ci
  FROM campos c
),
situado AS (
  SELECT m.*,
    CASE
      WHEN m.natureza = 'asset_fixo' THEN 'asset_fixo'
      WHEN m.ja_ancorado             THEN 'ja_ancorado'
      WHEN m.occ_exata = 1 OR (m.occ_exata = 0 AND m.occ_ci = 1)
                                     THEN 'ancoravel_pelo_exemplo'
      WHEN m.occ_exata > 1 OR m.occ_ci > 1
                                     THEN 'exemplo_ambiguo'
      WHEN length(m.exemplo) < 4     THEN 'sem_exemplo'
      ELSE                                'exemplo_nao_encontrado'
    END AS situacao
  FROM medido m
)
SELECT
  name       AS variante,
  block_type AS secao,
  count(*) FILTER (WHERE situacao <> 'asset_fixo') AS campos,
  count(*) FILTER (WHERE situacao = 'ancoravel_pelo_exemplo') AS sai_sozinho,
  count(*) FILTER (WHERE situacao IN
    ('exemplo_nao_encontrado', 'sem_exemplo', 'exemplo_ambiguo')) AS precisa_maos,
  string_agg(
    key || ' [' || situacao || ']',
    ' · ' ORDER BY key
  ) FILTER (WHERE situacao <> 'asset_fixo') AS detalhe
FROM situado
GROUP BY id, name, block_type
ORDER BY precisa_maos DESC, campos DESC;
