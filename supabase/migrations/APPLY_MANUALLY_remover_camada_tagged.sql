-- ============================================================
-- REMOVER A CAMADA `html_tagged` DA BIBLIOTECA
--
-- Decisão: o schema é o mapa e o `html` é o documento. A camada tagueada —
-- `html_tagged` + `tagging_status` + `tagging_meta` — era o SEGUNDO documento,
-- o que fazia a ponte entre o schema e a arte, e é ela que sai.
--
-- O `html` de origem NÃO é tocado em nenhuma parte deste arquivo. As tags que
-- já estão nele continuam lá — são a arte.
--
-- O que muda em produção: `effectiveVariantHtml` devolve `html_tagged` quando
-- a tag está aprovada, senão `html`. Sem `html_tagged`, toda variante passa a
-- servir o `html`. Para as 5 que hoje estão "prontas" pelo tagueado, isso é
-- uma TROCA DE DOCUMENTO — e é exatamente o que a PARTE 2 mede.
--
-- ORDEM: PARTE 1 (backup) → PARTE 2 (medir) → decidir → PARTE 3 (apagar).
-- ============================================================


-- ============================================================
-- PARTE 1 — BACKUP. Rode primeiro. Dois segundos.
-- Sem isto a exclusão é irreversível: `html_tagged` não é recuperável de
-- lugar nenhum (foi a lição de 13/08, que custou 4 variantes).
-- ============================================================
CREATE TABLE IF NOT EXISTS email_component_variants_bkp_tagged AS
SELECT id, name, html_tagged, tagging_status, tagging_meta, now() AS backup_em
FROM email_component_variants;

SELECT count(*) AS linhas_no_backup,
       count(*) FILTER (WHERE btrim(coalesce(html_tagged,'')) <> '') AS com_tagueado,
       count(*) FILTER (WHERE tagging_status = 'approved') AS aprovadas
FROM email_component_variants_bkp_tagged;


-- ============================================================
-- PARTE 2 — MEDIR. O que a biblioteca vira SEM a camada tagueada.
--
-- Audita cada variante contra o `html` de origem — que é o que produção vai
-- servir depois da PARTE 3. `perde` diz quantos campos estavam ancorados hoje
-- e deixam de estar.
-- ============================================================
WITH v AS (
  SELECT id, name, block_type, tagging_status,
         coalesce(html, '') AS origem,
         CASE WHEN tagging_status = 'approved' AND btrim(coalesce(html_tagged,'')) <> ''
              THEN html_tagged ELSE coalesce(html, '') END AS hoje,
         coalesce(output_schema, '[]'::jsonb) AS sch
  FROM email_component_variants
  WHERE is_active AND jsonb_array_length(coalesce(output_schema, '[]'::jsonb)) > 0
),
campos AS (
  SELECT v.name, v.block_type, v.tagging_status, v.origem, v.hoje,
         btrim(regexp_replace(upper(btrim(coalesce(e->>'key',''))),
                              '[^A-Z0-9_]+', '_', 'g'), '_') AS ph
  FROM v, jsonb_array_elements(v.sch) e
  WHERE btrim(coalesce(e->>'key','')) <> ''
    AND coalesce(e->>'nature',
          CASE WHEN e->>'type' = 'image' THEN 'imagem_gerada' ELSE 'copy' END
        ) <> 'asset_fixo'
)
SELECT block_type AS secao, name AS variante, tagging_status AS status_hoje,
       count(*) AS campos,
       count(*) FILTER (WHERE hoje   ~ ('\{\{\s*' || ph || '\s*\}\}')) AS ancorados_hoje,
       count(*) FILTER (WHERE origem ~ ('\{\{\s*' || ph || '\s*\}\}')) AS ancorados_depois,
       count(*) FILTER (WHERE hoje ~ ('\{\{\s*' || ph || '\s*\}\}')
                          AND NOT (origem ~ ('\{\{\s*' || ph || '\s*\}\}'))) AS perde
FROM campos
GROUP BY 1,2,3
ORDER BY perde DESC, secao, variante;


-- ============================================================
-- PARTE 3 — APAGAR. Só depois de ler a PARTE 2.
--
-- Zera a camada tagueada de TODAS as variantes. O `html` não é tocado.
-- Descomente para executar.
-- ============================================================
-- UPDATE email_component_variants
-- SET html_tagged = NULL,
--     tagging_status = NULL,
--     tagging_meta = NULL,
--     updated_at = now()
-- WHERE html_tagged IS NOT NULL
--    OR tagging_status IS NOT NULL
--    OR tagging_meta IS NOT NULL;


-- ============================================================
-- PARTE 4 — VOLTAR ATRÁS, se precisar. Restaura do backup da PARTE 1.
-- ============================================================
-- UPDATE email_component_variants v
-- SET html_tagged = b.html_tagged,
--     tagging_status = b.tagging_status,
--     tagging_meta = b.tagging_meta,
--     updated_at = now()
-- FROM email_component_variants_bkp_tagged b
-- WHERE b.id = v.id;
