-- O índice de dedupe dos eventos de sessão deixa de ser PARCIAL.
--
-- Medido em produção em 17/09: duas sessões reais no `/forms/diagnostico`,
-- com respostas gravadas, e **zero linhas** em `form_session_events`. A
-- causa é a mesma de 05/08 na fila de conversão da Meta, três semanas
-- depois, em outra tabela:
--
--   ERROR: 42P10: there is no unique or exclusion constraint matching the
--   ON CONFLICT specification
--
-- O Postgres só infere um índice PARCIAL quando a statement REPETE o
-- predicado, e o `on_conflict=` do PostgREST manda apenas a lista de
-- colunas. Toda gravação de evento falhava, e o código só fazia
-- `log.warn` — silencioso por desenho.
--
-- O prejuízo é o produto da aba Resultados: o funil por pergunta ("quantos
-- VIRAM contra quantos RESPONDERAM", que é como se acha a pergunta que faz
-- desistir) ficaria vazio para sempre.
--
-- O predicado não impedia nada: em índice único btree os NULL são
-- distintos entre si, então evento sem `event_key` continua podendo
-- repetir com ou sem ele. Ele só quebrava o `ON CONFLICT` — exatamente a
-- conclusão da 20261142. A armadilha sai do banco em vez de esperar a
-- próxima tabela.

drop index if exists public.uq_form_session_events_key;

create unique index if not exists uq_form_session_events_key
  on public.form_session_events (session_id, event_key);

comment on index public.uq_form_session_events_key is
  'Dedupe do reenvio do lote. NAO pode voltar a ser parcial: o ON CONFLICT do PostgREST manda so as colunas e um indice parcial devolve 42P10 (ver 20261142).';

-- ── A mesma armadilha em `refunds`, achada pela varredura ────────────────
--
-- `refund.service.ts` faz `upsert(..., { onConflict: "asaas_refund_id" })`
-- contra `idx_refunds_asaas_refund_id`, que é PARCIAL. É o ramo
-- RETROATIVO (webhook de reembolso sem o registro pendente do admin):
-- hoje ele toma 42P10 e o registro nunca nasce. A tabela está vazia (0
-- linhas), então o caminho nunca rodou de verdade em produção.
--
-- Mesmo remédio e mesma razão: NULL já é distinto em índice único btree,
-- o predicado não impedia nada e só quebrava a inferência.

drop index if exists public.idx_refunds_asaas_refund_id;

create unique index if not exists idx_refunds_asaas_refund_id
  on public.refunds (asaas_refund_id);

comment on index public.idx_refunds_asaas_refund_id is
  'Idempotencia do reembolso vindo do Asaas. NAO pode ser parcial: o ON CONFLICT do PostgREST manda so as colunas (42P10).';
