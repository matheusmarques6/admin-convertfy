-- ============================================================
-- Story CM-7 — sinais de curadoria na listagem de logs.
--
-- A página de logs mostra `parsed_output` como JSON cru no drawer de
-- detalhe. Dados importantes já existem lá e ninguém vê: o
-- `candidates_excluded_untagged` (variantes ativas que ficaram fora do pool
-- por não ter placeholder) está gravado desde o épico Taguedor e nunca foi
-- exibido.
--
-- A listagem NÃO seleciona `parsed_output` de propósito: ele carrega
-- snapshots de HTML e pesaria dezenas de KB por linha. Então os sinais são
-- derivados aqui, na view, como colunas escalares — mesmo padrão que o
-- `is_qa_vision` já usa.
--
-- Nada aqui é erro: o email foi entregue. São sinais de CURADORIA —
-- biblioteca incompleta para uma seção, exemplo de acabamento velho,
-- ranking sendo corrigido. Por isso viram selo na linha, não notificação.
--
-- Idempotente (CREATE OR REPLACE). Rollback: recriar a view sem as 4
-- colunas finais.
-- ============================================================

CREATE OR REPLACE VIEW v_email_generation_logs AS
SELECT
  r.id,
  r.created_at,
  r.batch_id,
  r.agent,
  r.model,
  r.status,
  r.tokens_input,
  r.tokens_output,
  r.cost_cents,
  r.duration_ms,
  r.retry_count,
  r.error_message,
  r.input_vars,
  r.parsed_output,
  r.store_id,
  s.store_name,
  r.email_id,
  e.name        AS email_name,
  e.number      AS email_position,
  r.flow_id,
  f.flow_type,
  -- QA Vision derivado: marca runs de agent='qa' que executaram
  -- vision check (subetapa). qa.chain.ts grava parsed_output.vision_ran
  -- a partir desta migration. Rows antigas ficam false.
  (r.agent = 'qa' AND COALESCE((r.parsed_output->>'vision_ran')::boolean, false))
    AS is_qa_vision,

  -- ── Sinais de curadoria (CM-7) ────────────────────────────────────
  -- Todos com COALESCE + jsonb_typeof: run antigo sem o campo, ou com o
  -- campo em outro tipo, resolve para 0/false em vez de quebrar a view.

  -- Posições que saíram do email: sem variante na biblioteca (montagem) ou
  -- sem finalista válido depois do retry (Curador).
  CASE
    WHEN jsonb_typeof(r.parsed_output->'blocks_skipped') = 'array'
      THEN jsonb_array_length(r.parsed_output->'blocks_skipped')
    WHEN jsonb_typeof(r.parsed_output->'empty_blocks') = 'array'
      THEN jsonb_array_length(r.parsed_output->'empty_blocks')
    ELSE 0
  END AS curation_skipped_blocks,

  -- Variantes ativas SEM {{PLACEHOLDER}} no HTML efetivo: impreenchíveis
  -- pelo pipeline, ficam fora do pool. O objeto é {block_type: [nomes]} —
  -- soma os nomes de todos os tipos.
  CASE
    WHEN jsonb_typeof(r.parsed_output->'candidates_excluded_untagged') = 'object'
      THEN (
        SELECT COALESCE(SUM(
          CASE WHEN jsonb_typeof(v.value) = 'array'
            THEN jsonb_array_length(v.value) ELSE 0 END
        ), 0)
        FROM jsonb_each(r.parsed_output->'candidates_excluded_untagged') AS v
      )
    ELSE 0
  END AS curation_excluded_untagged,

  -- Posições em que o Montador não ficou com o 1º do Curador. Mede se o
  -- Curador está rankeando bem — não é problema por si.
  CASE
    WHEN jsonb_typeof(r.parsed_output->'desvios') = 'number'
      THEN (r.parsed_output->>'desvios')::int
    ELSE 0
  END AS curation_rank_deviations,

  -- Exemplo renderizado da variante descartado por estar desatualizado
  -- (hash de origem — CM-6). Enquanto aquela story não roda, fica sempre
  -- false: o campo não existe.
  COALESCE(
    (r.parsed_output->'rendered_reference'->>'stale')::boolean,
    false
  ) AS curation_rendered_stale

FROM email_generation_runs r
LEFT JOIN client_stores      s ON s.id = r.store_id
LEFT JOIN email_flow_emails  e ON e.id = r.email_id
LEFT JOIN email_flows        f ON f.id = r.flow_id;

-- View só é lida via createAdminClient (service role).
