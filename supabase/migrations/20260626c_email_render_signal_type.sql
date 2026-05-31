-- ============================================================
-- Epic AE - Story AE-19: Split callback n8n + signal_type
--
-- AE-18 introduziu o GATE 2 (brand identity confirmation) e o trigger
-- `fn_on_brand_identity_confirmed` que enfileira sinais em
-- email_generation_queue_signals discriminando o tipo via payload JSONB
-- (`payload->>'signal_type' = 'render'`). Esta migration promove
-- `signal_type` a coluna dedicada e atualiza o trigger pra escrever nela.
--
-- Estrutura final da fila:
--   signal_type='start'    -> trigger fn_on_briefing_confirmed (GATE 1):
--                             watchdog dispatcha startOnboarding (fase 1).
--   signal_type='render'   -> trigger fn_on_brand_identity_confirmed (GATE 2):
--                             watchdog dispatcha runPhase2InBackground p/
--                             cada email em copy_ready (fase 2).
--   signal_type='rerender' -> reservado pra AE-20 ("Re-renderizar tudo"):
--                             mesma lógica de render, mas reseta status de
--                             rendering/qa_running/ready/failed antes.
--
-- Mudancas:
--   1. Coluna signal_type (TEXT NOT NULL DEFAULT 'start' + CHECK).
--   2. Backfill de rows existentes (payload->>'signal_type'='render').
--   3. Indice parcial pra dispatcher achar pending por tipo.
--   4. CREATE OR REPLACE de fn_on_brand_identity_confirmed pra escrever
--      direto na coluna (mantém payload com brand_identity_id/version).
--
-- Migration TOTALMENTE idempotente.
-- ============================================================

-- ── 1. Coluna signal_type ──────────────────────────────────
-- DEFAULT 'start' garante que rows existentes (criadas pre-AE-19) viram
-- 'start' automaticamente — comportamento legado correto pois o dispatcher
-- atual sempre assumia start. CHECK permite os 3 tipos do plano AE.
ALTER TABLE email_generation_queue_signals
  ADD COLUMN IF NOT EXISTS signal_type TEXT NOT NULL DEFAULT 'start'
  CHECK (signal_type IN ('start', 'render', 'rerender'));

COMMENT ON COLUMN email_generation_queue_signals.signal_type IS
  'Tipo do sinal: start (briefing confirmado -> fase 1), render (brand '
  'identity confirmada -> fase 2), rerender (forcar re-renderizacao - AE-20).';

-- ── 2. Backfill de rows do trigger AE-18 ───────────────────
-- Trigger fn_on_brand_identity_confirmed (migration 20260626b) ja emite
-- sinais com payload->>'signal_type'='render' desde producao. Promove
-- esses pra coluna dedicada. Filtro `signal_type='start'` (default) evita
-- sobrescrever caso a migration rode 2x.
UPDATE email_generation_queue_signals
   SET signal_type = 'render'
 WHERE payload->>'signal_type' = 'render'
   AND signal_type = 'start';

-- ── 3. Indice parcial pro dispatcher rotear por tipo ───────
-- Watchdog query: WHERE status='pending' ORDER BY created_at — depois
-- branch por signal_type. Indice cobre (signal_type, created_at) WHERE
-- status='pending' pra ordenar+filtrar sem table scan.
-- O indice idx_eqs_pending existente cobre (status, created_at) WHERE
-- status='pending' — mantemos os dois (o novo eh sobre signal_type).
CREATE INDEX IF NOT EXISTS idx_eqs_pending_by_type
  ON email_generation_queue_signals (signal_type, created_at)
  WHERE status = 'pending';

-- ── 4. Atualizar trigger AE-18 pra escrever na coluna ──────
-- CREATE OR REPLACE preserva GRANTs/owners. Mantemos SECURITY DEFINER +
-- search_path do hardening da AE-18. Payload deixa de carregar
-- signal_type (agora redundante) mas continua com brand_identity_id +
-- brand_version pra audit.
CREATE OR REPLACE FUNCTION fn_on_brand_identity_confirmed()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
BEGIN
  IF (OLD.confirmed_at IS NULL AND NEW.confirmed_at IS NOT NULL) THEN
    BEGIN
      INSERT INTO email_generation_queue_signals
        (store_id, triggered_by, signal_type, payload)
      VALUES
        (NEW.store_id, 'manual', 'render',
         jsonb_build_object(
           'brand_identity_id', NEW.id,
           'brand_version', NEW.version
         ));
      PERFORM pg_notify('email_generation_signal',
        jsonb_build_object(
          'store_id', NEW.store_id,
          'signal_type', 'render'
        )::text);
    EXCEPTION WHEN OTHERS THEN
      -- NUNCA bloqueia o UPDATE da identidade visual.
      RAISE WARNING 'fn_on_brand_identity_confirmed failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger ja existe (criado em 20260626b); CREATE OR REPLACE FUNCTION
-- ja atualizou o codigo. Nao precisa DROP/CREATE TRIGGER.

-- ============================================================
-- Fim da migration Epic AE-19.
-- ============================================================
