-- ═══════════════════════════════════════════════════════════════════
-- Produtos no negócio (estilo Datacrazy/Pipedrive) — ago/2026
-- ═══════════════════════════════════════════════════════════════════
--
-- Dor: registrar O QUE o cliente comprou e POR QUANTO exigia digitar um
-- valor solto no deal — sem produto, sem quantidade, sem desconto, sem
-- relatório possível por oferta.
--
-- Modelo (copiado da referência Datacrazy/Pipedrive):
--   crm_products       — catálogo da org (nome, preço padrão, recorrência)
--   crm_deal_products  — itens do negócio (snapshot de nome/preço +
--                        quantidade + desconto). deals.value passa a ser
--                        RECALCULADO pela soma dos itens quando existem
--                        (o recálculo é feito pela API, não por trigger —
--                        regra de negócio fica no app, auditável).
--
-- O item guarda SNAPSHOT de name/unit_price: renomear ou reprecificar o
-- catálogo NÃO reescreve negócios já lançados (histórico é histórico).
-- product_id é SET NULL para o item sobreviver à exclusão do produto.

CREATE OR REPLACE FUNCTION crm_set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ── Catálogo ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL,
  name TEXT NOT NULL,
  code TEXT,                                   -- SKU/código interno (opcional)
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

-- Nome único por org (case-insensitive) — evita "Plano Pro" e "plano pro".
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_products_org_name
  ON crm_products (org_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_crm_products_org_active
  ON crm_products (org_id, is_active);

DROP TRIGGER IF EXISTS trg_crm_products_updated_at ON crm_products;
CREATE TRIGGER trg_crm_products_updated_at BEFORE UPDATE ON crm_products
  FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

-- ── Itens do negócio ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_deal_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  product_id UUID REFERENCES crm_products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,                          -- snapshot do nome na venda
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100),
  billing_type TEXT NOT NULL DEFAULT 'one_time'
    CHECK (billing_type IN ('one_time','recurring')),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_deal_products_deal
  ON crm_deal_products (deal_id, position);
CREATE INDEX IF NOT EXISTS idx_crm_deal_products_product
  ON crm_deal_products (product_id);

-- ── RLS (mesmo padrão permissivo das demais tabelas CRM — o acesso
--    real é gateado pela API com service role) ──────────────────────
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
