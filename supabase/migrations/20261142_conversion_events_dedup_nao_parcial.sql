-- Fila de conversão: o índice de dedupe deixa de ser PARCIAL.
--
-- O índice nasceu como
--   CREATE UNIQUE INDEX uq_crm_conversion_events_dedup
--     ON crm_conversion_events (submission_id, platform, event_name)
--     WHERE (submission_id IS NOT NULL);
--
-- O predicado não acrescenta NADA: num índice único btree o NULL já é
-- distinto de qualquer outro NULL, então linhas com `submission_id` nulo
-- nunca conflitam, com ou sem o WHERE. O que ele faz é quebrar o
-- `ON CONFLICT`: o Postgres só consegue inferir um índice parcial quando
-- a statement repete o predicado, e o `on_conflict=` do PostgREST manda
-- apenas a lista de colunas. Resultado:
--
--   42P10: there is no unique or exclusion constraint matching the
--          ON CONFLICT specification
--
-- Medido em produção: de 06/08 a 29/08 de 2026, treze cadastros do
-- formulário "Pagina de vendas" e ZERO linhas na fila — o evento "Lead"
-- perdido junto com o "LeadQualificado", sem nada em tela.
--
-- O código do enqueue NÃO depende desta migration (passou a inserir
-- linha a linha tolerando 23505, que é imune ao formato do índice). Ela
-- existe para que `ON CONFLICT` volte a ser utilizável por quem vier
-- depois — a armadilha some do banco em vez de ficar esperando o
-- próximo.

BEGIN;

DROP INDEX IF EXISTS uq_crm_conversion_events_dedup;

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_conversion_events_dedup
  ON public.crm_conversion_events (submission_id, platform, event_name);

COMMENT ON INDEX public.uq_crm_conversion_events_dedup IS
  'Dedupe da fila de conversão. NÃO tornar parcial: o predicado quebra o ON CONFLICT (42P10) sem impedir nada, porque NULL já é distinto em índice único.';

COMMIT;
