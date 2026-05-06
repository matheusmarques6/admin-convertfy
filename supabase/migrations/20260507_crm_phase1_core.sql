-- ============================================================
-- CRM Convertfy — Fase 1: Core (extensão das tabelas existentes + novas)
--
-- Estratégia (Caminho A do prompt v2): estende `pipelines`, `pipeline_stages`,
-- `deals` existentes com colunas faltantes em vez de criar `crm_*` paralelas.
-- Tabelas auxiliares novas usam prefixo `crm_` (leads, contacts, partners,
-- deal_history, deal_activities, deal_tags).
--
-- Referências:
--   docs/crm/ARQUITETURA_CRM_CONVERTFY.md  (modelo de dados §2)
--   docs/crm/PIPELINES_AGENCIA_CONVERTFY.md (etapas detalhadas §2 e §3)
-- ============================================================

-- ── Enums ────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE pipeline_scope AS ENUM ('sales', 'cs', 'internal');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE deal_status AS ENUM ('open', 'won', 'lost', 'archived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE stage_type AS ENUM ('open', 'won', 'lost', 'archived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE lead_status AS ENUM ('new', 'qualified', 'unqualified', 'converted', 'lost');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE partner_type AS ENUM ('agency', 'freelancer', 'influencer', 'other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE partner_state AS ENUM ('prospect', 'active', 'inactive', 'top_performer', 'closed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Pipelines: campos novos ──────────────────────────────────
ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS scope pipeline_scope NOT NULL DEFAULT 'sales';
ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#1F1F1F';
ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS default_assignee_id UUID REFERENCES profiles(id);
ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;
ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS layout TEXT DEFAULT 'kanban' CHECK (layout IN ('kanban', 'state'));
-- 'state' = pipeline não-linear (ex: Gestão de Carteira) — UI muda

CREATE INDEX IF NOT EXISTS idx_pipelines_scope ON pipelines(scope) WHERE is_archived = false;

-- ── Pipeline Stages: campos novos ───────────────────────────
ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS stage_type stage_type NOT NULL DEFAULT 'open';
ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS sla_hours INTEGER;
ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS automation_on_enter JSONB;
-- automation_on_enter: DAG simples a executar quando deal entra na etapa.
-- Ex: { actions: [{ type: 'create_task', config: {...} }] }
ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS exit_criteria TEXT;
-- exit_criteria: critério de saída factual da etapa (texto curto).

-- ── Deals: campos novos ──────────────────────────────────────
ALTER TABLE deals ADD COLUMN IF NOT EXISTS lead_id UUID;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES client_stores(id) ON DELETE SET NULL;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS status deal_status NOT NULL DEFAULT 'open';
ALTER TABLE deals ADD COLUMN IF NOT EXISTS lost_reason TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS won_reason TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS won_at TIMESTAMPTZ;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS lost_at TIMESTAMPTZ;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS utm JSONB DEFAULT '{}'::jsonb;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'BRL';
ALTER TABLE deals ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE deals ADD COLUMN IF NOT EXISTS referrer_partner_id UUID;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS last_stage_changed_at TIMESTAMPTZ DEFAULT NOW();
-- last_stage_changed_at: usado pra detectar SLA estourado por etapa.

CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status);
CREATE INDEX IF NOT EXISTS idx_deals_pipeline_stage ON deals(pipeline_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_deals_owner ON deals(owner_id);
CREATE INDEX IF NOT EXISTS idx_deals_store ON deals(store_id) WHERE store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_client ON deals(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_last_stage_changed ON deals(last_stage_changed_at);

-- ── crm_leads ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  role TEXT,
  source TEXT,
  utm JSONB DEFAULT '{}'::jsonb,
  status lead_status NOT NULL DEFAULT 'new',
  converted_to_client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  converted_to_deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  enrichment JSONB DEFAULT '{}'::jsonb,
  ai_qualification_score INTEGER CHECK (ai_qualification_score IS NULL OR ai_qualification_score BETWEEN 0 AND 100),
  ai_qualification_reason TEXT,
  notes TEXT,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  tags TEXT[] DEFAULT '{}',
  last_contacted_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_leads_status ON crm_leads(status);
CREATE INDEX IF NOT EXISTS idx_crm_leads_assigned ON crm_leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_crm_leads_email ON crm_leads(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_leads_phone ON crm_leads(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_leads_created ON crm_leads(created_at DESC);

-- FK do deals.lead_id (depois que crm_leads existe)
DO $$ BEGIN
  ALTER TABLE deals ADD CONSTRAINT deals_lead_id_fkey
    FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── crm_contacts (contatos por cliente) ──────────────────────
CREATE TABLE IF NOT EXISTS crm_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  store_id UUID REFERENCES client_stores(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT,
  is_primary BOOLEAN DEFAULT false,
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_client ON crm_contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_store ON crm_contacts(store_id) WHERE store_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_contacts_one_primary
  ON crm_contacts(client_id) WHERE is_primary = true;

-- ── crm_partners (parceiros e influenciadores) ───────────────
CREATE TABLE IF NOT EXISTS crm_partners (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  partner_type partner_type NOT NULL DEFAULT 'other',
  state partner_state NOT NULL DEFAULT 'prospect',
  commission_pct NUMERIC(5,2) DEFAULT 0,
  commission_terms TEXT,
  total_deals_won INTEGER DEFAULT 0,
  total_revenue_cents BIGINT DEFAULT 0,
  total_commission_paid_cents BIGINT DEFAULT 0,
  total_commission_due_cents BIGINT DEFAULT 0,
  last_referral_at TIMESTAMPTZ,
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_partners_state ON crm_partners(state);

-- FK do deals.referrer_partner_id (depois que crm_partners existe)
DO $$ BEGIN
  ALTER TABLE deals ADD CONSTRAINT deals_referrer_partner_id_fkey
    FOREIGN KEY (referrer_partner_id) REFERENCES crm_partners(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── crm_deal_history (audit log de mudanças) ────────────────
CREATE TABLE IF NOT EXISTS crm_deal_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  field TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  automation_id UUID, -- referencia futura a crm_automations
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_deal_history_deal ON crm_deal_history(deal_id, changed_at DESC);

-- ── crm_deal_activities (timeline visível na ficha) ─────────
DO $$ BEGIN
  CREATE TYPE crm_activity_type AS ENUM (
    'note', 'call', 'email', 'wa_message', 'ig_message',
    'meeting', 'task', 'system', 'stage_change', 'file_attached'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS crm_deal_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES crm_leads(id) ON DELETE CASCADE,
  type crm_activity_type NOT NULL,
  content TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  is_internal BOOLEAN DEFAULT true, -- nota interna vs mensagem externa
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_deal_activities_target CHECK (deal_id IS NOT NULL OR lead_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_crm_deal_activities_deal ON crm_deal_activities(deal_id, created_at DESC) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_deal_activities_lead ON crm_deal_activities(lead_id, created_at DESC) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_deal_activities_due ON crm_deal_activities(due_at) WHERE due_at IS NOT NULL AND completed_at IS NULL;

-- ── crm_deal_tags (n-n) ──────────────────────────────────────
-- Mantemos tambem deals.tags (text[]) como conveniencia, mas a tabela
-- normalizada permite cores e queries melhores.
CREATE TABLE IF NOT EXISTS crm_deal_tags (
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE NOT NULL,
  PRIMARY KEY (deal_id, tag_id)
);

-- ── crm_health_history (sparkline do health score) ───────────
CREATE TABLE IF NOT EXISTS crm_health_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID REFERENCES client_stores(id) ON DELETE CASCADE NOT NULL,
  health_score INTEGER NOT NULL CHECK (health_score BETWEEN 0 AND 100),
  components JSONB DEFAULT '{}'::jsonb, -- { asaas: 40, revenue: 30, integrations: 20, nps: 10 }
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_health_history_store_date ON crm_health_history(store_id, computed_at DESC);

-- ── client_stores: adicionar mrr e contract_end_date se não existem ─
ALTER TABLE client_stores ADD COLUMN IF NOT EXISTS mrr_cents BIGINT DEFAULT 0;
ALTER TABLE client_stores ADD COLUMN IF NOT EXISTS contract_start_date DATE;
ALTER TABLE client_stores ADD COLUMN IF NOT EXISTS contract_end_date DATE;
ALTER TABLE client_stores ADD COLUMN IF NOT EXISTS health_score INTEGER DEFAULT 50 CHECK (health_score BETWEEN 0 AND 100);
ALTER TABLE client_stores ADD COLUMN IF NOT EXISTS nps_last_score INTEGER CHECK (nps_last_score IS NULL OR nps_last_score BETWEEN 0 AND 10);
ALTER TABLE client_stores ADD COLUMN IF NOT EXISTS nps_last_at TIMESTAMPTZ;

-- ── Trigger: atualiza last_stage_changed_at quando deal muda etapa ─
CREATE OR REPLACE FUNCTION crm_deals_track_stage_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    NEW.last_stage_changed_at = NOW();
    -- Insere no history
    INSERT INTO crm_deal_history (deal_id, changed_by, field, old_value, new_value)
    VALUES (NEW.id, NEW.owner_id, 'stage_id',
            to_jsonb(OLD.stage_id::text), to_jsonb(NEW.stage_id::text));
    -- Atividade na timeline
    INSERT INTO crm_deal_activities (deal_id, type, content, created_by, is_internal)
    VALUES (NEW.id, 'stage_change',
            'Etapa alterada',
            NEW.owner_id, true);
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'won' AND OLD.status != 'won' THEN
      NEW.won_at = COALESCE(NEW.won_at, NOW());
    END IF;
    IF NEW.status = 'lost' AND OLD.status != 'lost' THEN
      NEW.lost_at = COALESCE(NEW.lost_at, NOW());
    END IF;
  END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_deals_stage_change ON deals;
CREATE TRIGGER trg_crm_deals_stage_change
  BEFORE UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION crm_deals_track_stage_change();

-- ── Trigger: updated_at em todas as crm_* ────────────────────
CREATE OR REPLACE FUNCTION crm_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_leads_updated_at ON crm_leads;
CREATE TRIGGER trg_crm_leads_updated_at BEFORE UPDATE ON crm_leads
  FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

DROP TRIGGER IF EXISTS trg_crm_contacts_updated_at ON crm_contacts;
CREATE TRIGGER trg_crm_contacts_updated_at BEFORE UPDATE ON crm_contacts
  FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

DROP TRIGGER IF EXISTS trg_crm_partners_updated_at ON crm_partners;
CREATE TRIGGER trg_crm_partners_updated_at BEFORE UPDATE ON crm_partners
  FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

-- ── RLS: desabilitamos pra essas tabelas (mesmo padrão do projeto) ─
-- Multi-tenant é garantido por server actions que checam org_id via session.
ALTER TABLE crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_deal_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_deal_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_deal_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_health_history ENABLE ROW LEVEL SECURITY;

-- Policies permissivas (ja que admin valida acesso via server action).
DO $$ BEGIN
  CREATE POLICY "crm_leads_all" ON crm_leads FOR ALL USING (true) WITH CHECK (true);
  CREATE POLICY "crm_contacts_all" ON crm_contacts FOR ALL USING (true) WITH CHECK (true);
  CREATE POLICY "crm_partners_all" ON crm_partners FOR ALL USING (true) WITH CHECK (true);
  CREATE POLICY "crm_deal_history_all" ON crm_deal_history FOR ALL USING (true) WITH CHECK (true);
  CREATE POLICY "crm_deal_activities_all" ON crm_deal_activities FOR ALL USING (true) WITH CHECK (true);
  CREATE POLICY "crm_deal_tags_all" ON crm_deal_tags FOR ALL USING (true) WITH CHECK (true);
  CREATE POLICY "crm_health_history_all" ON crm_health_history FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

COMMENT ON TABLE crm_leads IS 'Prospects ainda nao convertidos em clients. Convertidos preservam ref via converted_to_client_id.';
COMMENT ON TABLE crm_contacts IS 'Multiplos contatos por client/store (decisor, financeiro, tecnico).';
COMMENT ON TABLE crm_partners IS 'Parceiros e influenciadores que indicam leads.';
COMMENT ON TABLE crm_deal_activities IS 'Timeline da ficha de deal (notas, mensagens, eventos sistema).';
