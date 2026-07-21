-- ============================================================
-- CRM Convertfy — Form Conversion Tracking (Meta CAPI + Google gtag)
--
-- Habilita disparo de eventos de conversao quando um lead se
-- cadastra num formulario publico:
--   - Meta Conversions API (server-side, evento "Lead" + custom
--     "Lead qualificado" condicional)
--   - Google Ads gtag (client-side; so armazena config aqui)
--
-- Mudancas:
--   1. crm_forms            + colunas de config de pixel/token
--   2. crm_form_submissions + fbc/fbp/fbclid/gclid (click ids)
--   3. crm_conversion_events (fila duravel + log de envio server-side)
--
-- Idempotente: pode rodar multiplas vezes sem erro.
-- Depende de: crm_forms, crm_form_submissions, crm_leads,
--             organizations, org_members (ja existentes).
-- ============================================================

-- ── 1. crm_forms: config de tracking ─────────────────────────────
-- facebook_pixel_id / google_ads_id / google_analytics_id ja existem
-- (20260512_crm_forms.sql). Aqui adicionamos o token da CAPI (cifrado
-- na aplicacao via src/lib/crypto.ts — NUNCA exposto ao browser), o
-- test event code, o label de conversao do gtag e a config estruturada.

ALTER TABLE crm_forms
  ADD COLUMN IF NOT EXISTS meta_capi_token TEXT,
  ADD COLUMN IF NOT EXISTS meta_test_event_code TEXT,
  ADD COLUMN IF NOT EXISTS google_ads_conversion_label TEXT,
  ADD COLUMN IF NOT EXISTS tracking_config JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN crm_forms.meta_capi_token IS
  'Access token da Meta Conversions API. Cifrado em repouso (enc:v1:) via src/lib/crypto.ts. Nunca retornar ao cliente — API expoe apenas has_meta_capi_token boolean.';
COMMENT ON COLUMN crm_forms.tracking_config IS
  'Config estruturada nao-secreta: { meta:{enabled,browser_pixel}, google:{enabled}, qualified_lead:{enabled,event_name,logic,rules:[{field_id,operator,value}]} }';

-- ── 2. crm_form_submissions: click ids p/ matching ───────────────
-- fbc/fbp (cookies do Meta), fbclid (Meta), gclid (Google). Capturados
-- no browser e enviados no submit; alimentam o user_data da CAPI.

ALTER TABLE crm_form_submissions
  ADD COLUMN IF NOT EXISTS fbc TEXT,
  ADD COLUMN IF NOT EXISTS fbp TEXT,
  ADD COLUMN IF NOT EXISTS fbclid TEXT,
  ADD COLUMN IF NOT EXISTS gclid TEXT;

-- ── 3. crm_conversion_events: fila duravel + log ─────────────────
-- Cada evento server-side (Meta CAPI) vira uma linha. Enviado inline
-- best-effort no submit; o que falhar fica pending/failed e o cron
-- /api/cron/conversion-dispatch reprocessa com retry. Idempotente por
-- (submission_id, platform, event_name).

CREATE TABLE IF NOT EXISTS crm_conversion_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  form_id UUID REFERENCES crm_forms(id) ON DELETE SET NULL,
  submission_id UUID REFERENCES crm_form_submissions(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,

  -- Plataforma de destino. Google e client-side (gtag), entao hoje a
  -- fila server-side carrega so 'meta'; 'google' fica reservado.
  platform TEXT NOT NULL CHECK (platform IN ('meta', 'google')),

  -- 'Lead' (padrao) ou o custom (ex. 'Lead qualificado').
  event_name TEXT NOT NULL,
  -- Dedup com o pixel do browser (fbq eventID).
  event_id TEXT,

  -- Payload ja montado e com PII HASHEADA (sem token, sem PII crua).
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  -- Resposta do provedor (events_received, fbtrace_id, messages).
  response JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

-- Idempotencia: nao duplica no retry quando ha submission. Parcial pra
-- nao bloquear linhas sem submission (submission_id NULL).
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_conversion_events_dedup
  ON crm_conversion_events(submission_id, platform, event_name)
  WHERE submission_id IS NOT NULL;

-- Varredura do cron (pending/failed mais antigos primeiro).
CREATE INDEX IF NOT EXISTS idx_crm_conversion_events_status
  ON crm_conversion_events(status, created_at);
CREATE INDEX IF NOT EXISTS idx_crm_conversion_events_org
  ON crm_conversion_events(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_conversion_events_form
  ON crm_conversion_events(form_id);

-- ── 4. RLS ───────────────────────────────────────────────────────
-- Leitura/escrita restrita ao org_id do user (mesmo padrao das demais
-- tabelas CRM). Submit e cron usam service_role e bypassam RLS.

ALTER TABLE crm_conversion_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_conversion_events_org" ON crm_conversion_events;
CREATE POLICY "crm_conversion_events_org" ON crm_conversion_events
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE profile_id = auth.uid() AND is_active = true
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE profile_id = auth.uid() AND is_active = true
    )
  );

-- ── 5. updated_at trigger ────────────────────────────────────────

CREATE OR REPLACE FUNCTION crm_conversion_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_conversion_events_updated_at ON crm_conversion_events;
CREATE TRIGGER trg_crm_conversion_events_updated_at
  BEFORE UPDATE ON crm_conversion_events
  FOR EACH ROW EXECUTE FUNCTION crm_conversion_events_updated_at();

-- ── 6. Grants ────────────────────────────────────────────────────

GRANT ALL ON crm_conversion_events TO service_role;

-- ── 7. Comentarios ───────────────────────────────────────────────

COMMENT ON TABLE crm_conversion_events IS
  'Fila duravel + log de eventos de conversao server-side (Meta CAPI). Idempotente por (submission_id, platform, event_name). Processada inline no submit e reprocessada pelo cron /api/cron/conversion-dispatch.';
