-- Add must_change_password column to client_portal_users
-- This flag forces users to change their password on first login

ALTER TABLE client_portal_users
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT true;

-- Add comment explaining the column
COMMENT ON COLUMN client_portal_users.must_change_password IS 'If true, user must change password on next login';

-- Set must_change_password to true for all existing users who haven't logged in yet
UPDATE client_portal_users
SET must_change_password = true
WHERE last_login_at IS NULL;

-- Set must_change_password to false for users who have already logged in
UPDATE client_portal_users
SET must_change_password = false
WHERE last_login_at IS NOT NULL;
