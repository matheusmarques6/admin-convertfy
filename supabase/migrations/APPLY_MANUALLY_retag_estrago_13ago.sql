-- ============================================================
-- ESTRAGO DA PRIMEIRA EXECUÇÃO DO RETAG MECÂNICO (13/08)
--
-- A PARTE 2 original não tinha a trava "variante já alinhada não entra".
-- Para toda variante em que ela conseguiu ancorar ao menos um campo, ela
-- SOBRESCREVEU `html_tagged` com uma proposta derivada do `html` de ORIGEM
-- — inclusive nas que já estavam aprovadas e perfeitas. O `html` de origem
-- não foi tocado em nenhum caso.
--
-- Como aquela execução guardou só `previous_status` (não o `previous_html_tagged`),
-- o tagueado anterior NÃO É RECUPERÁVEL por SQL. Os dois caminhos de volta:
--
--   a) restaurar a tabela por PITR/backup do Supabase (exato, se o plano tiver);
--   b) rodar o Taguedor (LLM) nas afetadas e aprovar — o `html` de origem
--      está intacto, e é dele que o Taguedor parte de qualquer forma.
--
-- Rode a PARTE A para saber exatamente quem foi afetado antes de decidir.
-- ============================================================


-- ============================================================
-- PARTE A — QUEM FOI AFETADO, e o que era antes.
-- `perdeu_aprovacao = true` → estava aprovada e virou proposta pendente:
-- produção parou de usar o tagueado e voltou para o `html` de origem.
-- ============================================================
SELECT
  block_type AS secao,
  name AS variante,
  tagging_meta->>'previous_status' AS status_antes,
  tagging_status AS status_agora,
  (tagging_meta->>'previous_status') = 'approved'
    AND tagging_status <> 'approved' AS perdeu_aprovacao,
  jsonb_array_length(coalesce(tagging_meta->'fields', '[]'::jsonb)) AS campos,
  (SELECT count(*) FROM jsonb_array_elements(tagging_meta->'fields') f
    WHERE f->>'anchored_by' = 'not_found') AS sem_ancora_agora,
  tagging_meta ? 'previous_html_tagged' AS tem_backup
FROM email_component_variants
WHERE tagging_meta->>'model' = 'mecanico_sql'
ORDER BY
  ((tagging_meta->>'previous_status') = 'approved' AND tagging_status <> 'approved') DESC,
  block_type, name;


-- ============================================================
-- PARTE B — DESFAZER O QUE DÁ.
--
-- Devolve o status anterior. Onde a execução guardou o tagueado anterior
-- (`tem_backup = true` na PARTE A), restaura o HTML junto. Onde não guardou,
-- deixa `html_tagged` como está — apagar não melhora nada, e a proposta
-- mecânica, mesmo pior, ainda é melhor que NULL enquanto o Taguedor não roda.
--
-- Descomente para executar.
-- ============================================================
-- UPDATE email_component_variants
-- SET tagging_status = tagging_meta->>'previous_status',
--     html_tagged = coalesce(tagging_meta->>'previous_html_tagged', html_tagged),
--     tagging_meta = NULL,
--     updated_at = now()
-- WHERE tagging_meta->>'model' = 'mecanico_sql';


-- ============================================================
-- PARTE C — ANTES DE QUALQUER NOVA EXECUÇÃO: cópia de segurança.
-- Uma tabela, dois segundos, e o desfazer passa a ser exato.
-- ============================================================
-- CREATE TABLE email_component_variants_backup_13ago AS
-- SELECT id, html, html_tagged, tagging_status, tagging_meta, output_schema
-- FROM email_component_variants;
--
-- Restaurar a partir dela:
-- UPDATE email_component_variants v
-- SET html_tagged = b.html_tagged,
--     tagging_status = b.tagging_status,
--     tagging_meta = b.tagging_meta,
--     updated_at = now()
-- FROM email_component_variants_backup_13ago b
-- WHERE b.id = v.id;
