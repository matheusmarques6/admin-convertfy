-- ============================================================
-- REMOVER A CAMADA `html_tagged` DA BIBLIOTECA — DEFINITIVO
--
-- O schema é o mapa e o `html` é o documento. A camada tagueada
-- (`html_tagged` + `tagging_status` + `tagging_meta`) era o SEGUNDO
-- documento, o que fazia a ponte entre o schema e a arte, e é ela que sai.
--
-- O `html` de origem NÃO é tocado. As tags que já estão nele são a arte e
-- continuam lá.
--
-- Sem backup, por decisão: o conteúdo destas três colunas é descartado e não
-- há como voltar.
--
-- Depois disto, `effectiveVariantHtml` passa a servir o `html` para todas as
-- variantes — não existe mais um segundo documento para escolher.
-- ============================================================

UPDATE email_component_variants
SET html_tagged = NULL,
    tagging_status = NULL,
    tagging_meta = NULL,
    updated_at = now()
WHERE html_tagged IS NOT NULL
   OR tagging_status IS NOT NULL
   OR tagging_meta IS NOT NULL;


-- Confere: tem de vir 0 em tudo.
SELECT count(*) FILTER (WHERE html_tagged IS NOT NULL)    AS com_tagueado,
       count(*) FILTER (WHERE tagging_status IS NOT NULL) AS com_status,
       count(*) FILTER (WHERE tagging_meta IS NOT NULL)   AS com_relatorio
FROM email_component_variants;


-- Como a biblioteca ficou, medida sobre o `html` — que agora é o único
-- documento. `ancorados` são os campos do schema com endereço na arte.
WITH v AS (
  SELECT name, block_type, coalesce(html, '') AS h,
         coalesce(output_schema, '[]'::jsonb) AS sch
  FROM email_component_variants
  WHERE is_active AND jsonb_array_length(coalesce(output_schema, '[]'::jsonb)) > 0
),
campos AS (
  SELECT v.name, v.block_type, v.h,
         btrim(regexp_replace(upper(btrim(coalesce(e->>'key',''))),
                              '[^A-Z0-9_]+', '_', 'g'), '_') AS ph
  FROM v, jsonb_array_elements(v.sch) e
  WHERE btrim(coalesce(e->>'key','')) <> ''
    AND coalesce(e->>'nature',
          CASE WHEN e->>'type' = 'image' THEN 'imagem_gerada' ELSE 'copy' END
        ) <> 'asset_fixo'
)
SELECT block_type AS secao, name AS variante,
       count(*) FILTER (WHERE h ~ ('\{\{\s*' || ph || '\s*\}\}')) AS ancorados,
       count(*) AS campos
FROM campos
GROUP BY 1,2
ORDER BY (count(*) FILTER (WHERE h ~ ('\{\{\s*' || ph || '\s*\}\}')))::float / count(*),
         secao, variante;
