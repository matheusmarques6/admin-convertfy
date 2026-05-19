-- =============================================
-- Store Cadence Overrides
-- =============================================
-- Configura cadência de feedback por loja. Default global = weekly.
-- Exceções caso a caso (biweekly, monthly) com motivo registrado.

CREATE TABLE IF NOT EXISTS store_cadence_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,

  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'paused')),
  reason TEXT NOT NULL,

  -- Auditoria
  configured_by UUID REFERENCES profiles(id),
  configured_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (store_id)
);

CREATE INDEX IF NOT EXISTS idx_cadence_org ON store_cadence_overrides(org_id);
CREATE INDEX IF NOT EXISTS idx_cadence_frequency ON store_cadence_overrides(frequency);
CREATE INDEX IF NOT EXISTS idx_cadence_expires ON store_cadence_overrides(expires_at) WHERE expires_at IS NOT NULL;

ALTER TABLE store_cadence_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members view cadence" ON store_cadence_overrides;
CREATE POLICY "Org members view cadence" ON store_cadence_overrides FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = store_cadence_overrides.org_id AND om.profile_id = auth.uid() AND om.is_active = true));

DROP POLICY IF EXISTS "Org members manage cadence" ON store_cadence_overrides;
CREATE POLICY "Org members manage cadence" ON store_cadence_overrides FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = store_cadence_overrides.org_id AND om.profile_id = auth.uid() AND om.is_active = true))
WITH CHECK (EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = store_cadence_overrides.org_id AND om.profile_id = auth.uid() AND om.is_active = true));

-- Log de mudanças (auditoria)
CREATE TABLE IF NOT EXISTS store_cadence_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  old_frequency TEXT,
  new_frequency TEXT NOT NULL,
  reason TEXT NOT NULL,

  changed_by UUID REFERENCES profiles(id),
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cadence_history_store ON store_cadence_history(store_id, changed_at DESC);

ALTER TABLE store_cadence_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members view cadence history" ON store_cadence_history;
CREATE POLICY "Org members view cadence history" ON store_cadence_history FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = store_cadence_history.org_id AND om.profile_id = auth.uid() AND om.is_active = true));

DROP POLICY IF EXISTS "Org members insert cadence history" ON store_cadence_history;
CREATE POLICY "Org members insert cadence history" ON store_cadence_history FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = store_cadence_history.org_id AND om.profile_id = auth.uid() AND om.is_active = true));

-- Trigger pra updated_at + auto-history
CREATE OR REPLACE FUNCTION log_cadence_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Update timestamps
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at = NOW();
    -- Log se frequency mudou
    IF NEW.frequency IS DISTINCT FROM OLD.frequency THEN
      INSERT INTO store_cadence_history (store_id, org_id, old_frequency, new_frequency, reason, changed_by)
      VALUES (NEW.store_id, NEW.org_id, OLD.frequency, NEW.frequency, NEW.reason, NEW.configured_by);
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO store_cadence_history (store_id, org_id, old_frequency, new_frequency, reason, changed_by)
    VALUES (NEW.store_id, NEW.org_id, NULL, NEW.frequency, NEW.reason, NEW.configured_by);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_cadence_change ON store_cadence_overrides;
CREATE TRIGGER trg_cadence_change
BEFORE UPDATE OR AFTER INSERT ON store_cadence_overrides
FOR EACH ROW EXECUTE FUNCTION log_cadence_change();

COMMENT ON TABLE store_cadence_overrides IS
  'Configuração de cadência de feedback por loja. Default global é weekly; tabela só armazena exceções.';
COMMENT ON COLUMN store_cadence_overrides.frequency IS
  'weekly (default), biweekly (a cada 2 semanas), monthly (mensal), paused (suspenso).';
