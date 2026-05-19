-- =============================================
-- Client Store Requests (Solicitações do cliente)
-- =============================================
-- Tabela pra registrar solicitações de novas features, ajustes ou
-- pedidos do cliente vinculados à loja. Aparece como aba "Solicitações"
-- na Detalhe da Loja.

CREATE TABLE IF NOT EXISTS client_store_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,

  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'declined', 'on_hold')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  category TEXT, -- 'feature', 'fix', 'campaign', 'question', 'other'

  requested_at TIMESTAMPTZ DEFAULT NOW(),
  requested_by UUID REFERENCES profiles(id),
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES profiles(id),

  -- Se virou task no productivity, vincula
  related_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_requests_store ON client_store_requests(store_id);
CREATE INDEX IF NOT EXISTS idx_store_requests_status ON client_store_requests(status);
CREATE INDEX IF NOT EXISTS idx_store_requests_org ON client_store_requests(org_id, status);

-- RLS
ALTER TABLE client_store_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members view requests" ON client_store_requests;
CREATE POLICY "Org members view requests" ON client_store_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = client_store_requests.org_id
        AND om.profile_id = auth.uid()
        AND om.is_active = true
    )
  );

DROP POLICY IF EXISTS "Org members manage requests" ON client_store_requests;
CREATE POLICY "Org members manage requests" ON client_store_requests
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = client_store_requests.org_id
        AND om.profile_id = auth.uid()
        AND om.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = client_store_requests.org_id
        AND om.profile_id = auth.uid()
        AND om.is_active = true
    )
  );

-- Trigger pra updated_at
CREATE OR REPLACE FUNCTION update_client_store_requests_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_update_client_store_requests ON client_store_requests;
CREATE TRIGGER trg_update_client_store_requests
BEFORE UPDATE ON client_store_requests
FOR EACH ROW EXECUTE FUNCTION update_client_store_requests_updated_at();

COMMENT ON TABLE client_store_requests IS
  'Solicitações de feature/fix/campanha do cliente vinculadas a uma loja.';
