-- ============================================================
-- RETAGUEAMENTO MECÂNICO — ancorar campo pela FRASE do exemplo
--
-- O endereço de um campo é `{{MAIÚSCULA_DA_KEY}}` e nada mais. Só existem
-- dois caminhos até ele:
--
--   1. o HTML já tem uma tag no papel do campo  → renomear para a key
--   2. o HTML tem a FRASE do `example`          → trocar a frase pelo placeholder
--
-- Este arquivo faz o caminho 2. O caminho 1 ficou de fora DE PROPÓSITO:
-- medido sobre os 51 campos sem âncora da biblioteca, o casamento por nome
-- (copyKey do tag-registry, nome normalizado, sufixo) propõe rename para
-- ZERO deles — `PRODUCT_1_IMAGE` não casa com `product_1_collage_image` por
-- regra nenhuma. Todo o rendimento mecânico está na frase.
--
-- O que NÃO é feito aqui, nem dá para fazer em SQL: inventar elemento que a
-- arte não tem, e decidir por semelhança de sentido que uma tag serve um
-- campo de outro nome. Isso é julgamento — é o botão "Retaguear
-- desalinhadas" (LLM) ou curadoria na mão.
--
-- ORDEM: rode a PARTE 1 (preview), leia, e só então a PARTE 2 (aplica).
--
-- A PARTE 2 grava `html_tagged` + `tagging_status='pending'` + relatório.
-- NÃO aprova nada e NÃO toca no `html` de origem.
--
-- ATENÇÃO: variante hoje `approved` volta para `pending`. Até você aprovar
-- a nova proposta na aba Componentes, produção usa o `html` de origem dela.
-- O status anterior fica em `tagging_meta.previous_status` — a PARTE 4
-- desfaz tudo.
--
-- Requer PostgreSQL 15+ (`regexp_count`). O projeto está no 17.
-- ============================================================


-- ============================================================
-- PARTE 1 — PREVIEW. Não grava nada.
-- Uma linha por campo sem âncora, com o veredito.
-- ============================================================
WITH v AS (
  SELECT id, name, block_type, coalesce(html, '') AS html, output_schema
  FROM email_component_variants
  WHERE is_active
    AND jsonb_typeof(output_schema) = 'array'
    AND jsonb_array_length(output_schema) > 0
),
campos AS (
  SELECT
    v.name, v.block_type, v.html,
    btrim(coalesce(e->>'key', '')) AS k,
    btrim(coalesce(e->>'example', '')) AS ex,
    -- Natureza efetiva: a explícita, senão derivada do tipo. `asset_fixo`
    -- é arte intacta — não vira slot (mesma regra do Taguedor).
    coalesce(
      e->>'nature',
      CASE WHEN e->>'type' = 'image' THEN 'imagem_gerada' ELSE 'copy' END
    ) AS nat
  FROM v, jsonb_array_elements(v.output_schema) e
),
prep AS (
  SELECT
    name, block_type, k, ex, html,
    -- placeholderForKey: maiúscula, não-alfanumérico vira _, sem _ nas pontas
    btrim(regexp_replace(upper(k), '[^A-Z0-9_]+', '_', 'g'), '_') AS ph,
    -- A frase é copy do cliente: escapar antes de usar como regex.
    regexp_replace(ex, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') AS esc
  FROM campos
  WHERE k <> '' AND nat <> 'asset_fixo'
)
-- O preview mede cada campo contra o HTML ORIGINAL; a PARTE 2 é sequencial
-- (cada troca muda o HTML). Divergem só quando a frase de um campo está
-- contida na de outro — raro, e o veredito final é o da PARTE 3.
SELECT secao, variante, campo, placeholder, veredito, frase_do_exemplo
FROM (
  SELECT
    block_type AS secao,
    name AS variante,
    k AS campo,
    '{{' || ph || '}}' AS placeholder,
    CASE
      WHEN length(ex) < 4                      THEN 'exemplo curto/vazio — sem proposta'
      WHEN regexp_count(html, esc, 1, 'i') = 1 THEN 'ANCORA PELA FRASE'
      WHEN regexp_count(html, esc, 1, 'i') > 1 THEN 'frase repetida ' || regexp_count(html, esc, 1, 'i') || 'x — nao troca (seria adivinhar)'
      ELSE 'SEM LUGAR na arte — cadastro'
    END AS veredito,
    left(ex, 60) AS frase_do_exemplo
  FROM prep
  -- Campo já ancorado não é pendência: fica fora do preview.
  WHERE NOT (html ~ ('\{\{\s*' || ph || '\s*\}\}'))
) t
ORDER BY (veredito = 'ANCORA PELA FRASE') DESC, secao, variante, campo;


-- ============================================================
-- PARTE 2 — APLICA. Rode só depois de ler a PARTE 1.
-- ============================================================
DO $$
DECLARE
  v            RECORD;
  e            jsonb;
  k            text;
  ph           text;
  ex           text;
  esc          text;
  nat          text;
  novo         text;
  ancorados    int;
  campos_meta  jsonb;
  issues       jsonb;
  tot_var      int := 0;
  tot_campo    int := 0;
  tot_semlugar int := 0;
BEGIN
  FOR v IN
    SELECT id, name, block_type, coalesce(html, '') AS html,
           output_schema, tagging_status
    FROM email_component_variants
    WHERE is_active
      AND jsonb_typeof(output_schema) = 'array'
      AND jsonb_array_length(output_schema) > 0
    ORDER BY block_type, name
  LOOP
    novo := v.html;
    ancorados := 0;
    campos_meta := '[]'::jsonb;
    issues := '[]'::jsonb;

    FOR e IN SELECT * FROM jsonb_array_elements(v.output_schema)
    LOOP
      k := btrim(coalesce(e->>'key', ''));
      CONTINUE WHEN k = '';

      nat := coalesce(
        e->>'nature',
        CASE WHEN e->>'type' = 'image' THEN 'imagem_gerada' ELSE 'copy' END
      );
      CONTINUE WHEN nat = 'asset_fixo';

      ph := btrim(regexp_replace(upper(k), '[^A-Z0-9_]+', '_', 'g'), '_');
      CONTINUE WHEN ph = '';

      -- Já ancorado: nada a fazer. Confere contra o HTML CORRENTE, porque
      -- uma troca anterior neste mesmo loop pode ter criado a âncora.
      IF novo ~ ('\{\{\s*' || ph || '\s*\}\}') THEN
        campos_meta := campos_meta || jsonb_build_object(
          'key', k, 'placeholder', ph, 'anchored_by', 'exact');
        CONTINUE;
      END IF;

      ex := btrim(coalesce(e->>'example', ''));
      esc := regexp_replace(ex, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g');

      -- Frase >= 4 chars (abaixo disso casa em qualquer canto) e ocorrência
      -- ÚNICA (duas, trocar uma seria adivinhar qual).
      IF length(ex) >= 4 AND regexp_count(novo, esc, 1, 'i') = 1 THEN
        -- Sem a flag 'g': troca só a ocorrência (que é única mesmo).
        -- `{{...}}` não tem \ nem & — seguro como texto de substituição.
        novo := regexp_replace(novo, esc, '{{' || ph || '}}', 'i');
        ancorados := ancorados + 1;
        tot_campo := tot_campo + 1;
        campos_meta := campos_meta || jsonb_build_object(
          'key', k, 'placeholder', ph, 'anchored_by', 'exact',
          'note', 'ancora: ' || left(ex, 80));
      ELSE
        tot_semlugar := tot_semlugar + 1;
        campos_meta := campos_meta || jsonb_build_object(
          'key', k, 'placeholder', ph, 'anchored_by', 'not_found');
        issues := issues || to_jsonb(
          'campo ' || k || ': sem tag e sem a frase do exemplo no HTML');
      END IF;
    END LOOP;

    CONTINUE WHEN ancorados = 0;   -- nada a propor: não mexe na variante

    UPDATE email_component_variants
    SET html_tagged = novo,
        tagging_status = 'pending',
        tagging_meta = jsonb_build_object(
          'model', 'mecanico_sql',
          'generated_at', now(),
          'previous_status', v.tagging_status,
          'fields', campos_meta,
          'issues', issues
        ),
        updated_at = now()
    WHERE id = v.id;

    tot_var := tot_var + 1;
    RAISE NOTICE '[%] % — +% ancorado(s)', v.block_type, v.name, ancorados;
  END LOOP;

  RAISE NOTICE '---';
  RAISE NOTICE '% variante(s) com proposta · % campo(s) ancorado(s) · % sem lugar na arte',
    tot_var, tot_campo, tot_semlugar;
END $$;


-- ============================================================
-- PARTE 3 — CONFERE. Como ficou cada variante depois.
-- `sem_tag` = campos que continuam sem âncora no HTML tagueado.
-- ============================================================
WITH v AS (
  SELECT id, name, block_type, tagging_status,
         coalesce(nullif(btrim(html_tagged), ''), coalesce(html, '')) AS eff,
         output_schema
  FROM email_component_variants
  WHERE is_active
    AND jsonb_typeof(output_schema) = 'array'
    AND jsonb_array_length(output_schema) > 0
),
campos AS (
  SELECT v.id, v.name, v.block_type, v.tagging_status, v.eff,
         btrim(regexp_replace(upper(btrim(coalesce(e->>'key',''))),
                              '[^A-Z0-9_]+', '_', 'g'), '_') AS ph,
         btrim(coalesce(e->>'key','')) AS k
  FROM v, jsonb_array_elements(v.output_schema) e
  WHERE coalesce(e->>'nature',
                 CASE WHEN e->>'type'='image' THEN 'imagem_gerada' ELSE 'copy' END)
        <> 'asset_fixo'
    AND btrim(coalesce(e->>'key','')) <> ''
)
SELECT block_type AS secao, name AS variante, tagging_status AS status,
       count(*) FILTER (WHERE eff ~ ('\{\{\s*' || ph || '\s*\}\}')) AS ancorados,
       count(*) AS campos,
       coalesce(string_agg(k, ', ') FILTER (
         WHERE NOT (eff ~ ('\{\{\s*' || ph || '\s*\}\}'))), '—') AS sem_tag
FROM campos
GROUP BY block_type, name, tagging_status
ORDER BY (count(*) FILTER (WHERE NOT (eff ~ ('\{\{\s*' || ph || '\s*\}\}')))) DESC,
         block_type, name;


-- ============================================================
-- PARTE 4 — DESFAZ (só se precisar). Devolve o status anterior e
-- descarta a proposta mecânica. O `html` de origem nunca foi tocado.
-- ============================================================
-- UPDATE email_component_variants
-- SET tagging_status = nullif(tagging_meta->>'previous_status', 'null'),
--     html_tagged = NULL,
--     tagging_meta = NULL,
--     updated_at = now()
-- WHERE tagging_meta->>'model' = 'mecanico_sql';
