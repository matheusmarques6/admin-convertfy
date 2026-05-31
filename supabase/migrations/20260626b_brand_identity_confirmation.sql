-- ============================================================
-- Epic AE - Story AE-18: Brand Identity Confirmation Gate
--
-- Adiciona o GATE 2 do pipeline AE: confirmar a identidade visual
-- da loja antes de disparar a fase 2 (image + html + QA).
--
-- Antes desta migration, a fase 2 disparava automaticamente apos
-- copy_ready (callback do n8n), o que produzia emails com cores
-- erradas/logos placeholder quando o designer ainda nao tinha
-- finalizado a brand identity. Agora a confirmacao do designer
-- (UPDATE confirmed_at NULL -> NOT NULL) e o gatilho explicito.
--
-- Mudancas:
--   1. store_brand_identity ganha colunas confirmed_at / confirmed_by.
--   2. Indice parcial pro cron dispatcher achar latest confirmed por loja.
--   3. Trigger fn_on_brand_identity_confirmed enfileira sinal em
--      email_generation_queue_signals quando confirmed_at vai NULL -> NOT NULL.
--
-- NOTA SOBRE SIGNAL_TYPE (TODO AE-19):
--   email_generation_queue_signals nao tem coluna signal_type (sera
--   adicionada em AE-19 com valores 'start' | 'render' | 'rerender').
--   Esta migration registra o sinal usando triggered_by='manual' e
--   marca o tipo via payload.signal_type='render' (jsonb). AE-19 vai
--   migrar esses sinais pra coluna dedicada e atualizar o dispatcher.
--
-- Migration TOTALMENTE idempotente.
-- ============================================================

-- ── 1. Colunas confirmed_at / confirmed_by ─────────────────
ALTER TABLE store_brand_identity
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES auth.users(id);

COMMENT ON COLUMN store_brand_identity.confirmed_at IS
  'Timestamp em que o designer confirmou a identidade visual. NULL = pendente. '
  'Cada nova versao (PATCH em /brand-identity) nasce com NULL e precisa ser '
  'reconfirmada pelo designer.';
COMMENT ON COLUMN store_brand_identity.confirmed_by IS
  'auth.users.id de quem confirmou. NULL ate primeiro confirm.';

-- ── 2. Indice parcial pro cron dispatcher (AE-19) ──────────
-- Permite query rapida do tipo:
--   SELECT * FROM store_brand_identity
--    WHERE store_id = ? AND confirmed_at IS NOT NULL
--    ORDER BY version DESC LIMIT 1
CREATE INDEX IF NOT EXISTS idx_brand_identity_confirmed
  ON store_brand_identity (store_id, version DESC)
  WHERE confirmed_at IS NOT NULL;

-- ── 3. Trigger function ────────────────────────────────────
-- AFTER UPDATE em store_brand_identity FOR EACH ROW.
-- Dispara apenas quando OLD.confirmed_at IS NULL AND NEW.confirmed_at IS NOT NULL
-- (transicao "confirma agora"). NUNCA bloqueia o UPDATE.
-- NUNCA faz HTTP - so insere sinal + pg_notify.
--
-- Hardening (de AE-17 review):
--   - SECURITY DEFINER + SET search_path = public, pg_temp
--   - Protege contra escalonamento via tabelas espelhadas em outros schemas.
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
        (store_id, triggered_by, payload)
      VALUES
        (NEW.store_id, 'manual',
         jsonb_build_object(
           -- AE-19 vai promover signal_type pra coluna dedicada. Por enquanto
           -- discrimina pelo payload pra o dispatcher conseguir rotear.
           'signal_type', 'render',
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

DROP TRIGGER IF EXISTS trg_brand_identity_confirmed ON store_brand_identity;
CREATE TRIGGER trg_brand_identity_confirmed
  AFTER UPDATE ON store_brand_identity
  FOR EACH ROW EXECUTE FUNCTION fn_on_brand_identity_confirmed();

-- ============================================================
-- Fim da migration Epic AE-18.
-- ============================================================
