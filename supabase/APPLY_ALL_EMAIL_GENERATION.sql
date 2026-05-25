-- ================================================================
-- SQL CONSOLIDADO — Aplicar no Supabase Studio (SQL Editor)
-- Roda em ordem: flows restructure → generation infra
-- Tudo idempotente (IF NOT EXISTS, NOT EXISTS guards)
-- ================================================================

-- ════════════════════════════════════════════════════════════════
-- PARTE 1: Reestrutura flows (7 flows + emails default)
-- Migration: 20260620_email_flows_restructure.sql
-- ════════════════════════════════════════════════════════════════

-- ── CHECK constraint estendido ─────────────────────────────
ALTER TABLE email_flows
  DROP CONSTRAINT IF EXISTS email_flows_flow_type_check;

ALTER TABLE email_flows
  ADD CONSTRAINT email_flows_flow_type_check
  CHECK (flow_type IN (
    'welcome',
    'site_abandoned',
    'browse_abandonment',
    'abandoned_cart',
    'upsell',
    'win_back',
    'shipping_stages',
    'post_purchase',
    'custom'
  ));

-- ── Reposiciona flows existentes ───────────────────────────
UPDATE email_flows SET position = 1  WHERE flow_type = 'welcome';
UPDATE email_flows SET position = 3, name = 'Browse Abandoned'
  WHERE flow_type = 'browse_abandonment';
UPDATE email_flows SET position = 4, name = 'Carrinho Abandonado'
  WHERE flow_type = 'abandoned_cart';
UPDATE email_flows SET position = 6, name = 'Winback'
  WHERE flow_type = 'win_back';

-- Remove post_purchase (deprecated, substituido por upsell)
DELETE FROM email_flows WHERE flow_type = 'post_purchase';

-- ── Cria 3 novos flows pros stores que ja tem welcome ──────
INSERT INTO email_flows (store_id, flow_type, name, description, status, position)
SELECT ef.store_id, 'site_abandoned', 'Site Abandoned',
       'Recuperação de visitantes que saíram do site sem interagir', 'blocked', 2
FROM email_flows ef
WHERE ef.flow_type = 'welcome'
  AND NOT EXISTS (
    SELECT 1 FROM email_flows ef2
    WHERE ef2.store_id = ef.store_id AND ef2.flow_type = 'site_abandoned'
  );

INSERT INTO email_flows (store_id, flow_type, name, description, status, position)
SELECT ef.store_id, 'upsell', 'Upsell',
       'Upsell pós-compra para aumentar ticket médio', 'blocked', 5
FROM email_flows ef
WHERE ef.flow_type = 'welcome'
  AND NOT EXISTS (
    SELECT 1 FROM email_flows ef2
    WHERE ef2.store_id = ef.store_id AND ef2.flow_type = 'upsell'
  );

INSERT INTO email_flows (store_id, flow_type, name, description, status, position)
SELECT ef.store_id, 'shipping_stages', 'Etapas de Envio',
       'Notificações transacionais durante o envio do pedido', 'blocked', 7
FROM email_flows ef
WHERE ef.flow_type = 'welcome'
  AND NOT EXISTS (
    SELECT 1 FROM email_flows ef2
    WHERE ef2.store_id = ef.store_id AND ef2.flow_type = 'shipping_stages'
  );

-- ── Welcome: renomeia 1-5 e adiciona 6-8 ──────────────────
UPDATE email_flow_emails efe
SET name = 'Welcome ' || efe.number
FROM email_flows ef
WHERE efe.flow_id = ef.id
  AND ef.flow_type = 'welcome'
  AND efe.number BETWEEN 1 AND 5
  AND efe.name != 'Welcome ' || efe.number;

INSERT INTO email_flow_emails (flow_id, number, name, status, delay_hours)
SELECT ef.id, t.number, t.name, 'draft', t.delay_hours
FROM email_flows ef
CROSS JOIN (VALUES
  (6, 'Welcome 6', 144),
  (7, 'Welcome 7', 168),
  (8, 'Welcome 8', 192)
) AS t(number, name, delay_hours)
WHERE ef.flow_type = 'welcome'
  AND NOT EXISTS (
    SELECT 1 FROM email_flow_emails efe
    WHERE efe.flow_id = ef.id AND efe.number = t.number
  );

-- ── Site Abandoned 1 ──────────────────────────────────────
INSERT INTO email_flow_emails (flow_id, number, name, status, delay_hours)
SELECT ef.id, 1, 'Site Abandoned 1', 'draft', 1
FROM email_flows ef
WHERE ef.flow_type = 'site_abandoned'
  AND NOT EXISTS (
    SELECT 1 FROM email_flow_emails efe
    WHERE efe.flow_id = ef.id AND efe.number = 1
  );

-- ── Browse Abandoned 1-5 ─────────────────────────────────
INSERT INTO email_flow_emails (flow_id, number, name, status, delay_hours)
SELECT ef.id, t.number, t.name, 'draft', t.delay_hours
FROM email_flows ef
CROSS JOIN (VALUES
  (1, 'Browse Abandoned 1', 1),
  (2, 'Browse Abandoned 2', 24),
  (3, 'Browse Abandoned 3', 48),
  (4, 'Browse Abandoned 4', 72),
  (5, 'Browse Abandoned 5', 120)
) AS t(number, name, delay_hours)
WHERE ef.flow_type = 'browse_abandonment'
  AND NOT EXISTS (
    SELECT 1 FROM email_flow_emails efe
    WHERE efe.flow_id = ef.id AND efe.number = t.number
  );

-- ── Carrinho Abandonado 1-8 ──────────────────────────────
INSERT INTO email_flow_emails (flow_id, number, name, status, delay_hours)
SELECT ef.id, t.number, t.name, 'draft', t.delay_hours
FROM email_flows ef
CROSS JOIN (VALUES
  (1, 'Carrinho Abandonado 1', 1),
  (2, 'Carrinho Abandonado 2', 4),
  (3, 'Carrinho Abandonado 3', 24),
  (4, 'Carrinho Abandonado 4', 48),
  (5, 'Carrinho Abandonado 5', 72),
  (6, 'Carrinho Abandonado 6', 96),
  (7, 'Carrinho Abandonado 7', 120),
  (8, 'Carrinho Abandonado 8', 168)
) AS t(number, name, delay_hours)
WHERE ef.flow_type = 'abandoned_cart'
  AND NOT EXISTS (
    SELECT 1 FROM email_flow_emails efe
    WHERE efe.flow_id = ef.id AND efe.number = t.number
  );

-- ── Upsell 1-4 ──────────────────────────────────────────
INSERT INTO email_flow_emails (flow_id, number, name, status, delay_hours)
SELECT ef.id, t.number, t.name, 'draft', t.delay_hours
FROM email_flows ef
CROSS JOIN (VALUES
  (1, 'Upsell 1', 24),
  (2, 'Upsell 2', 72),
  (3, 'Upsell 3', 168),
  (4, 'Upsell 4', 336)
) AS t(number, name, delay_hours)
WHERE ef.flow_type = 'upsell'
  AND NOT EXISTS (
    SELECT 1 FROM email_flow_emails efe
    WHERE efe.flow_id = ef.id AND efe.number = t.number
  );

-- ── Winback 1-3 ─────────────────────────────────────────
INSERT INTO email_flow_emails (flow_id, number, name, status, delay_hours)
SELECT ef.id, t.number, t.name, 'draft', t.delay_hours
FROM email_flows ef
CROSS JOIN (VALUES
  (1, 'Winback 1', 0),
  (2, 'Winback 2', 168),
  (3, 'Winback 3', 336)
) AS t(number, name, delay_hours)
WHERE ef.flow_type = 'win_back'
  AND NOT EXISTS (
    SELECT 1 FROM email_flow_emails efe
    WHERE efe.flow_id = ef.id AND efe.number = t.number
  );

-- ── Etapas de Envio (5 nomes fixos) ─────────────────────
INSERT INTO email_flow_emails (flow_id, number, name, status, delay_hours)
SELECT ef.id, t.number, t.name, 'draft', 0
FROM email_flows ef
CROSS JOIN (VALUES
  (1, 'Pedido Pago'),
  (2, 'Pedido em separação'),
  (3, 'Pedido em coleta'),
  (4, 'Atraso na Entrega'),
  (5, 'Pedido Enviado')
) AS t(number, name)
WHERE ef.flow_type = 'shipping_stages'
  AND NOT EXISTS (
    SELECT 1 FROM email_flow_emails efe
    WHERE efe.flow_id = ef.id AND efe.number = t.number
  );


-- ════════════════════════════════════════════════════════════════
-- PARTE 2: Infraestrutura de geração de emails
-- Migration: 20260621_email_generation_infra.sql
-- ════════════════════════════════════════════════════════════════

-- ── 1. email_blueprints ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_type TEXT NOT NULL,
  email_number INT NOT NULL,
  objective TEXT NOT NULL,
  messaging TEXT NOT NULL,
  subject_hint TEXT,
  blocks JSONB NOT NULL DEFAULT '[]',
  tone_override TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE(flow_type, email_number)
);

-- ── 2. email_agent_configs ──────────────────────────────────
CREATE TABLE IF NOT EXISTS email_agent_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type TEXT NOT NULL CHECK (agent_type IN ('copy','image','html')),
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  system_prompt TEXT NOT NULL,
  user_template TEXT NOT NULL,
  temperature NUMERIC(3,2) DEFAULT 0.7,
  max_tokens INT DEFAULT 2048,
  output_schema JSONB,
  version INT NOT NULL DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_config_active
  ON email_agent_configs(agent_type) WHERE is_active = true;

-- ── 3. email_generation_settings ────────────────────────────
CREATE TABLE IF NOT EXISTS email_generation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  auto_trigger BOOLEAN DEFAULT false,
  max_parallel INT DEFAULT 3,
  generate_images BOOLEAN DEFAULT true,
  notify_on_error BOOLEAN DEFAULT true,
  notify_on_success BOOLEAN DEFAULT false,
  notify_emails TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE(org_id)
);

-- ── 4. email_generation_runs ────────────────────────────────
CREATE TABLE IF NOT EXISTS email_generation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  flow_id UUID REFERENCES email_flows(id) ON DELETE SET NULL,
  email_id UUID REFERENCES email_flow_emails(id) ON DELETE SET NULL,
  triggered_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  batch_id UUID,
  agent TEXT NOT NULL CHECK (agent IN ('seed','copy','image','html')),
  agent_config_id UUID REFERENCES email_agent_configs(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','success','error','skipped')),
  input_vars JSONB,
  rendered_prompt TEXT,
  raw_output TEXT,
  parsed_output JSONB,
  model TEXT,
  tokens_input INT DEFAULT 0,
  tokens_output INT DEFAULT 0,
  cost_cents NUMERIC(10,4) DEFAULT 0,
  duration_ms INT DEFAULT 0,
  error_message TEXT,
  error_stack TEXT,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gen_runs_email
  ON email_generation_runs(email_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gen_runs_store
  ON email_generation_runs(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gen_runs_batch
  ON email_generation_runs(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gen_runs_errors
  ON email_generation_runs(status) WHERE status = 'error';

-- ── 5. email_reference_templates ────────────────────────────
CREATE TABLE IF NOT EXISTS email_reference_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_type TEXT,
  name TEXT NOT NULL,
  html TEXT,
  thumbnail TEXT,
  tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE email_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_agent_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_generation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_generation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_reference_templates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'email_blueprints' AND policyname = 'authenticated_full_access') THEN
    CREATE POLICY "authenticated_full_access" ON email_blueprints FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'email_agent_configs' AND policyname = 'authenticated_full_access') THEN
    CREATE POLICY "authenticated_full_access" ON email_agent_configs FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'email_generation_settings' AND policyname = 'authenticated_full_access') THEN
    CREATE POLICY "authenticated_full_access" ON email_generation_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'email_generation_runs' AND policyname = 'authenticated_full_access') THEN
    CREATE POLICY "authenticated_full_access" ON email_generation_runs FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'email_reference_templates' AND policyname = 'authenticated_full_access') THEN
    CREATE POLICY "authenticated_full_access" ON email_reference_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Triggers updated_at ─────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_email_blueprints_updated_at ON email_blueprints;
CREATE TRIGGER trg_email_blueprints_updated_at
  BEFORE UPDATE ON email_blueprints
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_email_generation_settings_updated_at ON email_generation_settings;
CREATE TRIGGER trg_email_generation_settings_updated_at
  BEFORE UPDATE ON email_generation_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
