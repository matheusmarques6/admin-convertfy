-- ============================================================
-- Migration: 20260315_add_refund_support
-- Purpose: Add refund tracking for invoices (Asaas) and client_charges (local).
--          Supports full and partial refunds with audit trail.
-- Dependencies: invoices, client_charges, client_portal_users, RLS helpers
-- Idempotent: Yes (IF NOT EXISTS / DROP IF EXISTS throughout)
--
-- Fixes applied from Architect + QA review:
--   F4: is_admin() replaced with org-scoped check
--   F1: DB trigger prevents refund_total > original_amount
--   I6/F11: ON DELETE RESTRICT (not CASCADE) on financial FKs
--   F6: ON DELETE RESTRICT on processed_by (audit trail)
--   F5: Portal policy gated behind has_feature('view_financial')
--   Missing: source column added
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Extend client_charges status CHECK to include 'refunded'
--    The invoices table already has 'refunded' in the payment_status ENUM.
-- ============================================================

-- Drop the old constraint and recreate with 'refunded' added.
-- This is safe because no existing row has status='refunded'.
ALTER TABLE client_charges
  DROP CONSTRAINT IF EXISTS client_charges_status_check;

ALTER TABLE client_charges
  ADD CONSTRAINT client_charges_status_check
  CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled', 'refunded'));

COMMENT ON COLUMN client_charges.status IS
  'Charge lifecycle: pending -> paid -> refunded (full). '
  'Partial refunds keep status as paid; only full refund sets refunded.';

-- ============================================================
-- 2. Create refunds table
--    Tracks individual refund operations against invoices or charges.
--    Supports partial refunds: multiple rows per charge/invoice.
-- ============================================================

CREATE TABLE IF NOT EXISTS refunds (
  -- Baseline columns
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Polymorphic reference: exactly ONE of these must be set.
  -- invoice_id for Asaas invoices, charge_id for local charges.
  -- RESTRICT: cannot delete an invoice/charge that has refund records.
  invoice_id  UUID REFERENCES invoices(id) ON DELETE RESTRICT,
  charge_id   UUID REFERENCES client_charges(id) ON DELETE RESTRICT,

  -- Denormalized for RLS efficiency (avoids extra join in every policy check).
  -- RESTRICT: cannot delete a client that has refund records.
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,

  -- Refund details
  amount      DECIMAL(10, 2) NOT NULL,
  reason      TEXT NOT NULL,
  notes       TEXT,

  -- Source: where the refund originated
  source      TEXT NOT NULL CHECK (source IN ('asaas', 'manual')),

  -- Asaas integration (NULL for local/manual refunds)
  asaas_refund_id TEXT,

  -- Refund status lifecycle: requested -> processed | failed
  -- 'requested' = sent to Asaas, awaiting webhook confirmation
  -- 'processed' = money returned (confirmed by webhook or immediate for manual)
  -- 'failed' = refund attempt failed
  status      TEXT NOT NULL DEFAULT 'processed'
              CHECK (status IN ('requested', 'processed', 'failed')),

  -- Who processed this refund (auth.uid() of the admin/owner).
  -- RESTRICT: cannot delete the user who processed a financial refund.
  processed_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  processed_at TIMESTAMPTZ,

  -- Exactly one parent reference must be set (XOR constraint)
  CONSTRAINT refunds_exactly_one_parent CHECK (
    (invoice_id IS NOT NULL AND charge_id IS NULL)
    OR
    (invoice_id IS NULL AND charge_id IS NOT NULL)
  ),

  -- Amount must be positive
  CONSTRAINT refunds_amount_positive CHECK (amount > 0)
);

COMMENT ON TABLE refunds IS
  'Tracks refund operations (full and partial) against invoices (Asaas) or client_charges (local). '
  'Multiple refunds per parent are allowed (partial refund support). '
  'The sum of refund amounts must not exceed the parent charge amount (enforced by trigger).';

COMMENT ON COLUMN refunds.invoice_id IS 'FK to invoices table (Asaas charges). Mutually exclusive with charge_id.';
COMMENT ON COLUMN refunds.charge_id IS 'FK to client_charges table (local charges). Mutually exclusive with invoice_id.';
COMMENT ON COLUMN refunds.client_id IS 'Denormalized from parent for RLS efficiency. Must match parent client_id.';
COMMENT ON COLUMN refunds.source IS 'Origin of the refund: asaas (via API) or manual (local charge marked by admin).';
COMMENT ON COLUMN refunds.asaas_refund_id IS 'Asaas refund transaction ID. NULL for local (non-Asaas) refunds.';
COMMENT ON COLUMN refunds.processed_by IS 'auth.users.id of the admin/owner who processed the refund. NULL only for webhook-initiated refunds without prior admin trigger.';

-- ============================================================
-- 3. Trigger: prevent refund total from exceeding original amount
--    (F1 fix: DB-level guard against race conditions)
-- ============================================================

CREATE OR REPLACE FUNCTION check_refund_total_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_existing_total DECIMAL(10,2);
  v_original_amount DECIMAL(10,2);
  v_parent_label TEXT;
BEGIN
  -- Only check on INSERT or when amount changes
  IF TG_OP = 'UPDATE' AND NEW.amount = OLD.amount THEN
    RETURN NEW;
  END IF;

  -- Skip failed refunds (they don't count toward the total)
  IF NEW.status = 'failed' THEN
    RETURN NEW;
  END IF;

  IF NEW.invoice_id IS NOT NULL THEN
    -- Lock the parent row to serialize concurrent refunds
    SELECT amount INTO v_original_amount
      FROM invoices WHERE id = NEW.invoice_id FOR UPDATE;
    v_parent_label := 'invoice ' || NEW.invoice_id;

    SELECT COALESCE(SUM(amount), 0) INTO v_existing_total
      FROM refunds
      WHERE invoice_id = NEW.invoice_id
        AND status != 'failed'
        AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID);
  ELSE
    -- Lock the parent row to serialize concurrent refunds
    SELECT value INTO v_original_amount
      FROM client_charges WHERE id = NEW.charge_id FOR UPDATE;
    v_parent_label := 'charge ' || NEW.charge_id;

    SELECT COALESCE(SUM(amount), 0) INTO v_existing_total
      FROM refunds
      WHERE charge_id = NEW.charge_id
        AND status != 'failed'
        AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID);
  END IF;

  IF v_original_amount IS NULL THEN
    RAISE EXCEPTION 'Parent % not found', v_parent_label;
  END IF;

  IF v_existing_total + NEW.amount > v_original_amount THEN
    RAISE EXCEPTION 'Refund total (R$ %) would exceed original amount (R$ %) for %',
      v_existing_total + NEW.amount, v_original_amount, v_parent_label;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_refund_total ON refunds;
CREATE TRIGGER trg_check_refund_total
  BEFORE INSERT OR UPDATE ON refunds
  FOR EACH ROW EXECUTE FUNCTION check_refund_total_limit();

COMMENT ON FUNCTION check_refund_total_limit() IS
  'Prevents the sum of non-failed refunds from exceeding the parent invoice/charge amount. '
  'Uses SELECT FOR UPDATE on the parent row to serialize concurrent refund attempts.';

-- ============================================================
-- 4. Trigger: validate client_id consistency with parent
--    Ensures denormalized client_id matches the parent record.
-- ============================================================

CREATE OR REPLACE FUNCTION check_refund_client_consistency()
RETURNS TRIGGER AS $$
DECLARE
  v_parent_client_id UUID;
BEGIN
  IF NEW.invoice_id IS NOT NULL THEN
    SELECT client_id INTO v_parent_client_id FROM invoices WHERE id = NEW.invoice_id;
  ELSE
    SELECT client_id INTO v_parent_client_id FROM client_charges WHERE id = NEW.charge_id;
  END IF;

  IF v_parent_client_id IS NULL THEN
    RAISE EXCEPTION 'Parent record not found for refund';
  END IF;

  IF NEW.client_id != v_parent_client_id THEN
    RAISE EXCEPTION 'refunds.client_id (%) does not match parent client_id (%)',
      NEW.client_id, v_parent_client_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_refund_client ON refunds;
CREATE TRIGGER trg_check_refund_client
  BEFORE INSERT OR UPDATE ON refunds
  FOR EACH ROW EXECUTE FUNCTION check_refund_client_consistency();

-- ============================================================
-- 5. Auto-update updated_at trigger
-- ============================================================

DROP TRIGGER IF EXISTS update_refunds_updated_at ON refunds;
CREATE TRIGGER update_refunds_updated_at
  BEFORE UPDATE ON refunds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 6. Indexes for performance
-- ============================================================

-- Query pattern: "all refunds for this invoice"
CREATE INDEX IF NOT EXISTS idx_refunds_invoice_id
  ON refunds (invoice_id) WHERE invoice_id IS NOT NULL;

-- Query pattern: "all refunds for this charge"
CREATE INDEX IF NOT EXISTS idx_refunds_charge_id
  ON refunds (charge_id) WHERE charge_id IS NOT NULL;

-- Query pattern: "all refunds for this client" (portal view, admin view)
CREATE INDEX IF NOT EXISTS idx_refunds_client_id
  ON refunds (client_id);

-- Query pattern: "refunds by status" (admin dashboard, processing queue)
CREATE INDEX IF NOT EXISTS idx_refunds_status
  ON refunds (status) WHERE status != 'processed';

-- Query pattern: "find by Asaas refund ID" (webhook deduplication)
CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_asaas_refund_id
  ON refunds (asaas_refund_id) WHERE asaas_refund_id IS NOT NULL;

-- ============================================================
-- 7. Enable RLS
-- ============================================================

ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 8. RLS Policies
--    F4 fix: All policies use org-scoped checks (no bare is_admin())
--    F5 fix: Portal policy gated behind has_feature('view_financial')
-- ============================================================

-- 8a. Org members with client access + view_financial feature can read
DROP POLICY IF EXISTS "Access refunds by client" ON refunds;
CREATE POLICY "Access refunds by client"
  ON refunds FOR SELECT TO authenticated
  USING (
    can_access_client(client_id)
    AND has_feature('view_financial')
  );

-- 8b. Org admin/owner can fully manage refunds (org-scoped, NOT global is_admin())
DROP POLICY IF EXISTS "Admin can manage refunds" ON refunds;
CREATE POLICY "Admin can manage refunds"
  ON refunds FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM clients c
      JOIN org_members om ON om.org_id = c.org_id
      WHERE c.id = refunds.client_id
        AND om.profile_id = auth.uid()
        AND om.role IN ('owner', 'manager')
        AND om.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clients c
      JOIN org_members om ON om.org_id = c.org_id
      WHERE c.id = refunds.client_id
        AND om.profile_id = auth.uid()
        AND om.role IN ('owner', 'manager')
        AND om.is_active = true
    )
  );

-- 8c. Portal users can view refunds for their linked client (with feature gate)
DROP POLICY IF EXISTS "Portal users can view own refunds" ON refunds;
CREATE POLICY "Portal users can view own refunds"
  ON refunds FOR SELECT TO authenticated
  USING (
    has_feature('view_financial')
    AND client_id IN (
      SELECT cpu.client_id FROM client_portal_users cpu
      WHERE cpu.auth_user_id = auth.uid()
    )
  );

-- ============================================================
-- 9. Helper view: refund_summaries per charge/invoice
--    Useful for checking "how much has been refunded" without SUM() in app code.
-- ============================================================

CREATE OR REPLACE VIEW refund_summaries WITH (security_invoker = true) AS
SELECT
  invoice_id,
  charge_id,
  client_id,
  COUNT(*)                                        AS refund_count,
  SUM(amount) FILTER (WHERE status = 'processed') AS total_refunded,
  SUM(amount) FILTER (WHERE status = 'requested') AS total_pending,
  MAX(processed_at)                               AS last_refund_at
FROM refunds
WHERE status != 'failed'
GROUP BY invoice_id, charge_id, client_id;

COMMENT ON VIEW refund_summaries IS
  'Aggregated refund totals per invoice/charge. '
  'Use total_refunded to determine if fully refunded (compare with parent amount). '
  'security_invoker=true ensures RLS on refunds table is respected.';

GRANT SELECT ON refund_summaries TO authenticated;
GRANT SELECT ON refund_summaries TO service_role;

-- ============================================================
-- 10. Update unified_invoices VIEW to include refund info
--     Adds: refund_total, net_amount columns
-- ============================================================

CREATE OR REPLACE VIEW unified_invoices WITH (security_invoker = true) AS

-- Invoices from Asaas integration
SELECT
  i.id,
  i.client_id,
  i.amount,
  i.due_date,
  i.payment_date,
  i.status::TEXT                               AS status,
  i.description,
  i.asaas_id,
  NULL::UUID                                   AS subscription_id,
  NULL::TEXT                                   AS payment_method,
  NULL::TEXT                                   AS actual_payment_method,
  NULL::TEXT                                   AS notes,
  i.created_at,
  COALESCE(i.updated_at, i.created_at)         AS updated_at,
  'asaas'::TEXT                                AS source,
  -- Refund columns (computed from refund_summaries)
  COALESCE(rs.total_refunded, 0)               AS refund_total,
  i.amount - COALESCE(rs.total_refunded, 0)    AS net_amount
FROM invoices i
LEFT JOIN refund_summaries rs ON rs.invoice_id = i.id

UNION ALL

-- Charges from admin UI / subscription auto-generation
SELECT
  cc.id,
  cc.client_id,
  cc.value                                     AS amount,
  cc.due_date,
  cc.payment_date,
  cc.status,
  cc.description,
  NULL::TEXT                                   AS asaas_id,
  cc.subscription_id,
  cc.payment_method,
  cc.actual_payment_method,
  cc.notes,
  cc.created_at,
  COALESCE(cc.updated_at, cc.created_at)       AS updated_at,
  'local'::TEXT                                AS source,
  -- Refund columns (computed from refund_summaries)
  COALESCE(rs.total_refunded, 0)               AS refund_total,
  cc.value - COALESCE(rs.total_refunded, 0)    AS net_amount
FROM client_charges cc
LEFT JOIN refund_summaries rs ON rs.charge_id = cc.id;

COMMENT ON VIEW unified_invoices IS
  'Read-only unified view over invoices (Asaas) and client_charges (local). '
  'The "source" column distinguishes origin: asaas vs local. '
  'refund_total = sum of processed refunds; net_amount = amount - refund_total. '
  'Status "refunded" appears when full amount has been refunded. '
  'security_invoker=true ensures RLS on underlying tables is respected.';

-- Re-grant after CREATE OR REPLACE
GRANT SELECT ON unified_invoices TO authenticated;
GRANT SELECT ON unified_invoices TO service_role;

COMMIT;

-- ============================================================
-- ROLLBACK SCRIPT (run manually if needed):
-- ============================================================
--
-- BEGIN;
--
-- -- 1. Restore unified_invoices to pre-refund version (no refund columns)
-- CREATE OR REPLACE VIEW unified_invoices AS
-- SELECT
--   i.id, i.client_id, i.amount, i.due_date, i.payment_date,
--   i.status::TEXT AS status, i.description, i.asaas_id,
--   NULL::UUID AS subscription_id, NULL::TEXT AS payment_method,
--   NULL::TEXT AS actual_payment_method, NULL::TEXT AS notes,
--   i.created_at, COALESCE(i.updated_at, i.created_at) AS updated_at,
--   'asaas'::TEXT AS source
-- FROM invoices i
-- UNION ALL
-- SELECT
--   cc.id, cc.client_id, cc.value AS amount, cc.due_date, cc.payment_date,
--   cc.status, cc.description, NULL::TEXT AS asaas_id,
--   cc.subscription_id, cc.payment_method, cc.actual_payment_method, cc.notes,
--   cc.created_at, COALESCE(cc.updated_at, cc.created_at) AS updated_at,
--   'local'::TEXT AS source
-- FROM client_charges cc;
--
-- GRANT SELECT ON unified_invoices TO authenticated;
-- GRANT SELECT ON unified_invoices TO service_role;
--
-- -- 2. Drop refund_summaries view
-- DROP VIEW IF EXISTS refund_summaries;
--
-- -- 3. Drop triggers and functions
-- DROP TRIGGER IF EXISTS trg_check_refund_total ON refunds;
-- DROP TRIGGER IF EXISTS trg_check_refund_client ON refunds;
-- DROP TRIGGER IF EXISTS update_refunds_updated_at ON refunds;
-- DROP FUNCTION IF EXISTS check_refund_total_limit();
-- DROP FUNCTION IF EXISTS check_refund_client_consistency();
--
-- -- 4. Drop refunds table (cascades indexes and policies)
-- DROP TABLE IF EXISTS refunds CASCADE;
--
-- -- 5. Revert client_charges status constraint (remove 'refunded')
-- --    WARNING: Only safe if no rows have status='refunded'.
-- --    Check first: SELECT count(*) FROM client_charges WHERE status = 'refunded';
-- --    If rows exist, run: UPDATE client_charges SET status = 'cancelled' WHERE status = 'refunded';
-- ALTER TABLE client_charges DROP CONSTRAINT IF EXISTS client_charges_status_check;
-- ALTER TABLE client_charges ADD CONSTRAINT client_charges_status_check
--   CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled'));
--
-- COMMIT;
-- ============================================================
