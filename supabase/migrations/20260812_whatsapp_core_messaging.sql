-- ============================================================
-- WhatsApp — Núcleo de atendimento (porte do worder)
--
-- 1. crm_threads: janela de 24h (is_window_open, window_expires_at)
-- 2. crm_messages: colunas de mídia (storage_path, filename, size)
-- 3. crm_whatsapp_templates: templates Meta sincronizados por canal
-- 4. crm_quick_replies: respostas rápidas por org
-- 5. crm_webhook_events: fila durável de webhooks (source='whatsapp')
-- 6. RPCs: claim/reprocess/prune da fila, janela 24h, templates stale
-- 7. Realtime: crm_threads/crm_messages na publication
-- 8. Storage: bucket privado whatsapp-media
--
-- Idempotente: rodável mais de uma vez sem efeito colateral.
-- ============================================================

-- ── 1. crm_threads: janela de 24h ──────────────────────────────────
ALTER TABLE crm_threads
  ADD COLUMN IF NOT EXISTS is_window_open BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS window_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_customer_message_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_crm_threads_open_window
  ON crm_threads (window_expires_at)
  WHERE is_window_open = TRUE;

-- ── 2. crm_messages: mídia ─────────────────────────────────────────
ALTER TABLE crm_messages
  ADD COLUMN IF NOT EXISTS media_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS media_filename TEXT,
  ADD COLUMN IF NOT EXISTS media_size INTEGER;

-- ── 3. crm_whatsapp_templates ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES crm_channels(id) ON DELETE CASCADE,
  waba_id TEXT,
  meta_template_id TEXT,
  name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'pt_BR',
  category TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  components JSONB,
  header_type TEXT,
  header_text TEXT,
  body_text TEXT,
  body_variables INTEGER NOT NULL DEFAULT 0,
  footer_text TEXT,
  buttons JSONB,
  rejection_reason TEXT,
  use_count BIGINT NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (channel_id, name, language)
);

CREATE INDEX IF NOT EXISTS idx_crm_wa_templates_org ON crm_whatsapp_templates (org_id);
CREATE INDEX IF NOT EXISTS idx_crm_wa_templates_status ON crm_whatsapp_templates (channel_id, status);

-- Extrai header/body/footer/buttons e conta {{n}} quando components muda
-- (portado do worder: whatsapp_templates_extract_components)
CREATE OR REPLACE FUNCTION crm_wa_templates_extract_components()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  comp       JSONB;
  comp_type  TEXT;
  var_count  INTEGER := 0;
BEGIN
  IF NEW.components IS NULL OR jsonb_array_length(NEW.components) = 0 THEN
    RETURN NEW;
  END IF;

  FOR comp IN SELECT * FROM jsonb_array_elements(NEW.components)
  LOOP
    comp_type := upper(comp ->> 'type');

    IF comp_type = 'HEADER' THEN
      NEW.header_type := coalesce(comp ->> 'format', 'TEXT');
      NEW.header_text := comp ->> 'text';
    ELSIF comp_type = 'BODY' THEN
      NEW.body_text := comp ->> 'text';
      IF NEW.body_text IS NOT NULL THEN
        SELECT count(*)::INTEGER INTO var_count
        FROM regexp_matches(NEW.body_text, '\{\{\d+\}\}', 'g');
        NEW.body_variables := var_count;
      END IF;
    ELSIF comp_type = 'FOOTER' THEN
      NEW.footer_text := comp ->> 'text';
    ELSIF comp_type = 'BUTTONS' THEN
      NEW.buttons := comp -> 'buttons';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_wa_templates_extract ON crm_whatsapp_templates;
CREATE TRIGGER trg_crm_wa_templates_extract
  BEFORE INSERT OR UPDATE OF components ON crm_whatsapp_templates
  FOR EACH ROW
  WHEN (NEW.components IS NOT NULL)
  EXECUTE FUNCTION crm_wa_templates_extract_components();

DROP TRIGGER IF EXISTS crm_set_updated_at_wa_templates ON crm_whatsapp_templates;
CREATE TRIGGER crm_set_updated_at_wa_templates
  BEFORE UPDATE ON crm_whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

ALTER TABLE crm_whatsapp_templates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "crm_whatsapp_templates_authenticated" ON crm_whatsapp_templates
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 4. crm_quick_replies ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_quick_replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  shortcut TEXT NOT NULL,
  title TEXT,
  body TEXT NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, shortcut)
);

DROP TRIGGER IF EXISTS crm_set_updated_at_quick_replies ON crm_quick_replies;
CREATE TRIGGER crm_set_updated_at_quick_replies
  BEFORE UPDATE ON crm_quick_replies
  FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

ALTER TABLE crm_quick_replies ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "crm_quick_replies_authenticated" ON crm_quick_replies
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 5. crm_webhook_events (fila durável) ───────────────────────────
-- Persiste o payload cru ANTES de qualquer processamento; worker/cron
-- fazem claim atômico. source permite reutilizar pra Instagram depois.
CREATE TABLE IF NOT EXISTS crm_webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source TEXT NOT NULL DEFAULT 'whatsapp',
  external_channel_id TEXT,
  raw_payload JSONB NOT NULL,
  signature TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed', 'dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  last_error TEXT,
  in_flight_until TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_webhook_events_retry
  ON crm_webhook_events (status, received_at)
  WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_crm_webhook_events_done
  ON crm_webhook_events (processed_at)
  WHERE status = 'done';

-- Payload cru de webhook não é pro client: só service_role.
ALTER TABLE crm_webhook_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "crm_webhook_events_service_role" ON crm_webhook_events
    FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 6. RPCs ────────────────────────────────────────────────────────

-- Claim atômico com lease de 30s (previne processamento duplo entre
-- worker QStash e cron de reprocess). Portado do worder.
CREATE OR REPLACE FUNCTION claim_crm_webhook_event(p_id UUID)
RETURNS SETOF crm_webhook_events LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  UPDATE crm_webhook_events
  SET
    status          = 'processing',
    attempts        = attempts + 1,
    in_flight_until = now() + interval '30 seconds',
    updated_at      = now()
  WHERE id = p_id
    AND status IN ('pending', 'failed')
    AND (in_flight_until IS NULL OR in_flight_until < now())
    AND attempts < max_attempts
  RETURNING *;
END;
$$;
GRANT EXECUTE ON FUNCTION claim_crm_webhook_event(UUID) TO service_role;

CREATE OR REPLACE FUNCTION pending_crm_webhook_events_for_reprocess(
  p_older_than_seconds INTEGER DEFAULT 60,
  p_limit INTEGER DEFAULT 100
)
RETURNS SETOF crm_webhook_events LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM crm_webhook_events
  WHERE status IN ('pending', 'failed')
    AND attempts < max_attempts
    AND (in_flight_until IS NULL OR in_flight_until < now())
    AND received_at < now() - (p_older_than_seconds || ' seconds')::interval
  ORDER BY received_at ASC
  LIMIT p_limit;
END;
$$;
GRANT EXECUTE ON FUNCTION pending_crm_webhook_events_for_reprocess(INTEGER, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION prune_crm_webhook_events()
RETURNS TABLE(events_pruned BIGINT) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  cnt BIGINT;
BEGIN
  DELETE FROM crm_webhook_events
  WHERE status = 'done'
    AND processed_at < now() - interval '7 days';

  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN QUERY SELECT cnt;
END;
$$;
GRANT EXECUTE ON FUNCTION prune_crm_webhook_events() TO service_role;

-- Abre/renova a janela de 24h no inbound de WhatsApp e reabre a thread
-- resolvida. NÃO toca last_message_*/unread_count — o trigger AFTER
-- INSERT em crm_messages já cuida disso (evita double-update) e o
-- caminho Instagram fica intocado.
CREATE OR REPLACE FUNCTION open_crm_thread_window(
  p_thread_id UUID,
  p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE crm_threads
  SET
    is_window_open           = TRUE,
    window_expires_at        = p_now + interval '24 hours',
    last_customer_message_at = p_now,
    status = CASE WHEN status = 'resolved' THEN 'open' ELSE status END,
    updated_at               = now()
  WHERE id = p_thread_id;
END;
$$;
GRANT EXECUTE ON FUNCTION open_crm_thread_window(UUID, TIMESTAMPTZ) TO service_role;

CREATE OR REPLACE FUNCTION close_expired_crm_windows()
RETURNS TABLE(threads_closed BIGINT) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  cnt BIGINT;
BEGIN
  UPDATE crm_threads
  SET
    is_window_open = FALSE,
    updated_at     = now()
  WHERE is_window_open = TRUE
    AND window_expires_at IS NOT NULL
    AND window_expires_at < now();

  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN QUERY SELECT cnt;
END;
$$;
GRANT EXECUTE ON FUNCTION close_expired_crm_windows() TO service_role;

-- Templates presos em PENDING além do threshold (webhook de status
-- perdido ou rejeição silenciosa da Meta) — usado pra log/alerta.
CREATE OR REPLACE FUNCTION stale_pending_crm_templates(
  p_threshold_minutes INTEGER DEFAULT 60
)
RETURNS TABLE(
  template_id  UUID,
  name         TEXT,
  language     TEXT,
  channel_id   UUID,
  created_at   TIMESTAMPTZ,
  age_minutes  DOUBLE PRECISION
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.name,
    t.language,
    t.channel_id,
    t.created_at,
    EXTRACT(EPOCH FROM (now() - t.created_at)) / 60.0 AS age_minutes
  FROM crm_whatsapp_templates t
  WHERE t.status = 'PENDING'
    AND t.created_at < now() - (p_threshold_minutes || ' minutes')::interval
  ORDER BY t.created_at ASC;
END;
$$;
GRANT EXECUTE ON FUNCTION stale_pending_crm_templates(INTEGER) TO service_role;

-- ── 7. Realtime publication ────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['crm_threads', 'crm_messages'])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END;
$$;

-- ── 8. Storage: bucket privado whatsapp-media ──────────────────────
-- Acesso só por signed URL gerada server-side (service role) — sem
-- policies de storage adicionais. Limite 100MB (docs, teto da Meta).
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('whatsapp-media', 'whatsapp-media', FALSE, 104857600)
ON CONFLICT (id) DO NOTHING;
