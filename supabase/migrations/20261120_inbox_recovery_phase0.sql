-- ============================================================
-- Inbox — recuperação, FASE 0: estancar o custo no banco
-- ============================================================
-- Contexto (medido em 05/09/2026, pg_stat_statements desde 15/07):
--
--  1. O cron `whatsapp-reprocess-webhooks` faz `count exact` de
--     `status='dead'` a cada minuto. O índice parcial existe, mas o
--     PostgREST manda `status = $1` e o Postgres, no plano GENÉRICO,
--     não consegue provar o predicado do índice parcial → seq scan.
--     Medido: 916 ms por execução, 74.047 execuções, 372 min de CPU.
--     Correção: índice NÃO parcial em (status, received_at) — este o
--     plano genérico usa — e, no código, contagem por RPC com LITERAL.
--
--  2. `crm_webhook_events` tem 12 linhas vivas e 266 MB (250 MB de
--     TOAST): resíduo do backlog de payloads crus com mídia base64 da
--     Evolution. VACUUM comum não devolve isso — só rewrite.
--
--  3. 8 eventos presos em `processing` desde 15/07: o claim só
--     reivindica pending/failed e o prune só apaga `done`, então
--     `processing` nunca é recuperado nem removido.
--
--  4. `notifications` com 18.023 não lidas (17.312 = "onboarding
--     travado", cron diário × 11 membros, nunca lidas). O sino carrega
--     todas as linhas do usuário; o clear/dedup de alerta de canal
--     filtra por `metadata->>` sem índice (516 ms, 2× por canal a cada
--     5 min).
--
-- Ordem de aplicação — TRÊS "Run" separados no SQL editor:
--   Run 1: operacional (VACUUM FULL, índices CONCURRENTLY, autovacuum)
--   Run 2: transacional (recuperação, retenção, RPCs, índice, backlog)
--   Run 3: publication (lock em tabela quente — janela de baixo tráfego)
--
-- Idempotente: rodável mais de uma vez.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- RUN 1 — operacional (NÃO roda dentro de transação)
-- ════════════════════════════════════════════════════════════

-- 1.1 Recupera o bloat de heap + TOAST. Só rewrite devolve espaço de
-- TOAST; a tabela tem ~12 linhas, então é instantâneo. Pega
-- AccessExclusiveLock — rodar com o WhatsApp desconectado ou fora de
-- pico (só o INSERT do webhook do Instagram concorre).
VACUUM FULL VERBOSE crm_webhook_events;

-- 1.2 Tabela de fila tem churn alto: o default de 20% deixa o bloat
-- crescer entre vacuums. TOAST idem (é onde a mídia base64 mora).
ALTER TABLE crm_webhook_events SET (
  autovacuum_vacuum_scale_factor = 0.01,
  autovacuum_vacuum_threshold = 50,
  autovacuum_analyze_scale_factor = 0.02,
  toast.autovacuum_vacuum_scale_factor = 0.01,
  toast.autovacuum_vacuum_threshold = 50
);

-- 1.3 O índice que o PLANO GENÉRICO consegue usar. Os parciais
-- (idx_crm_webhook_events_retry/_done/_dead) continuam servindo às
-- queries com literal; este cobre `status = $1` vindo do PostgREST.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_webhook_events_status_received
  ON crm_webhook_events (status, received_at);

-- 1.4 Dedup de mensagem por external_id: hoje o único índice com
-- external_id é UNIQUE (thread_id, external_id) — a busca por
-- (org_id, external_id) varre o índice inteiro. É a query mais chamada
-- da ingestão (1× por inbound + 3-4× por status da Meta).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_messages_org_external
  ON crm_messages (org_id, external_id);

-- 1.5 Roteamento do webhook: crm_channels tem UNIQUE (org_id, type,
-- external_id) — sem a coluna líder, o lookup por type+external_id
-- varre. Tabela pequena, mas é 1 seq scan por evento.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_channels_type_external_active
  ON crm_channels (type, external_id) WHERE is_active = TRUE;


-- ════════════════════════════════════════════════════════════
-- RUN 2 — transacional
-- ════════════════════════════════════════════════════════════

-- ── 2.1 Eventos presos em `processing` ─────────────────────────────
-- Lease expirado há semanas. Vão para `dead` (não `failed`) de
-- propósito: são mensagens de julho e reprocessá-las agora encheria o
-- inbox e o sino com conversas de dois meses atrás. O payload fica
-- disponível pela retenção de 14 dias abaixo, para reprocesso manual.
UPDATE crm_webhook_events
   SET status = 'dead',
       in_flight_until = NULL,
       updated_at = now(),
       last_error = COALESCE(last_error || ' | ', '')
                 || 'recuperado pela fase 0: preso em processing desde '
                 || received_at::date
 WHERE status = 'processing'
   AND in_flight_until IS NOT NULL
   AND in_flight_until < now() - interval '24 hours';

-- ── 2.2 Retenção real da fila ──────────────────────────────────────
-- A fila não é histórico. Antes só apagava `done` > 7 dias, e
-- `failed`/`dead`/`processing` cresciam para sempre — engordando
-- justamente a tabela que o cron varre por minuto.
CREATE OR REPLACE FUNCTION prune_crm_webhook_events(p_batch_size INTEGER DEFAULT 500)
RETURNS TABLE(events_pruned BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cnt BIGINT;
BEGIN
  -- Worker morto no meio: devolve para a fila em vez de deixar preso.
  UPDATE crm_webhook_events
     SET status = 'failed',
         in_flight_until = NULL,
         updated_at = now()
   WHERE status = 'processing'
     AND in_flight_until IS NOT NULL
     AND in_flight_until < now() - interval '1 hour';

  DELETE FROM crm_webhook_events
   WHERE id IN (
     SELECT id FROM crm_webhook_events
      WHERE (status = 'done' AND processed_at < now() - interval '24 hours')
         OR (status IN ('failed', 'dead') AND updated_at < now() - interval '14 days')
      ORDER BY received_at ASC
      LIMIT p_batch_size
   );
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN QUERY SELECT cnt;
END;
$$;

-- ── 2.3 Saúde da fila sem contagem cara ────────────────────────────
-- LITERAIS: dentro da função o planner usa os índices parciais. É o
-- substituto do `count exact` do cron.
CREATE OR REPLACE FUNCTION crm_webhook_queue_stats()
RETURNS TABLE(
  pending BIGINT,
  failed BIGINT,
  processing BIGINT,
  dead BIGINT,
  oldest_pending_age_seconds DOUBLE PRECISION
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*) FILTER (WHERE status = 'pending'),
    count(*) FILTER (WHERE status = 'failed'),
    count(*) FILTER (WHERE status = 'processing'),
    count(*) FILTER (WHERE status = 'dead'),
    EXTRACT(EPOCH FROM (now() - min(received_at) FILTER (WHERE status = 'pending')))::double precision
  FROM crm_webhook_events
  WHERE status IN ('pending', 'failed', 'processing', 'dead');
$$;

-- ── 2.4 Notificações: índice + RPCs com literal ────────────────────
-- `metadata->>$1 = $2` nunca usa índice (chave parametrizada, e o ->>
-- não é LEAKPROOF). A saída é fixar a chave dentro de uma função.
CREATE INDEX IF NOT EXISTS idx_notifications_channel_alert_open
  ON notifications ((metadata->>'channel_id'))
  WHERE read = FALSE AND (metadata->>'source') = 'crm_channel_alert';

-- Clear do inbox: usa uniq_notifications_crm_inbox_open.
CREATE OR REPLACE FUNCTION clear_crm_thread_notifications(p_thread_id UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH updated AS (
    UPDATE notifications
       SET read = TRUE, read_at = now()
     WHERE read = FALSE
       AND (metadata->>'source') = 'crm_inbox'
       AND (metadata->>'thread_id') = p_thread_id::text
    RETURNING 1
  )
  SELECT count(*)::int FROM updated;
$$;

-- Dedup do alerta de canal (webhook, cron de saúde e envio recusado).
CREATE OR REPLACE FUNCTION has_open_channel_alert(p_channel_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM notifications
     WHERE read = FALSE
       AND (metadata->>'source') = 'crm_channel_alert'
       AND (metadata->>'channel_id') = p_channel_id::text
  );
$$;

CREATE OR REPLACE FUNCTION clear_channel_alerts(p_channel_id UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH updated AS (
    UPDATE notifications
       SET read = TRUE, read_at = now()
     WHERE read = FALSE
       AND (metadata->>'source') = 'crm_channel_alert'
       AND (metadata->>'channel_id') = p_channel_id::text
    RETURNING 1
  )
  SELECT count(*)::int FROM updated;
$$;

-- Badge do sino com TETO: hoje o hook faz `select *` e traz 2.408
-- linhas para o usuário com mais pendências. A UI mostra "99+" —
-- contar além disso é desperdício. SECURITY INVOKER: a RLS
-- (user_id = auth.uid()) continua sendo a autoridade.
CREATE OR REPLACE FUNCTION unread_notifications_count(p_cap INTEGER DEFAULT 100)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT count(*)::int FROM (
    SELECT 1 FROM notifications
     WHERE user_id = (SELECT auth.uid())
       AND read = FALSE
     LIMIT GREATEST(p_cap, 1)
  ) capped;
$$;

-- Payload cru e estado de fila não são do browser.
REVOKE ALL ON FUNCTION prune_crm_webhook_events(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION crm_webhook_queue_stats() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION clear_crm_thread_notifications(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION has_open_channel_alert(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION clear_channel_alerts(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION unread_notifications_count(INTEGER) TO authenticated;

-- ── 2.5 Backlog de notificações ────────────────────────────────────
-- 17.312 "Onboarding travado há N dias" não lidas, geradas por cron
-- para 11 membros. Nunca tiveram consumidor. Apaga o que passou de 7
-- dias (não há ação possível sobre um aviso de julho) e marca o resto
-- como lido. Em lotes — repetir o bloco até `pruned = 0`.
-- A coalescência do gerador entra na fase 5; sem ela o backlog volta.
DO $$
DECLARE
  removed BIGINT := 0;
  total BIGINT := 0;
BEGIN
  LOOP
    DELETE FROM notifications
     WHERE id IN (
       SELECT id FROM notifications
        WHERE type = 'onboarding_stuck'
          AND read = FALSE
          AND created_at < now() - interval '7 days'
        LIMIT 5000
     );
    GET DIAGNOSTICS removed = ROW_COUNT;
    total := total + removed;
    EXIT WHEN removed = 0;
  END LOOP;
  RAISE NOTICE 'notificações onboarding_stuck removidas: %', total;

  UPDATE notifications
     SET read = TRUE, read_at = now()
   WHERE type = 'onboarding_stuck' AND read = FALSE;
END;
$$;

ANALYZE notifications;
ANALYZE crm_webhook_events;


-- ════════════════════════════════════════════════════════════
-- RUN 3 — publication (janela de baixo tráfego)
-- ════════════════════════════════════════════════════════════
-- ALTER PUBLICATION pega ShareUpdateExclusiveLock na tabela. Com
-- lock_timeout ele falha rápido em vez de travar — basta reaplicar.
--
-- `client_onboardings` está na publication e NENHUM hook do front a
-- assina (conferido em src/hooks/use-realtime-*.ts): todo INSERT/UPDATE
-- nela passava pelo poller do Realtime sem destinatário.
--
-- As demais (crm_threads, crm_messages, notifications, report_jobs,
-- store_revenue_summary, deals, pipeline_stages, onboardings,
-- task_deliverables) TÊM assinante hoje — saem só quando o cliente
-- migrar para Broadcast (fase 4).
SET lock_timeout = '10s';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND tablename = 'client_onboardings'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE client_onboardings';
  END IF;
END;
$$;

RESET lock_timeout;
