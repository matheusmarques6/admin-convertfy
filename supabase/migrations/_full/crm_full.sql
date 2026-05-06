-- ════════════════════════════════════════════════════════════════════
-- CRM Convertfy — Migration completa (Fases 1, 4, 5, 6 + seed)
-- 
-- Execute este script INTEIRO no SQL Editor do Supabase Studio.
-- Idempotente: pode rodar varias vezes sem quebrar (IF NOT EXISTS,
-- ON CONFLICT DO NOTHING, EXCEPTION WHEN duplicate_object).
-- 
-- Pre-requisitos: projeto admin-convertfy com tabelas pipelines,
-- pipeline_stages, deals, automations, organizations, profiles,
-- clients, client_stores, tags ja existentes.
-- 
-- Tempo estimado: ~5s em projeto vazio. Cria 18 tabelas/extensoes,
-- 8 pipelines com 76 estagios e 13 tags.
-- ════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════
-- FASE 1 — CORE SCHEMA
-- ═══════════════════════════════════════════════════════════════════

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


-- ═══════════════════════════════════════════════════════════════════
-- FASE 1 — SEED (8 pipelines + tags)
-- ═══════════════════════════════════════════════════════════════════

-- ============================================================
-- CRM Convertfy — Fase 1: Seed dos 8 pipelines core
--
-- Pipelines criados (todos com is_default=false pra nao conflitar
-- com a "pipeline padrao" historica do projeto):
--
--   COMERCIAL (scope='sales'):
--     1. Funil Inbound        — leads de Ads/Site
--     2. Funil Outbound       — prospeccao ativa
--     3. Indicacoes & Parceiros
--
--   CUSTOMER SUCCESS (scope='cs'):
--     4. Onboarding 30d
--     5. Gestao de Carteira (state-based, layout='state')
--     6. Feedback Mensal de Resultado
--     7. Implementacoes & Campanhas
--     8. Tickets de Cliente
-- ============================================================

DO $$
DECLARE
  v_pipeline_id UUID;
  v_admin_id UUID;
BEGIN

-- Pega um admin pra ser created_by (ou NULL se nao houver).
SELECT id INTO v_admin_id FROM profiles WHERE role = 'admin' LIMIT 1;

-- ─────────────────────────────────────────────────────────────
-- 1. Funil Inbound (sales) — Ads e formulario do site
-- ─────────────────────────────────────────────────────────────
INSERT INTO pipelines (name, description, scope, color, is_default, layout, created_by)
VALUES (
  'Funil Inbound',
  'Negociacoes vindas de Ads (Meta, Google, YouTube) e formulario do site. Velocidade de resposta e o principal preditor de conversao.',
  'sales', '#1F1F1F', false, 'kanban', v_admin_id
)
RETURNING id INTO v_pipeline_id;

INSERT INTO pipeline_stages (pipeline_id, name, color, "order", stage_type, sla_hours, exit_criteria) VALUES
  (v_pipeline_id, 'Lead novo',           '#71717A', 1, 'open', 1,    'Lead criado, ainda nao contactado'),
  (v_pipeline_id, 'Tentativa de contato','#854D0E', 2, 'open', 24,   'Primeira tentativa feita (WhatsApp, ligacao, email)'),
  (v_pipeline_id, 'Conversa iniciada',   '#0284C7', 3, 'open', 48,   'Lead respondeu'),
  (v_pipeline_id, 'Qualificado',         '#1D4ED8', 4, 'open', 72,   'Pessoa de decisao confirmada, fit confirmado'),
  (v_pipeline_id, 'Reuniao agendada',    '#7C3AED', 5, 'open', NULL, 'Booking confirmado (cal.com / agenda)'),
  (v_pipeline_id, 'Reuniao realizada',   '#6D28D9', 6, 'open', 48,   'Reuniao aconteceu (presenca confirmada)'),
  (v_pipeline_id, 'Proposta enviada',    '#EA580C', 7, 'open', 168,  'Documento de proposta entregue'),
  (v_pipeline_id, 'Negociacao',          '#C2410C', 8, 'open', 168,  'Proposta em revisao pelo lead'),
  (v_pipeline_id, 'Ganho',               '#047857', 9, 'won',  NULL, 'Contrato assinado, primeiro pagamento confirmado'),
  (v_pipeline_id, 'Perdido — sem fit',   '#52525B',10, 'lost', NULL, 'Nao e nosso ICP'),
  (v_pipeline_id, 'Perdido — preco',     '#B91C1C',11, 'lost', NULL, 'Lead achou caro'),
  (v_pipeline_id, 'Perdido — timing',    '#B91C1C',12, 'lost', NULL, 'Volta depois — followup 60d'),
  (v_pipeline_id, 'Perdido — concorrente','#991B1B',13,'lost', NULL, 'Concorrente fechou'),
  (v_pipeline_id, 'No-show',             '#991B1B',14, 'lost', NULL, 'Nao apareceu na reuniao 2x');

-- ─────────────────────────────────────────────────────────────
-- 2. Funil Outbound (sales)
-- ─────────────────────────────────────────────────────────────
INSERT INTO pipelines (name, description, scope, color, is_default, layout, created_by)
VALUES (
  'Funil Outbound',
  'Prospeccao ativa: listas curadas de e-commerces. Cadencia de touchpoints estruturada (1, 2, 3) com follow-ups.',
  'sales', '#1F1F1F', false, 'kanban', v_admin_id
)
RETURNING id INTO v_pipeline_id;

INSERT INTO pipeline_stages (pipeline_id, name, color, "order", stage_type, sla_hours, exit_criteria) VALUES
  (v_pipeline_id, 'Lista',              '#71717A', 1, 'open', NULL, 'Lead adicionado a lista'),
  (v_pipeline_id, 'Pesquisa feita',     '#A1A1AA', 2, 'open', 48,   'Investigacao basica (porte, stack, dor)'),
  (v_pipeline_id, 'Touchpoint 1',       '#0284C7', 3, 'open', 24,   'Mensagem inicial enviada'),
  (v_pipeline_id, 'Touchpoint 2',       '#0284C7', 4, 'open', 120,  'Follow-up 1 enviado'),
  (v_pipeline_id, 'Touchpoint 3',       '#1D4ED8', 5, 'open', 120,  'Follow-up 2 enviado'),
  (v_pipeline_id, 'Resposta recebida',  '#10B981', 6, 'open', 24,   'Lead respondeu (positiva/negativa/neutra)'),
  (v_pipeline_id, 'Discovery agendado', '#7C3AED', 7, 'open', NULL, 'Booking de discovery confirmado'),
  (v_pipeline_id, 'Discovery realizado','#6D28D9', 8, 'open', 48,   'Call aconteceu'),
  (v_pipeline_id, 'Proposta enviada',   '#EA580C', 9, 'open', 168,  'Proposta entregue'),
  (v_pipeline_id, 'Negociacao',         '#C2410C',10, 'open', 168,  'Em discussao'),
  (v_pipeline_id, 'Ganho',              '#047857',11, 'won',  NULL, 'Fechado'),
  (v_pipeline_id, 'Cold (sem resposta)','#3F3F46',12, 'lost', NULL, 'Apos 3 touchpoints — revisitar em 6 meses'),
  (v_pipeline_id, 'Perdido — sem fit',  '#52525B',13, 'lost', NULL, NULL),
  (v_pipeline_id, 'Perdido — sem interesse','#B91C1C',14,'lost', NULL, NULL);

-- ─────────────────────────────────────────────────────────────
-- 3. Indicacoes & Parceiros (sales)
-- ─────────────────────────────────────────────────────────────
INSERT INTO pipelines (name, description, scope, color, is_default, layout, created_by)
VALUES (
  'Indicacoes & Parceiros',
  'Referrals de clientes existentes e parceiros. Conversao 10-30x maior que outbound — pipeline separado pra acompanhar performance dos indicadores.',
  'sales', '#047857', false, 'kanban', v_admin_id
)
RETURNING id INTO v_pipeline_id;

INSERT INTO pipeline_stages (pipeline_id, name, color, "order", stage_type, sla_hours, exit_criteria) VALUES
  (v_pipeline_id, 'Indicacao recebida', '#0284C7', 1, 'open', 24,   'Parceiro/cliente passou contato'),
  (v_pipeline_id, 'Contato feito',      '#1D4ED8', 2, 'open', 48,   'Conversa com o lead'),
  (v_pipeline_id, 'Reuniao agendada',   '#7C3AED', 3, 'open', NULL, 'Booking'),
  (v_pipeline_id, 'Reuniao realizada',  '#6D28D9', 4, 'open', 48,   'Aconteceu'),
  (v_pipeline_id, 'Proposta enviada',   '#EA580C', 5, 'open', 120,  'Proposta entregue'),
  (v_pipeline_id, 'Ganho',              '#047857', 6, 'won',  NULL, 'Fechado'),
  (v_pipeline_id, 'Perdido',            '#B91C1C', 7, 'lost', NULL, 'Com motivo registrado');

-- ─────────────────────────────────────────────────────────────
-- 4. Onboarding 30d (cs) — primeiro pipeline pos-venda
-- ─────────────────────────────────────────────────────────────
INSERT INTO pipelines (name, description, scope, color, is_default, layout, created_by)
VALUES (
  'Onboarding 30d',
  'Onboarding obrigatorio dos primeiros 30 dias. 86% dos clientes dizem que onboarding influencia retencao. Cada cliente novo entra aqui automaticamente apos won.',
  'cs', '#0284C7', false, 'kanban', v_admin_id
)
RETURNING id INTO v_pipeline_id;

INSERT INTO pipeline_stages (pipeline_id, name, color, "order", stage_type, sla_hours, exit_criteria) VALUES
  (v_pipeline_id, 'Pre-onboarding',         '#0284C7', 1, 'open', 24,  'Welcome email enviado, kickoff agendado'),
  (v_pipeline_id, 'Kickoff realizado',      '#1D4ED8', 2, 'open', 168, 'Reuniao de kickoff aconteceu, escopo confirmado'),
  (v_pipeline_id, 'Acessos coletados',      '#1E40AF', 3, 'open', 120, 'Logins de Klaviyo/Omnisend, Shopify, GA4, Meta Ads coletados'),
  (v_pipeline_id, 'Integracoes conectadas', '#1E3A8A', 4, 'open', 72,  'Todas integracoes sincronizando no admin'),
  (v_pipeline_id, 'Auditoria entregue',     '#EA580C', 5, 'open', 240, 'Documento de auditoria inicial entregue ao cliente'),
  (v_pipeline_id, 'Estrategia validada',    '#C2410C', 6, 'open', 168, 'Cliente aprovou plano de acao'),
  (v_pipeline_id, 'Primeira entrega aprovada','#10B981', 7, 'open', 720, 'Primeira campanha/automacao live e aprovada'),
  (v_pipeline_id, 'Onboarding concluido',   '#047857', 8, 'won',  NULL,'Cliente em operacao continua → migra para Carteira'),
  (v_pipeline_id, 'Bloqueado',              '#B91C1C', 9, 'lost', 168, 'Algo travando ha mais de 7 dias');

-- ─────────────────────────────────────────────────────────────
-- 5. Gestao de Carteira (cs, state-based)
-- ─────────────────────────────────────────────────────────────
INSERT INTO pipelines (name, description, scope, color, is_default, layout, created_by)
VALUES (
  'Gestao de Carteira',
  'Saude da carteira ativa. Cada cliente vive em UMA etapa = estado da conta (nao funil progressivo). Health score recalculado diariamente.',
  'cs', '#10B981', false, 'state', v_admin_id
)
RETURNING id INTO v_pipeline_id;

INSERT INTO pipeline_stages (pipeline_id, name, color, "order", stage_type, sla_hours, exit_criteria, description) VALUES
  (v_pipeline_id, 'Saudavel',          '#047857', 1, 'open', NULL, 'Score 80-100', 'Pagamento em dia + receita estavel + NPS positivo + integracoes OK'),
  (v_pipeline_id, 'Atencao',           '#854D0E', 2, 'open', 168,  'Score 60-79', 'Queda 15-30%, atraso 1-7 dias, NPS neutro'),
  (v_pipeline_id, 'Risco',             '#B91C1C', 3, 'open', 72,   'Score 30-59', 'Queda > 30%, atraso > 7d, NPS negativo'),
  (v_pipeline_id, 'Em recuperacao',    '#C2410C', 4, 'open', 168,  'Score < 30 com plano ativo', 'CSM iniciou plano formal'),
  (v_pipeline_id, 'Churn iminente',    '#3F3F46', 5, 'open', NULL, 'Cliente avisou cancelamento', 'Reuniao de retencao ou aceitacao'),
  (v_pipeline_id, 'Churn',             '#18181B', 6, 'lost', NULL, 'Cancelou', 'Migra para pipeline Recuperacao');

-- ─────────────────────────────────────────────────────────────
-- 6. Feedback Mensal de Resultado (cs, recorrente)
-- ─────────────────────────────────────────────────────────────
INSERT INTO pipelines (name, description, scope, color, is_default, layout, created_by)
VALUES (
  'Feedback Mensal',
  'Reuniao formal mensal de resultados — principal momento de demonstrar valor. Card recorrente: virou mes, novo card pra cada cliente ativo.',
  'cs', '#7C3AED', false, 'kanban', v_admin_id
)
RETURNING id INTO v_pipeline_id;

INSERT INTO pipeline_stages (pipeline_id, name, color, "order", stage_type, sla_hours, exit_criteria) VALUES
  (v_pipeline_id, 'A iniciar',         '#71717A', 1, 'open', 48,  'Mes fechou, report ainda nao comecou'),
  (v_pipeline_id, 'Coleta de dados',   '#0284C7', 2, 'open', 72,  'Especialistas puxando numeros (Klaviyo, GA4, Meta, Shopify)'),
  (v_pipeline_id, 'Analise feita',     '#1D4ED8', 3, 'open', 48,  'CSM consolidou narrativa'),
  (v_pipeline_id, 'Report finalizado', '#EA580C', 4, 'open', 24,  'Documento pronto pra envio'),
  (v_pipeline_id, 'Reuniao agendada',  '#7C3AED', 5, 'open', 120, 'Cliente confirmou agenda'),
  (v_pipeline_id, 'Reuniao realizada', '#6D28D9', 6, 'open', 24,  'Apresentacao aconteceu'),
  (v_pipeline_id, 'NPS coletado',      '#10B981', 7, 'open', 72,  'Pesquisa enviada e respondida'),
  (v_pipeline_id, 'Concluido',         '#047857', 8, 'won',  NULL,'Tudo registrado');

-- ─────────────────────────────────────────────────────────────
-- 7. Implementacoes & Campanhas (cs)
-- ─────────────────────────────────────────────────────────────
INSERT INTO pipelines (name, description, scope, color, is_default, layout, created_by)
VALUES (
  'Implementacoes & Campanhas',
  'Projetos pontuais: implementar fluxo, preparar campanha sazonal, migrar de Klaviyo pra Omnisend. Cada card e um projeto com escopo definido.',
  'cs', '#EA580C', false, 'kanban', v_admin_id
)
RETURNING id INTO v_pipeline_id;

INSERT INTO pipeline_stages (pipeline_id, name, color, "order", stage_type, sla_hours, exit_criteria) VALUES
  (v_pipeline_id, 'Briefing',           '#71717A', 1, 'open', 48,  'Escopo coletado, alinhado'),
  (v_pipeline_id, 'Em producao',        '#0284C7', 2, 'open', 168, 'Time interno produzindo (criativo, copy, configuracao)'),
  (v_pipeline_id, 'Revisao interna',    '#1D4ED8', 3, 'open', 48,  'Aprovacao da lideranca antes do cliente'),
  (v_pipeline_id, 'Aprovacao cliente',  '#7C3AED', 4, 'open', 72,  'Cliente aprovou'),
  (v_pipeline_id, 'No ar',              '#10B981', 5, 'open', NULL,'Implementacao live'),
  (v_pipeline_id, 'Resultado avaliado', '#EA580C', 6, 'open', 336, 'Pos-mortem em 14 dias'),
  (v_pipeline_id, 'Concluido',          '#047857', 7, 'won',  NULL,'Documentado, fechado'),
  (v_pipeline_id, 'Bloqueado',          '#854D0E', 8, 'open', NULL,'Cliente nao aprova ou problema tecnico'),
  (v_pipeline_id, 'Cancelado',          '#B91C1C', 9, 'lost', NULL,'Cliente cancelou o projeto');

-- ─────────────────────────────────────────────────────────────
-- 8. Tickets de Cliente (cs)
-- ─────────────────────────────────────────────────────────────
INSERT INTO pipelines (name, description, scope, color, is_default, layout, created_by)
VALUES (
  'Tickets de Cliente',
  'Pedidos diarios pequenos do cliente: ajustar copy, criar promocao rapida, etc. Diferente de Implementacoes (projeto formal) — aqui e demanda diaria.',
  'cs', '#A1A1AA', false, 'kanban', v_admin_id
)
RETURNING id INTO v_pipeline_id;

INSERT INTO pipeline_stages (pipeline_id, name, color, "order", stage_type, sla_hours, exit_criteria) VALUES
  (v_pipeline_id, 'Recebido',           '#71717A', 1, 'open', 4,   'Pedido entrou'),
  (v_pipeline_id, 'Avaliado',           '#0284C7', 2, 'open', 8,   'CSM/especialista classificou prioridade e escopo'),
  (v_pipeline_id, 'Em producao',        '#1D4ED8', 3, 'open', 48,  'Time trabalhando'),
  (v_pipeline_id, 'Entregue',           '#10B981', 4, 'open', 24,  'Material/ajuste enviado ao cliente'),
  (v_pipeline_id, 'Aprovado pelo cliente','#047857', 5,'open', 24,  'Cliente confirmou'),
  (v_pipeline_id, 'Concluido',          '#047857', 6, 'won',  NULL,'Fechado'),
  (v_pipeline_id, 'Recusado',           '#854D0E', 7, 'lost', NULL,'Fora do escopo (cobranca extra)'),
  (v_pipeline_id, 'Bloqueado',          '#B91C1C', 8, 'open', NULL,'Aguardando informacao do cliente');

END $$;

-- ── Tags default do CRM ──────────────────────────────────────
INSERT INTO tags (name, color, entity_type) VALUES
  ('Inbound',         '#0284C7', 'deal'),
  ('Outbound',        '#71717A', 'deal'),
  ('Ads Facebook',    '#1877F2', 'deal'),
  ('Ads Google',      '#4285F4', 'deal'),
  ('Ads YouTube',     '#FF0000', 'deal'),
  ('Ads TikTok',      '#000000', 'deal'),
  ('Form site',       '#10B981', 'deal'),
  ('Indicacao',       '#047857', 'deal'),
  ('Demo solicitada', '#7C3AED', 'deal'),
  ('Black Friday',    '#18181B', 'deal'),
  ('Renovacao',       '#10B981', 'deal'),
  ('Upsell',          '#EA580C', 'deal'),
  ('Urgente',         '#B91C1C', 'deal')
ON CONFLICT DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════
-- FASE 4 — MESSAGING (WhatsApp Cloud API + inbox)
-- ═══════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════
-- CRM Convertfy — Fase 4: Multiatendimento (WhatsApp Cloud API)
--
-- Provider pattern: cada thread pertence a um channel + provider. Hoje
-- so WhatsApp Cloud API e suportado, mas o esquema esta pronto pra
-- email/Instagram DM/etc futuramente.
--
-- Threads agrupam mensagens por (channel, contact_external_id). Uma
-- conversa e o conjunto contiguo de mensagens com a mesma tupla.
-- ════════════════════════════════════════════════════════════════════

-- ── crm_channels (configuracao de provedores por org/loja) ─────────
CREATE TABLE IF NOT EXISTS crm_channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  store_id UUID REFERENCES client_stores(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('whatsapp', 'email', 'instagram', 'facebook')),
  provider TEXT NOT NULL CHECK (provider IN ('whatsapp_cloud', 'gmail', 'instagram_basic', 'facebook_page')),

  display_name TEXT NOT NULL,
  external_id TEXT NOT NULL, -- whatsapp_phone_number_id, gmail address, etc
  config JSONB NOT NULL DEFAULT '{}'::jsonb, -- access_token (encrypted), webhook_secret etc

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_sync_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (org_id, type, external_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_channels_org ON crm_channels(org_id) WHERE is_active = TRUE;

-- ── crm_threads (uma conversa = lista de mensagens contiguas) ──────
CREATE TABLE IF NOT EXISTS crm_threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  channel_id UUID REFERENCES crm_channels(id) ON DELETE CASCADE NOT NULL,

  -- Identificador externo do contato (telefone E.164 pra WhatsApp)
  contact_external_id TEXT NOT NULL,
  contact_name TEXT,
  contact_avatar_url TEXT,

  -- Vinculo opcional com leads/deals/clients
  lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,

  -- Atribuicao
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,

  -- Estado
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved', 'archived')),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_preview TEXT,
  last_message_direction TEXT CHECK (last_message_direction IN ('inbound', 'outbound')),
  unread_count INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (channel_id, contact_external_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_threads_org_status ON crm_threads(org_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_threads_assigned ON crm_threads(assigned_to, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_threads_lead ON crm_threads(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_threads_deal ON crm_threads(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_threads_client ON crm_threads(client_id) WHERE client_id IS NOT NULL;

-- ── crm_messages (mensagens individuais) ────────────────────────────
CREATE TABLE IF NOT EXISTS crm_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID REFERENCES crm_threads(id) ON DELETE CASCADE NOT NULL,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,

  -- ID externo do provedor (idempotencia em webhook)
  external_id TEXT,

  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  content_type TEXT NOT NULL DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'contact', 'template', 'interactive', 'system')),

  body TEXT, -- texto / caption
  media_url TEXT,
  media_mime TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Quem enviou (user, automation, system, contact)
  sent_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sent_by_kind TEXT NOT NULL DEFAULT 'contact' CHECK (sent_by_kind IN ('contact', 'agent', 'automation', 'system')),

  -- Status do delivery (provedor)
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed', 'received')),
  status_updated_at TIMESTAMPTZ DEFAULT NOW(),
  error_code TEXT,
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (thread_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_messages_thread ON crm_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_crm_messages_org ON crm_messages(org_id, created_at DESC);

-- ── Trigger: atualiza last_message_* na thread quando mensagem entra
CREATE OR REPLACE FUNCTION crm_messages_update_thread()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE crm_threads
  SET
    last_message_at = NEW.created_at,
    last_message_preview = LEFT(COALESCE(NEW.body, '[' || NEW.content_type || ']'), 200),
    last_message_direction = NEW.direction,
    unread_count = CASE
      WHEN NEW.direction = 'inbound' THEN unread_count + 1
      ELSE unread_count
    END,
    updated_at = NOW()
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_messages_update_thread ON crm_messages;
CREATE TRIGGER trg_crm_messages_update_thread
AFTER INSERT ON crm_messages
FOR EACH ROW
EXECUTE FUNCTION crm_messages_update_thread();

-- ── Trigger: updated_at ────────────────────────────────────────────
CREATE TRIGGER crm_set_updated_at_channels BEFORE UPDATE ON crm_channels FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();
CREATE TRIGGER crm_set_updated_at_threads BEFORE UPDATE ON crm_threads FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

-- ── RLS (permissive — multi-tenant via org_id checks no servidor) ──
ALTER TABLE crm_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_threads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "crm_channels_authenticated" ON crm_channels
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "crm_threads_authenticated" ON crm_threads
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "crm_messages_authenticated" ON crm_messages
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ═══════════════════════════════════════════════════════════════════
-- FASE 5 — AUTOMATION + AI ACTIONS
-- ═══════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════
-- CRM Convertfy — Fase 5: Engine de automacao DAG + AI Actions
--
-- Estrategia: estender `automations` existente com campos para DAG
-- versionado e idempotencia. Manter `actions JSONB` (legado linear)
-- mas adicionar `dag JSONB` (estrutura nova).
--
-- DAG = { nodes: [{id, type, config}], edges: [{from, to, condition?}] }
--
-- AI Actions: nodes com type='ai_action' carregam prompt versionado +
-- schema de output (JSON Schema ou Zod-compatible) + model + max_tokens.
-- ════════════════════════════════════════════════════════════════════

-- ── Estende automations ────────────────────────────────────────────
ALTER TABLE automations ADD COLUMN IF NOT EXISTS scope TEXT
  CHECK (scope IS NULL OR scope IN ('sales', 'cs', 'internal', 'general'));

ALTER TABLE automations ADD COLUMN IF NOT EXISTS org_id UUID
  REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE automations ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE automations ADD COLUMN IF NOT EXISTS dag JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_automations_org_active
  ON automations(org_id, is_active) WHERE is_active = TRUE;

-- ── crm_automation_runs (execucoes individuais) ────────────────────
-- automation_logs ja existe mas e linear. Esta tabela tem estrutura
-- detalhada por DAG run.
CREATE TABLE IF NOT EXISTS crm_automation_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id UUID REFERENCES automations(id) ON DELETE CASCADE NOT NULL,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,

  -- Entidades de contexto
  trigger_type TEXT NOT NULL,
  trigger_data JSONB DEFAULT '{}'::jsonb,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
  thread_id UUID REFERENCES crm_threads(id) ON DELETE SET NULL,
  store_id UUID REFERENCES client_stores(id) ON DELETE SET NULL,

  -- Idempotencia: evita re-disparar pra mesmo trigger no mesmo target
  idempotency_key TEXT,

  -- Estado
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,

  -- Trace dos nodes executados (em ordem)
  node_results JSONB DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (automation_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_crm_automation_runs_org_status
  ON crm_automation_runs(org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_automation_runs_automation
  ON crm_automation_runs(automation_id, created_at DESC);

-- ── crm_ai_actions (versionamento de AI Actions) ───────────────────
CREATE TABLE IF NOT EXISTS crm_ai_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,

  name TEXT NOT NULL,
  description TEXT,

  -- Versionamento
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Configuracao
  model TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  max_tokens INTEGER NOT NULL DEFAULT 1024,
  temperature NUMERIC(3, 2) NOT NULL DEFAULT 0.7,

  -- Prompts (template com placeholders {{var}})
  system_prompt TEXT NOT NULL,
  user_prompt_template TEXT NOT NULL,

  -- JSON Schema do output esperado (pra validacao)
  output_schema JSONB DEFAULT '{}'::jsonb,

  -- Casos de uso: 'lead_qualification', 'reply_suggestion', 'deal_summary' etc.
  use_case TEXT NOT NULL,

  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_ai_actions_org_use_case
  ON crm_ai_actions(org_id, use_case, is_active);

-- ── crm_ai_action_runs (audit + observabilidade) ───────────────────
CREATE TABLE IF NOT EXISTS crm_ai_action_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ai_action_id UUID REFERENCES crm_ai_actions(id) ON DELETE CASCADE NOT NULL,
  automation_run_id UUID REFERENCES crm_automation_runs(id) ON DELETE SET NULL,

  input_vars JSONB NOT NULL DEFAULT '{}'::jsonb,
  rendered_prompt TEXT,
  raw_output TEXT,
  parsed_output JSONB,

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'invalid_output')),
  error_message TEXT,

  -- Telemetria
  tokens_input INTEGER,
  tokens_output INTEGER,
  cost_cents INTEGER,
  duration_ms INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_ai_action_runs_action
  ON crm_ai_action_runs(ai_action_id, created_at DESC);

-- ── Trigger: updated_at ────────────────────────────────────────────
CREATE TRIGGER crm_set_updated_at_ai_actions BEFORE UPDATE ON crm_ai_actions
FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

-- ── RLS permissive (multi-tenant via org_id no servidor) ───────────
ALTER TABLE crm_automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_ai_actions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_ai_action_runs  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "crm_automation_runs_authenticated" ON crm_automation_runs
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "crm_ai_actions_authenticated" ON crm_ai_actions
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "crm_ai_action_runs_authenticated" ON crm_ai_action_runs
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ═══════════════════════════════════════════════════════════════════
-- FASE 6 — BI SNAPSHOTS
-- ═══════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════
-- CRM Convertfy — Fase 6: BI snapshot-first
--
-- Filosofia: jamais agregar em runtime. Cron diario popula snapshots.
-- Reports leem direto da tabela de snapshots (timeseries cheap).
--
-- Tres tabelas:
-- - crm_pipeline_snapshots: por (org_id, pipeline_id, day) — open count,
--   open value, won count/value, lost count/value, ciclo medio.
-- - crm_org_snapshots: agregado da org por dia — totais cross-pipeline.
-- - crm_lead_funnel_snapshots: leads por status por dia (new, qualified,
--   converted, lost).
-- ════════════════════════════════════════════════════════════════════

-- ── crm_pipeline_snapshots ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_pipeline_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  pipeline_id UUID REFERENCES pipelines(id) ON DELETE CASCADE NOT NULL,
  day DATE NOT NULL,

  -- Estados atuais
  open_count INTEGER NOT NULL DEFAULT 0,
  open_value NUMERIC(14, 2) NOT NULL DEFAULT 0,

  -- Eventos no dia (won/lost ocorridos exatamente neste dia)
  won_count_today INTEGER NOT NULL DEFAULT 0,
  won_value_today NUMERIC(14, 2) NOT NULL DEFAULT 0,
  lost_count_today INTEGER NOT NULL DEFAULT 0,
  lost_value_today NUMERIC(14, 2) NOT NULL DEFAULT 0,

  -- Acumulados ate o dia (rolling 30d)
  won_count_30d INTEGER NOT NULL DEFAULT 0,
  won_value_30d NUMERIC(14, 2) NOT NULL DEFAULT 0,
  lost_count_30d INTEGER NOT NULL DEFAULT 0,
  lost_value_30d NUMERIC(14, 2) NOT NULL DEFAULT 0,

  -- Performance
  win_rate_30d NUMERIC(5, 2),
  avg_cycle_days_30d NUMERIC(8, 2),

  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (org_id, pipeline_id, day)
);

CREATE INDEX IF NOT EXISTS idx_crm_pipeline_snapshots_org_day
  ON crm_pipeline_snapshots(org_id, day DESC);
CREATE INDEX IF NOT EXISTS idx_crm_pipeline_snapshots_pipeline_day
  ON crm_pipeline_snapshots(pipeline_id, day DESC);

-- ── crm_org_snapshots ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_org_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  day DATE NOT NULL,

  -- Sales metrics (scope=sales)
  sales_pipeline_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  sales_open_count INTEGER NOT NULL DEFAULT 0,
  sales_won_value_30d NUMERIC(14, 2) NOT NULL DEFAULT 0,
  sales_won_count_30d INTEGER NOT NULL DEFAULT 0,
  sales_win_rate_30d NUMERIC(5, 2),
  sales_avg_cycle_days_30d NUMERIC(8, 2),

  -- Carteira (CS)
  active_stores_count INTEGER NOT NULL DEFAULT 0,
  total_mrr_cents BIGINT NOT NULL DEFAULT 0,
  avg_health_score NUMERIC(5, 2),
  critical_health_count INTEGER NOT NULL DEFAULT 0,
  warning_health_count INTEGER NOT NULL DEFAULT 0,
  healthy_count INTEGER NOT NULL DEFAULT 0,

  -- NPS
  nps_score NUMERIC(5, 2),
  nps_responses_30d INTEGER NOT NULL DEFAULT 0,

  -- Inbox
  inbox_open_threads INTEGER NOT NULL DEFAULT 0,
  inbox_pending_threads INTEGER NOT NULL DEFAULT 0,

  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (org_id, day)
);

CREATE INDEX IF NOT EXISTS idx_crm_org_snapshots_org_day
  ON crm_org_snapshots(org_id, day DESC);

-- ── crm_lead_funnel_snapshots ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_lead_funnel_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  day DATE NOT NULL,

  new_count INTEGER NOT NULL DEFAULT 0,
  qualified_count INTEGER NOT NULL DEFAULT 0,
  unqualified_count INTEGER NOT NULL DEFAULT 0,
  converted_count INTEGER NOT NULL DEFAULT 0,
  lost_count INTEGER NOT NULL DEFAULT 0,

  -- Eventos no dia (transicoes hoje)
  qualified_today INTEGER NOT NULL DEFAULT 0,
  converted_today INTEGER NOT NULL DEFAULT 0,
  created_today INTEGER NOT NULL DEFAULT 0,

  -- Por fonte (top 5 sources do dia em jsonb)
  by_source JSONB DEFAULT '{}'::jsonb,

  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (org_id, day)
);

CREATE INDEX IF NOT EXISTS idx_crm_lead_funnel_snapshots_org_day
  ON crm_lead_funnel_snapshots(org_id, day DESC);

-- ── RLS permissive ────────────────────────────────────────────────
ALTER TABLE crm_pipeline_snapshots     ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_org_snapshots          ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_lead_funnel_snapshots  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "crm_pipeline_snapshots_authenticated" ON crm_pipeline_snapshots
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "crm_org_snapshots_authenticated" ON crm_org_snapshots
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "crm_lead_funnel_snapshots_authenticated" ON crm_lead_funnel_snapshots
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
