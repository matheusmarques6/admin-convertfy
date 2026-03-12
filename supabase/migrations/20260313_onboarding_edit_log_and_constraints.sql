-- Story 37.3: onboarding_edit_log table + unique indexes
-- Story 37.1 AC 37.1.9: NOT NULL + CHECK on onboarding_rejection_log.comments

-- ============================================================
-- 1. onboarding_edit_log — audit trail for COO edits
-- ============================================================
CREATE TABLE IF NOT EXISTS onboarding_edit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id UUID NOT NULL REFERENCES client_onboardings(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  edited_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oel_onboarding_id ON onboarding_edit_log(onboarding_id);
CREATE INDEX IF NOT EXISTS idx_oel_org_id ON onboarding_edit_log(org_id);

-- RLS: org members can read their org's edit logs
ALTER TABLE onboarding_edit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "org_members_read_edit_log" ON onboarding_edit_log
    FOR SELECT USING (
      org_id IN (
        SELECT om.org_id FROM org_members om
        WHERE om.profile_id = auth.uid() AND om.is_active = TRUE
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 2. Unique index: prevent duplicate emails within same org
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_org_email_unique
  ON clients (org_id, lower(email));

-- ============================================================
-- 3. Unique index: prevent duplicate store names within same org
--    Replaces partial index idx_unique_store_per_org (WHERE is_active = true)
--    with a full index (covers all rows, including inactive)
-- ============================================================
DROP INDEX IF EXISTS idx_unique_store_per_org;

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_stores_org_store_name_unique
  ON client_stores (org_id, lower(trim(store_name)));

-- ============================================================
-- 4. AC 37.1.9: NOT NULL + CHECK on onboarding_rejection_log.comments
-- ============================================================
-- Backfill existing NULL rows before adding NOT NULL constraint
UPDATE onboarding_rejection_log
  SET comments = '(sem comentário)'
  WHERE comments IS NULL;

DO $$
BEGIN
  ALTER TABLE onboarding_rejection_log
    ALTER COLUMN comments SET NOT NULL;
EXCEPTION
  WHEN others THEN NULL; -- Column may already be NOT NULL
END $$;

DO $$
BEGIN
  ALTER TABLE onboarding_rejection_log
    ADD CONSTRAINT chk_rejection_comments_not_empty
    CHECK (trim(comments) <> '');
EXCEPTION
  WHEN duplicate_object THEN NULL; -- Constraint may already exist
END $$;
