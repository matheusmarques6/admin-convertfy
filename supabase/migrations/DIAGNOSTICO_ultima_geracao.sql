-- ============================================================
-- "Por que o email saiu com {{PLACEHOLDER}} cru?" — inputs e outputs
-- da ÚLTIMA geração, consulta a consulta.
--
-- Nada aqui escreve. Rode uma query por vez: o editor do Supabase só
-- mostra o resultado do ÚLTIMO statement.
--
-- Toda query começa pelo mesmo `alvo`: o email do run mais recente.
-- Não precisa digitar id nenhum — se quiser fixar um email específico,
-- troque o corpo do CTE por `SELECT '<uuid>'::uuid AS email_id, ...`.
--
-- Ordem de leitura (é a ordem da cadeia):
--   Q1  timeline      — quem rodou, quanto demorou, quem falhou
--   Q2  INPUT do n8n  — o contrato de copy que saiu, bloco a bloco
--   Q3  INPUT×OUTPUT  — o cruzamento decisivo: pedido vs. respondido
--   Q4  copy_merge    — quantos slots o código conseguiu preencher
--   Q5  callback      — adesão ao contrato e desvios de chave
--   Q6  copy_dispatch — blocos que saíram sem schema
--   Q7  HTML final    — os placeholders que sobraram na tela
-- ============================================================


-- ── Q1 · Timeline da geração ────────────────────────────────
-- Um run por agente. `copy_dispatch` é da LOJA (não tem email_id),
-- por isso entra pela janela de tempo.
--
-- O que olhar: algum `error`? algum `skipped` inesperado? `text_format`
-- skipped é BOM (significa que o copy_merge resolveu tudo por código).

WITH alvo AS (
  SELECT email_id, store_id, created_at AS t0
  FROM email_generation_runs
  WHERE email_id IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1
)
SELECT
  to_char(r.created_at, 'HH24:MI:SS')            AS hora,
  r.agent,
  r.status,
  COALESCE(r.model, '—')                         AS modelo,
  round(r.duration_ms / 1000.0, 1)               AS seg,
  r.tokens_input                                 AS tok_in,
  r.tokens_output                                AS tok_out,
  left(COALESCE(r.error_message, ''), 200)       AS erro,
  r.id                                           AS run_id
FROM email_generation_runs r, alvo a
WHERE (r.email_id = a.email_id
       OR (r.email_id IS NULL AND r.store_id = a.store_id))
  AND r.created_at BETWEEN a.t0 - interval '3 hours' AND a.t0 + interval '1 hour'
ORDER BY r.created_at;


-- ── Q2 · INPUT: o contrato de copy que foi enviado ──────────
-- `email_blocks.fields` é o contrato: cada campo tem uma `key` (o que o
-- n8n deve devolver) e uma `tag` (onde isso entra no HTML).
--
-- O que olhar:
--   variante NULL      → bloco sem variante casada. Erro de curadoria:
--                        sem schema o n8n inventa as chaves.
--   n_campos = 0       → bloco saiu sem contrato nenhum.
--   tag = —            → campo sem endereço no HTML: a copy volta e não
--                        tem onde entrar (é o bug do schema × placeholder).

WITH alvo AS (
  SELECT email_id FROM email_generation_runs
  WHERE email_id IS NOT NULL ORDER BY created_at DESC LIMIT 1
)
SELECT
  b.position                                     AS pos,
  b.block_type                                   AS tipo,
  b.label,
  COALESCE(v.name, '⚠ SEM VARIANTE')             AS variante,
  jsonb_array_length(COALESCE(b.fields, '[]'::jsonb)) AS n_campos,
  (
    SELECT string_agg(
             (f->>'key') || ' → {{' || COALESCE(f->>'tag', '—') || '}}',
             E'\n' ORDER BY ord
           )
    FROM jsonb_array_elements(COALESCE(b.fields, '[]'::jsonb))
         WITH ORDINALITY AS x(f, ord)
  )                                              AS contrato,
  b.id                                           AS block_id
FROM email_blocks b
LEFT JOIN email_component_variants v ON v.id = b.variant_id, alvo a
WHERE b.email_id = a.email_id
ORDER BY b.position;


-- ── Q3 · INPUT × OUTPUT: o cruzamento que responde tudo ─────
-- Compara as keys PEDIDAS (fields, natureza copy) com as keys que o n8n
-- REALMENTE devolveu (content, valor não-vazio).
--
-- Como ler:
--   atendidas = pedidas          → o n8n respeitou o contrato.
--   pedidas_sem_resposta cheio   → o n8n não gerou aquelas chaves.
--   veio_fora_do_contrato cheio  → o n8n respondeu em OUTRO vocabulário
--                                  (`headline` em vez de `hero_headline`).
--   os DOIS cheios ao mesmo tempo = vocabulários diferentes nas duas
--   pontas. É a assinatura do placeholder cru na tela.

WITH alvo AS (
  SELECT email_id FROM email_generation_runs
  WHERE email_id IS NOT NULL ORDER BY created_at DESC LIMIT 1
),
blk AS (
  SELECT b.id, b.position, b.block_type, b.label,
         COALESCE(b.fields, '[]'::jsonb) AS fields,
         COALESCE(b.content, '{}'::jsonb) AS content
  FROM email_blocks b, alvo a
  WHERE b.email_id = a.email_id
),
-- Só campos de COPY: imagem gerada e asset fixo não vêm do n8n.
pedidas AS (
  SELECT k.id, f->>'key' AS key
  FROM blk k, jsonb_array_elements(k.fields) f
  WHERE COALESCE(
          f->>'nature',
          CASE WHEN f->>'type' = 'image' THEN 'imagem_gerada' ELSE 'copy' END
        ) = 'copy'
    AND COALESCE(btrim(f->>'key'), '') <> ''
),
-- Chave só conta como respondida se veio com valor. String vazia é o
-- mesmo que ausência: o slot fica sem conteúdo e o formatador remove a linha.
recebidas AS (
  SELECT k.id, o.key
  FROM blk k, jsonb_each_text(k.content) o
  WHERE COALESCE(btrim(o.value), '') <> ''
)
SELECT
  k.position                                     AS pos,
  k.block_type                                   AS tipo,
  k.label,
  (SELECT count(*) FROM pedidas p WHERE p.id = k.id)   AS pedidas,
  (SELECT count(*) FROM pedidas p
     JOIN recebidas r ON r.id = p.id AND r.key = p.key
   WHERE p.id = k.id)                                  AS atendidas,
  COALESCE((
    SELECT string_agg(p.key, ' · ' ORDER BY p.key)
    FROM pedidas p
    WHERE p.id = k.id
      AND NOT EXISTS (SELECT 1 FROM recebidas r WHERE r.id = p.id AND r.key = p.key)
  ), '—')                                        AS pedidas_sem_resposta,
  COALESCE((
    SELECT string_agg(r.key, ' · ' ORDER BY r.key)
    FROM recebidas r
    WHERE r.id = k.id
      AND NOT EXISTS (SELECT 1 FROM pedidas p WHERE p.id = r.id AND p.key = r.key)
  ), '—')                                        AS veio_fora_do_contrato
FROM blk k
ORDER BY k.position;


-- ── Q4 · copy_merge: quanto o CÓDIGO conseguiu preencher ────
-- Este estágio troca placeholder por copy sem LLM nenhum, ancorando por
-- `fields.tag`. É o termômetro do alinhamento schema × HTML.
--
--   slots_total       — placeholders de texto no documento (fora a hero)
--   merged            — quantos foram preenchidos por código
--   left_for_llm      — placeholders que ficaram vazios (viram slot_vazio
--                       no verificador e a linha tende a ser REMOVIDA)
--   unanchored_keys   — copy que voltou e não tinha endereço no HTML
--   keys_via_canonical— copy que só entrou pela ponte de vocabulário do
--                       tag-registry. Quando isso zerar, a ponte morre.

WITH alvo AS (
  SELECT email_id FROM email_generation_runs
  WHERE email_id IS NOT NULL ORDER BY created_at DESC LIMIT 1
)
SELECT
  to_char(r.created_at, 'HH24:MI:SS')                       AS hora,
  r.status,
  r.parsed_output->>'slots_total'                           AS slots_total,
  r.parsed_output->>'merged'                                AS merged,
  jsonb_array_length(COALESCE(r.parsed_output->'left_for_llm', '[]'))    AS n_vazios,
  r.parsed_output->'left_for_llm'                           AS left_for_llm,
  r.parsed_output->'unanchored_keys'                        AS unanchored_keys,
  r.parsed_output->'keys_via_canonical'                     AS keys_via_canonical,
  r.parsed_output->'structural_out'                         AS structural_out
FROM email_generation_runs r, alvo a
WHERE r.email_id = a.email_id
  AND r.agent = 'copy_merge'
ORDER BY r.created_at DESC;


-- ── Q5 · Callback do n8n: adesão ao contrato e desvios ──────
-- `contrato.taxa_pct` = % das chaves recebidas que existem no contrato.
-- 0% com chaves recebidas > 0 significa que o flow do n8n ainda está no
-- vocabulário antigo (`headline`/`cta`) — precisa ser atualizado lá.
--
-- kind dos desvios:
--   unknown_key  — chave devolvida que o contrato não pediu
--   sem_contrato — bloco enviado sem fields (erro de curadoria)

WITH alvo AS (
  SELECT email_id FROM email_generation_runs
  WHERE email_id IS NOT NULL ORDER BY created_at DESC LIMIT 1
),
run AS (
  SELECT r.*
  FROM email_generation_runs r, alvo a
  WHERE r.email_id = a.email_id AND r.agent = 'copy'
  ORDER BY r.created_at DESC
  LIMIT 1
)
SELECT
  to_char(run.created_at, 'HH24:MI:SS')          AS hora,
  run.parsed_output->'contrato'                  AS contrato,
  d->>'position'                                 AS pos,
  d->>'type'                                     AS tipo,
  d->>'kind'                                     AS desvio,
  d->>'key'                                      AS chave
FROM run
LEFT JOIN LATERAL jsonb_array_elements(
  COALESCE(run.parsed_output->'desvios', '[]'::jsonb)
) d ON true
ORDER BY (d->>'position')::int NULLS FIRST, d->>'key';


-- ── Q6 · copy_dispatch: o que saiu quebrado do nosso lado ───
-- Roda por LOJA, antes do n8n. `blocos_sem_schema` e `fields_sem_tag` são
-- erros de CURADORIA — o email já sai errado daqui, independente do n8n.
-- `payload` guarda o envio na íntegra (esqueleto acima de 1 MB).

WITH alvo AS (
  SELECT store_id, created_at AS t0 FROM email_generation_runs
  WHERE email_id IS NOT NULL ORDER BY created_at DESC LIMIT 1
)
SELECT
  to_char(r.created_at, 'DD/MM HH24:MI')         AS quando,
  r.status,
  r.parsed_output->>'trigger_source'             AS origem,
  r.parsed_output->>'email_count'                AS emails,
  jsonb_array_length(COALESCE(r.parsed_output->'blocos_sem_schema','[]')) AS n_sem_schema,
  r.parsed_output->'blocos_sem_schema'           AS blocos_sem_schema,
  r.parsed_output->'fields_sem_tag'              AS fields_sem_tag,
  r.parsed_output->'blocos_omitidos'             AS blocos_omitidos,
  r.id                                           AS run_id
FROM email_generation_runs r, alvo a
WHERE r.store_id = a.store_id
  AND r.agent = 'copy_dispatch'
  AND r.created_at >= a.t0 - interval '24 hours'
ORDER BY r.created_at DESC;


-- ── Q7 · O que sobrou na tela ───────────────────────────────
-- Placeholders crus no HTML final. Cada linha aqui é uma caixa vazia (ou
-- um `{{TAG}}` literal) que o cliente veria.
--
-- Cruze com a Q3: placeholder aqui + `pedidas_sem_resposta` lá = o n8n
-- não gerou; placeholder aqui + `veio_fora_do_contrato` lá = gerou com
-- outro nome; placeholder aqui e nada lá = o campo nem está no schema.

WITH alvo AS (
  SELECT email_id FROM email_generation_runs
  WHERE email_id IS NOT NULL ORDER BY created_at DESC LIMIT 1
),
e AS (
  SELECT ef.id, ef.name, ef.status, ef.html_pipeline_stage,
         COALESCE(ef.html, '') AS html
  FROM email_flow_emails ef, alvo a
  WHERE ef.id = a.email_id
)
SELECT
  e.name                                         AS email,
  e.status,
  COALESCE(e.html_pipeline_stage, '—')           AS ultimo_step,
  length(e.html)                                 AS html_chars,
  m[1]                                           AS placeholder_cru,
  count(*)                                       AS ocorrencias
FROM e, regexp_matches(e.html, '\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}', 'g') m
GROUP BY 1, 2, 3, 4, 5
ORDER BY 5;
