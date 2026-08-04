-- ═══════════════════════════════════════════════════════════════════
-- APLICAR TUDO — pacote comercial ago/2026 (script consolidado)
-- ═══════════════════════════════════════════════════════════════════
-- Junta, NA ORDEM CERTA, as migrations:
--   20261066_fix_deal_won_trigger.sql  (drag pra Ganho não reverte mais)
--   20261067_crm_products.sql          (catálogo + produtos no negócio)
--   20261068_crm_gaps_p0_p1_p2.sql     (P0/P1/P2 do comercial)
--
-- Idempotente: pode rodar mais de uma vez sem estragar nada.
-- Cole inteiro no SQL Editor do Supabase e execute uma única vez.

-- ────────────────────────────────────────────────────────────────────
-- PARTE 1/3 — Trigger deal.won fail-open (migration 20261066)
-- Mover deal pra etapa de ganho abortava o UPDATE (colunas inexistentes
-- referenciadas no trigger) e o card "voltava". Agora o evento nunca
-- bloqueia o move.
-- ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ensure_onboarding_on_deal_won() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_stage_name TEXT;
  v_stage_type TEXT;
  v_row JSONB;
  v_actor UUID;
  v_org UUID;
BEGIN
  SELECT name, stage_type INTO v_stage_name, v_stage_type
  FROM pipeline_stages WHERE id = NEW.stage_id;

  IF v_stage_name NOT IN ('Fechado Ganho','Ganho','Won','Closed Won','Fechado')
     AND COALESCE(v_stage_type,'open') NOT IN ('won') THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_row := to_jsonb(NEW);
    v_actor := COALESCE(NEW.owner_id, (v_row->>'created_by')::uuid);
    v_org := (v_row->>'org_id')::uuid;

    IF v_org IS NULL AND NEW.owner_id IS NOT NULL THEN
      SELECT om.org_id INTO v_org
      FROM org_members om
      WHERE om.profile_id = NEW.owner_id AND om.is_active = true
      LIMIT 1;
    END IF;

    INSERT INTO events (event_type, entity_type, entity_id, actor_id, actor_type, payload, metadata)
    VALUES (
      'deal.won',
      'deal',
      NEW.id,
      v_actor,
      'system',
      jsonb_build_object(
        'deal_id', NEW.id,
        'client_id', NEW.client_id,
        'store_id', v_row->>'store_id',
        'pipeline_id', NEW.pipeline_id,
        'title', NEW.title,
        'value', NEW.value
      ),
      jsonb_build_object('org_id', v_org)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ensure_onboarding_on_deal_won: evento deal.won nao publicado para deal % (%); o move do deal segue normalmente', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_deal_stage_change_to_won ON deals;
CREATE TRIGGER on_deal_stage_change_to_won
  AFTER UPDATE OF stage_id ON deals
  FOR EACH ROW
  WHEN (NEW.stage_id IS DISTINCT FROM OLD.stage_id)
  EXECUTE FUNCTION ensure_onboarding_on_deal_won();

-- ────────────────────────────────────────────────────────────────────
-- PARTE 2/3 — Produtos no negócio (migration 20261067)
-- ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION crm_set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS crm_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  currency TEXT NOT NULL DEFAULT 'BRL',
  billing_type TEXT NOT NULL DEFAULT 'one_time'
    CHECK (billing_type IN ('one_time','recurring')),
  recurring_interval TEXT
    CHECK (recurring_interval IS NULL OR recurring_interval IN ('monthly','quarterly','yearly')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_products_org_name
  ON crm_products (org_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_crm_products_org_active
  ON crm_products (org_id, is_active);

DROP TRIGGER IF EXISTS trg_crm_products_updated_at ON crm_products;
CREATE TRIGGER trg_crm_products_updated_at BEFORE UPDATE ON crm_products
  FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

CREATE TABLE IF NOT EXISTS crm_deal_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  product_id UUID REFERENCES crm_products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100),
  billing_type TEXT NOT NULL DEFAULT 'one_time'
    CHECK (billing_type IN ('one_time','recurring')),
  note TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_deal_products_deal
  ON crm_deal_products (deal_id, position);
CREATE INDEX IF NOT EXISTS idx_crm_deal_products_product
  ON crm_deal_products (product_id);

ALTER TABLE crm_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_deal_products ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "crm_products_all" ON crm_products
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "crm_deal_products_all" ON crm_deal_products
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ────────────────────────────────────────────────────────────────────
-- PARTE 3/3 — Pacote P0/P1/P2 (migration 20261068)
-- ────────────────────────────────────────────────────────────────────

-- Observação por item (no-op aqui: o CREATE acima já tem a coluna)
ALTER TABLE crm_deal_products ADD COLUMN IF NOT EXISTS note TEXT;

-- Motivos de perda configuráveis
CREATE TABLE IF NOT EXISTS crm_lost_reasons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL,
  label TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_lost_reasons_org_label
  ON crm_lost_reasons (org_id, lower(label));
CREATE INDEX IF NOT EXISTS idx_crm_lost_reasons_org
  ON crm_lost_reasons (org_id, is_active, position);

ALTER TABLE crm_lost_reasons ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "crm_lost_reasons_all" ON crm_lost_reasons
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Campos obrigatórios por etapa
ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS required_fields JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Rodízio e visibilidade por pipeline
ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS assignment_mode TEXT NOT NULL DEFAULT 'manual'
  CHECK (assignment_mode IN ('manual','round_robin'));
ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'all'
  CHECK (visibility IN ('all','owner_only'));

-- Automação: wait real com retomada
ALTER TABLE crm_automation_runs ADD COLUMN IF NOT EXISTS resume_at TIMESTAMPTZ;
ALTER TABLE crm_automation_runs ADD COLUMN IF NOT EXISTS resume_node_id TEXT;
ALTER TABLE crm_automation_runs ADD COLUMN IF NOT EXISTS context_snapshot JSONB;

DO $$ BEGIN
  ALTER TABLE crm_automation_runs DROP CONSTRAINT IF EXISTS crm_automation_runs_status_check;
  ALTER TABLE crm_automation_runs ADD CONSTRAINT crm_automation_runs_status_check
    CHECK (status IN ('pending','running','waiting','completed','failed','skipped'));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'crm_automation_runs status check nao atualizado: %', SQLERRM;
END $$;

CREATE INDEX IF NOT EXISTS idx_crm_automation_runs_resume
  ON crm_automation_runs (resume_at)
  WHERE status = 'waiting';

-- ────────────────────────────────────────────────────────────────────
-- Verificação: as 8 linhas devem voltar "OK"
-- ────────────────────────────────────────────────────────────────────
SELECT 'crm_products' AS item,
       CASE WHEN to_regclass('public.crm_products') IS NOT NULL THEN 'OK' ELSE 'FALTA' END AS status
UNION ALL
SELECT 'crm_deal_products',
       CASE WHEN to_regclass('public.crm_deal_products') IS NOT NULL THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'crm_deal_products.note',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_name='crm_deal_products' AND column_name='note') THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'crm_lost_reasons',
       CASE WHEN to_regclass('public.crm_lost_reasons') IS NOT NULL THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'pipeline_stages.required_fields',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_name='pipeline_stages' AND column_name='required_fields') THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'pipelines.assignment_mode/visibility',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_name='pipelines' AND column_name='assignment_mode')
        AND EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_name='pipelines' AND column_name='visibility') THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'crm_automation_runs.resume_at (wait real)',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
         WHERE table_name='crm_automation_runs' AND column_name='resume_at') THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'trigger deal.won fail-open',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='on_deal_stage_change_to_won') THEN 'OK' ELSE 'FALTA' END;
