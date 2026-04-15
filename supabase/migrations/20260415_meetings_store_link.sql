-- Migration: Link meetings to stores (INT-01)
-- Date: 2026-04-15
--
-- Adiciona meetings.store_id (opcional, FK para client_stores). Quando uma
-- reuniao com store_id e marcada como 'completed':
--   1) atualiza client_stores.last_feedback_date / last_feedback_by /
--      next_feedback_date (mesma logica do trigger de store_feedback_calls)
--   2) cria entry em store_feedback_calls (audit trail unificada)
--
-- Esta migration encerra INT-01 (Reunioes <-> Lojas).

-- ── Schema ────────────────────────────────────────────────────────────────

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES client_stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_meetings_store_id
  ON meetings(store_id) WHERE store_id IS NOT NULL;

COMMENT ON COLUMN meetings.store_id IS
  'Loja vinculada (opcional). Quando setado e a reuniao e concluida, atualiza last_feedback_date da loja.';

-- ── Trigger function ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_meeting_to_store_feedback()
RETURNS TRIGGER AS $$
DECLARE
  v_freq TEXT;
BEGIN
  -- Sai cedo se nao ha store vinculada
  IF NEW.store_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- So sincroniza quando muda para 'completed' (transicao, nao re-edicao)
  IF NEW.status = 'completed' AND
     (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed') THEN

    -- Le frequencia da loja
    SELECT feedback_frequency INTO v_freq
      FROM client_stores
     WHERE id = NEW.store_id;

    -- Atualiza client_stores
    UPDATE client_stores
       SET
         last_feedback_date = COALESCE(NEW.completed_at, NEW.scheduled_at, NOW()),
         last_feedback_by   = COALESCE(NEW.completed_by, NEW.user_id),
         feedback_notes     = COALESCE(NEW.completion_notes, NEW.notes),
         next_feedback_date = CASE
           WHEN COALESCE(v_freq, 'monthly') = 'monthly'
             THEN DATE_TRUNC('month', COALESCE(NEW.completed_at, NEW.scheduled_at, NOW())) + INTERVAL '1 month'
           ELSE COALESCE(NEW.completed_at, NEW.scheduled_at, NOW()) + INTERVAL '30 days'
         END
     WHERE id = NEW.store_id;

    -- Insere historico em store_feedback_calls (idempotente: ON CONFLICT DO NOTHING via
    -- WHERE NOT EXISTS para nao criar duplicata caso o trigger dispare 2x)
    IF NOT EXISTS (
      SELECT 1
        FROM store_feedback_calls sfc
       WHERE sfc.store_id = NEW.store_id
         AND sfc.notes IS NOT DISTINCT FROM COALESCE(NEW.completion_notes, NEW.notes)
         AND sfc.conducted_at = COALESCE(NEW.completed_at, NEW.scheduled_at, NOW())
    ) THEN
      INSERT INTO store_feedback_calls (
        store_id, client_id, conducted_by, conducted_at, duration_minutes, notes
      ) VALUES (
        NEW.store_id,
        NEW.client_id,
        COALESCE(NEW.completed_by, NEW.user_id),
        COALESCE(NEW.completed_at, NEW.scheduled_at, NOW()),
        NEW.duration_minutes,
        COALESCE(NEW.completion_notes, NEW.notes)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Trigger ──────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_sync_meeting_to_store_feedback ON meetings;
CREATE TRIGGER trg_sync_meeting_to_store_feedback
  AFTER INSERT OR UPDATE OF status ON meetings
  FOR EACH ROW
  EXECUTE FUNCTION sync_meeting_to_store_feedback();

COMMENT ON FUNCTION sync_meeting_to_store_feedback IS
  'INT-01: quando uma reuniao com store_id e concluida, atualiza last_feedback_date da loja e cria registro em store_feedback_calls.';
