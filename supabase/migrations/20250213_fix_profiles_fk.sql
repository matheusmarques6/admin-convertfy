-- Migration: Fix foreign key relationship between client_reports and profiles
-- This fixes PostgREST error PGRST200: Could not find a relationship between 'client_reports' and 'profiles'

-- Step 1: Ensure user_id column exists
ALTER TABLE client_reports
ADD COLUMN IF NOT EXISTS user_id UUID;

-- Step 2: Drop any existing anonymous constraint (safe if not exists)
DO $$
BEGIN
    -- Try to drop any existing constraint
    ALTER TABLE client_reports DROP CONSTRAINT IF EXISTS client_reports_user_id_fkey;
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

-- Step 3: Add the foreign key constraint with explicit name
-- This ensures PostgREST can properly detect the relationship
ALTER TABLE client_reports
ADD CONSTRAINT client_reports_user_id_fkey
FOREIGN KEY (user_id) REFERENCES profiles(id)
ON DELETE SET NULL;

-- Step 4: Create index for performance
CREATE INDEX IF NOT EXISTS idx_client_reports_user_id ON client_reports(user_id);

-- Step 5: Notify PostgREST to reload schema (works on some setups)
NOTIFY pgrst, 'reload schema';
