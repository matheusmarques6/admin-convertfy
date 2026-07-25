-- Enable Supabase Realtime for the CRM pipeline board tables.
-- Sem isto, subscriptions em `deals`/`pipeline_stages` nunca recebem eventos,
-- e o board (pipeline-board-view) so atualiza com refresh manual.
--
-- deals: board reage a novos deals (lead cadastrado via form/webhook),
--        mudanca de etapa (move) e arquivamento/exclusao.
-- pipeline_stages: board reage a criacao/edicao/remocao de etapas por
--                  outro usuario na mesma pipeline.
--
-- Idempotente: so adiciona a tabela a publication se ainda nao estiver la.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'deals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE deals;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'pipeline_stages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pipeline_stages;
  END IF;
END $$;
