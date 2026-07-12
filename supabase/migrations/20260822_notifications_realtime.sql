-- ============================================================
-- Realtime para notificações do admin
--
-- Adiciona `notifications` e `report_jobs` à publication
-- supabase_realtime para o badge unificado (useUnifiedNotifications)
-- receber postgres_changes em vez de depender só de polling (30s no
-- sino; 5s/30s nos reports — que permanecem como fallback).
--
-- RLS continua sendo a autoridade do que cada cliente recebe:
--  - notifications: SELECT só do próprio user_id (001_events_system)
--  - report_jobs:   SELECT por org (20260318_02_report_jobs)
-- O cliente ainda filtra notifications por user_id=eq.<uid> no canal.
--
-- Idempotente: checa pg_publication_tables antes de adicionar
-- (mesmo padrão da 20260812_whatsapp_core_messaging_3).
-- ============================================================

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['notifications', 'report_jobs'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END $$;
