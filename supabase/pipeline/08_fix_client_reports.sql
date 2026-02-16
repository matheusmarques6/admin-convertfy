-- =============================================
-- PIPELINE FILE 08: FIX CLIENT REPORTS + PROFILES FK
-- =============================================
-- Ensures: notes, status, user_id, document_url columns exist
-- Fixes: FK constraint between client_reports and profiles
-- Creates: Indexes
-- =============================================

BEGIN;

-- =============================================
-- 1. Ensure columns exist (safe re-run of 07)
-- =============================================

ALTER TABLE client_reports
ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE client_reports
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published'
CHECK (status IN ('draft', 'published', 'sent', 'archived'));

ALTER TABLE client_reports
ADD COLUMN IF NOT EXISTS user_id UUID;

ALTER TABLE client_reports
ADD COLUMN IF NOT EXISTS document_url TEXT;

-- =============================================
-- 2. Fix FK constraint for PostgREST relationship detection
-- =============================================

-- Drop any existing constraint (safe if not exists)
DO $$
BEGIN
    ALTER TABLE client_reports DROP CONSTRAINT IF EXISTS client_reports_user_id_fkey;
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

-- Add the foreign key constraint with explicit name
ALTER TABLE client_reports
ADD CONSTRAINT client_reports_user_id_fkey
FOREIGN KEY (user_id) REFERENCES profiles(id)
ON DELETE SET NULL;

-- =============================================
-- 3. Create indexes for performance
-- =============================================

CREATE INDEX IF NOT EXISTS idx_client_reports_status ON client_reports(status);
CREATE INDEX IF NOT EXISTS idx_client_reports_user_id ON client_reports(user_id);

-- =============================================
-- 4. Notify PostgREST to reload schema
-- =============================================
NOTIFY pgrst, 'reload schema';

COMMIT;

-- =============================================
-- 08_fix_client_reports.sql DONE
-- =============================================
