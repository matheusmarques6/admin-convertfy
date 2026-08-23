-- ============================================================
-- "Que variante gera imagem que não tem onde entrar?" — um statement.
--
-- Sintoma (Luxe Lift, 23/08): o bloco `produtos 4 - um produto` gerou a
-- imagem, PAGOU por ela, e o e-mail saiu com o xadrez cinza da biblioteca.
-- A telemetria do image_format dizia `sem_lugar / token_nao_encontrado`:
-- o slot vinha declarado como
--
--   <img src="data:image/png;base64,…" alt="ALT_DO_PRODUTO">
--
-- e base64 é ARTE FIXA por regra (o ícone social, o selo) — o slot-finder
-- não vê destino nenhum. O código passou a curar o caso em que o `alt` É
-- token de slot (a <img> se autodeclara); este relatório mostra o que a
-- cura alcança e o que sobra para a mão humana no cadastro.
--
-- Colunas:
--   slots_gerados     — campos nature='imagem_gerada' do output_schema
--   slots_lockup      — destes, quantos são lockup/logo/wordmark, que a
--                       GERAÇÃO já pula de propósito (`isLockupSlot` em
--                       image/slot-groups.ts: o modelo deforma line-art).
--                       Sem destino no HTML eles não desperdiçam nada.
--   src_tokens        — quantos src="URL_…" existem no HTML efetivo
--   base64_com_alt    — <img> base64 cujo alt É token: o CÓDIGO cura
--   base64_sem_alt    — <img> base64 sem token: arte fixa, fica como está
--   sem_destino       — o DÉFICIT: slots − src − base64_com_alt
--   veredito          — o que fazer com esta linha
--
-- Audita o HTML EFETIVO (html_tagged aprovado, senão html) — o mesmo que o
-- pipeline consome. Não escreve nada.
-- ============================================================

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
),

-- Campo de imagem GERADA. Sem `nature` no cadastro antigo, type=image
-- deriva imagem_gerada — mesma regra de `deriveFieldNature` no código.
slots AS (
  SELECT
    v.id,
    count(*) AS n,
    -- Mesma régua do LOCKUP_KEY_RE de image/slot-groups.ts.
    count(*) FILTER (
      WHERE f->>'key' ~* '(lockup|logo|wordmark|icone?|icon|badge|selo)'
    ) AS n_lockup
  FROM v, jsonb_array_elements(v.schema) f
  WHERE f->>'type' = 'image'
    AND COALESCE(f->>'nature', 'imagem_gerada') = 'imagem_gerada'
  GROUP BY v.id
),

src_tokens AS (
  SELECT v.id, count(*) AS n
  FROM v, regexp_matches(v.eff_html, 'src\s*=\s*"(URL_[A-Z0-9_]+)"', 'g') m
  GROUP BY v.id
),

-- Cada <img> com base64 no src, e se o alt dela carrega token ALT_*.
-- O `[^>]*` de cada lado cobre as duas ordens de atributo.
imgs_base64 AS (
  SELECT
    v.id,
    count(*) FILTER (
      WHERE tag ~ 'alt\s*=\s*"ALT_[A-Z0-9_]+"'
    ) AS com_alt,
    count(*) FILTER (
      WHERE tag !~ 'alt\s*=\s*"ALT_[A-Z0-9_]+"'
    ) AS sem_alt
  FROM v, LATERAL (
    SELECT m[1] AS tag
    FROM regexp_matches(v.eff_html, '(<img[^>]*>)', 'g') m
    WHERE m[1] ~ 'src\s*=\s*"data:image'
  ) t
  GROUP BY v.id
)

SELECT
  v.block_type,
  v.name,
  d.slots_gerados,
  d.slots_lockup,
  d.src_tokens,
  d.base64_com_alt,
  d.base64_sem_alt,
  d.sem_destino,
  CASE
    -- O déficit é só de lockup: não gera imagem, não gasta nada.
    WHEN d.sem_destino <= d.slots_lockup
      THEN 'ok — o que falta é lockup, que a geração já pula'
    WHEN d.base64_com_alt > 0
      THEN 'parcial — o código ancora ' || d.base64_com_alt
           || ', faltam ' || (d.sem_destino - d.slots_lockup)
    ELSE 'CADASTRO — ' || (d.sem_destino - d.slots_lockup)
         || ' slot(s) geram e não têm onde entrar'
  END AS veredito
FROM v
JOIN LATERAL (
  SELECT
    COALESCE(s.n, 0)                                          AS slots_gerados,
    COALESCE(s.n_lockup, 0)                                   AS slots_lockup,
    COALESCE(st.n, 0)                                         AS src_tokens,
    COALESCE(b.com_alt, 0)                                    AS base64_com_alt,
    COALESCE(b.sem_alt, 0)                                    AS base64_sem_alt,
    COALESCE(s.n, 0) - COALESCE(st.n, 0) - COALESCE(b.com_alt, 0) AS sem_destino
  FROM slots s
  LEFT JOIN src_tokens st ON st.id = s.id
  LEFT JOIN imgs_base64 b ON b.id = s.id
  WHERE s.id = v.id
) d ON true
-- Só o que ainda não fecha: destino de src + base64 que o código cura.
WHERE d.sem_destino > 0
ORDER BY (d.sem_destino - d.slots_lockup) DESC, v.block_type, v.name;
