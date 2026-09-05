-- ============================================================
-- Inbox — recuperação, FASE 3a: a fila de webhooks feita direito
-- ============================================================
-- Três defeitos do claim atual, todos vistos em produção:
--
--  1. LEASE MENOR QUE O TRABALHO. `claim_crm_webhook_event` marcava
--     `in_flight_until = now() + 30s`, mas o worker e o webhook rodam com
--     maxDuration de 60s. Um processamento legítimo que passasse de 30s
--     podia ser reivindicado pelo cron enquanto o primeiro ainda rodava
--     (processamento duplo — só o UPSERT idempotente segurava).
--
--  2. `processing` ERA UM BURACO. O claim só reivindica pending/failed e
--     o prune só apagava `done`: evento que morria no meio (timeout,
--     deploy, OOM) ficava preso para sempre. Havia 8 desde 15/07.
--
--  3. SEM BACKOFF. O reprocess pegava tudo com mais de 60s, então um
--     evento que falha esgota as 5 tentativas em ~5 minutos, rodando o
--     pipeline inteiro (13-17 statements) cinco vezes.
--
-- Além disso, o claim antigo era SELECT (RPC) seguido de UPDATE (RPC) por
-- item: N+1 no caminho mais quente do cron. Agora é um statement com
-- FOR UPDATE SKIP LOCKED.
--
-- Idempotente.
-- ============================================================

-- ── Claim em LOTE: um statement, sem corrida ───────────────────────
-- SKIP LOCKED deixa execuções concorrentes do cron (a Vercel não
-- serializa invocações: maxDuration 300s > período de 60s) pegarem
-- lotes disjuntos em vez de brigarem pela mesma linha.
CREATE OR REPLACE FUNCTION claim_crm_webhook_events(
  p_limit INTEGER DEFAULT 50,
  p_lease_seconds INTEGER DEFAULT 330
)
RETURNS SETOF crm_webhook_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE crm_webhook_events e
     SET status = 'processing',
         attempts = e.attempts + 1,
         in_flight_until = now() + make_interval(secs => GREATEST(p_lease_seconds, 60)),
         updated_at = now()
   WHERE e.id IN (
     SELECT c.id
       FROM crm_webhook_events c
      WHERE c.attempts < c.max_attempts
        AND (
          -- Backoff exponencial: 30s, 60s, 2min, 4min, 8min...
          (c.status IN ('pending', 'failed')
            AND c.updated_at < now() - (interval '30 seconds' * power(2, LEAST(c.attempts, 8))))
          -- Worker morto: o lease venceu, a linha volta para a fila.
          OR (c.status = 'processing' AND c.in_flight_until < now())
        )
      ORDER BY c.received_at ASC
      LIMIT GREATEST(p_limit, 1)
      FOR UPDATE SKIP LOCKED
   )
  RETURNING e.*;
$$;

-- ── Claim de UM evento (worker QStash) ─────────────────────────────
-- Mesma regra, com lease explícito. A assinatura de 1 argumento é
-- mantida por compatibilidade: código antigo em voo continua chamando.
CREATE OR REPLACE FUNCTION claim_crm_webhook_event(
  p_id UUID,
  p_lease_seconds INTEGER
)
RETURNS SETOF crm_webhook_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE crm_webhook_events e
     SET status = 'processing',
         attempts = e.attempts + 1,
         in_flight_until = now() + make_interval(secs => GREATEST(p_lease_seconds, 60)),
         updated_at = now()
   WHERE e.id = p_id
     AND e.attempts < e.max_attempts
     AND (
       e.status IN ('pending', 'failed')
       OR (e.status = 'processing' AND e.in_flight_until < now())
     )
  RETURNING e.*;
$$;

-- Lease default de 90s: > maxDuration (60s) do worker, com margem.
CREATE OR REPLACE FUNCTION claim_crm_webhook_event(p_id UUID)
RETURNS SETOF crm_webhook_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM claim_crm_webhook_event(p_id, 90);
$$;

REVOKE ALL ON FUNCTION claim_crm_webhook_events(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION claim_crm_webhook_event(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION claim_crm_webhook_event(UUID) FROM PUBLIC, anon, authenticated;

-- `pending_crm_webhook_events_for_reprocess` fica para trás: era um
-- SELECT seguido de um claim por item (N+1). Mantida só para não quebrar
-- código em voo durante o deploy; remover na limpeza seguinte.
COMMENT ON FUNCTION pending_crm_webhook_events_for_reprocess(INTEGER, INTEGER) IS
  'DEPRECADA (fase 3a): use claim_crm_webhook_events(p_limit, p_lease_seconds) — claim atômico em lote.';

-- ── Probe da notificação do inbox (push só quando a conversa NASCE) ──
-- Mesma razão das RPCs da fase 0: a chave do `metadata->>` precisa ser
-- literal para o unique partial index ser elegível.
CREATE OR REPLACE FUNCTION has_open_crm_thread_notification(p_thread_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM notifications
     WHERE read = FALSE
       AND (metadata->>'source') = 'crm_inbox'
       AND (metadata->>'thread_id') = p_thread_id::text
  );
$$;

REVOKE ALL ON FUNCTION has_open_crm_thread_notification(UUID) FROM PUBLIC, anon, authenticated;
