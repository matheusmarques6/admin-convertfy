-- Migration: unified_invoices VIEW
-- Story 31.1 - Unified Invoices: Portal Visibility for All Charges
-- Purpose: Create a unified read-only VIEW over invoices + client_charges
--          so the portal can display ALL charges from a single source.
-- Idempotent: safe to re-run.

-- ============================================================
-- 1. Add updated_at column to invoices (baseline gap)
-- ============================================================
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================
-- 2. Trigger to auto-update updated_at on invoices
-- ============================================================
DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;
CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 3. CREATE VIEW unified_invoices (UNION ALL)
-- ============================================================
CREATE OR REPLACE VIEW unified_invoices AS

-- Invoices from Asaas integration
SELECT
  i.id,
  i.client_id,
  i.amount,
  i.due_date,
  i.payment_date,
  i.status::TEXT            AS status,
  i.description,
  i.asaas_id,
  NULL::UUID                AS subscription_id,
  NULL::TEXT                AS payment_method,
  NULL::TEXT                AS actual_payment_method,
  NULL::TEXT                AS notes,
  i.created_at,
  COALESCE(i.updated_at, i.created_at) AS updated_at,
  'asaas'::TEXT             AS source
FROM invoices i

UNION ALL

-- Charges from admin UI / subscription auto-generation
SELECT
  cc.id,
  cc.client_id,
  cc.value                  AS amount,
  cc.due_date,
  cc.payment_date,
  cc.status,
  cc.description,
  NULL::TEXT                AS asaas_id,
  cc.subscription_id,
  cc.payment_method,
  cc.actual_payment_method,
  cc.notes,
  cc.created_at,
  COALESCE(cc.updated_at, cc.created_at) AS updated_at,
  'local'::TEXT             AS source
FROM client_charges cc;

-- ============================================================
-- 4. Document the VIEW (including status asymmetry)
-- ============================================================
COMMENT ON VIEW unified_invoices IS
  'Read-only unified view over invoices (Asaas) and client_charges (local/manual). '
  'The "source" column distinguishes origin: asaas vs local. '
  'Status asymmetry: invoices supports 5 values (pending, paid, overdue, cancelled, refunded); '
  'client_charges supports 4 values (pending, paid, overdue, cancelled). '
  'Filtering by status = ''refunded'' returns only Asaas rows -- this is expected behavior.';

-- ============================================================
-- 5. Grant SELECT to authenticated and service_role
-- ============================================================
GRANT SELECT ON unified_invoices TO authenticated;
GRANT SELECT ON unified_invoices TO service_role;

-- ============================================================
-- 6. Composite indexes for portal queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_invoices_client_due
  ON invoices (client_id, due_date DESC);

CREATE INDEX IF NOT EXISTS idx_client_charges_client_due
  ON client_charges (client_id, due_date DESC);

-- ============================================================
-- 7. RLS policy: portal users can read client_charges
-- ============================================================
DROP POLICY IF EXISTS "Portal users can view own client_charges" ON client_charges;
CREATE POLICY "Portal users can view own client_charges"
  ON client_charges FOR SELECT
  TO authenticated
  USING (
    client_id IN (
      SELECT client_id FROM client_portal_users
      WHERE auth_user_id = auth.uid()
    )
  );

-- ============================================================
-- ROLLBACK (if needed):
-- DROP VIEW IF EXISTS unified_invoices;
-- DROP INDEX IF EXISTS idx_invoices_client_due;
-- DROP INDEX IF EXISTS idx_client_charges_client_due;
-- DROP POLICY IF EXISTS "Portal users can view own client_charges" ON client_charges;
-- DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;
-- ALTER TABLE invoices DROP COLUMN IF EXISTS updated_at;
-- ============================================================
