-- Story 9.3 - Email sync trigger
-- When email changes in auth.users, propagate to profiles and client_portal_users
-- SECURITY DEFINER is required to access the auth schema from a public function

CREATE OR REPLACE FUNCTION public.handle_user_email_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Sync with profiles
  UPDATE public.profiles
  SET email = NEW.email, updated_at = now()
  WHERE id = NEW.id;

  -- Sync with client_portal_users (if record exists)
  UPDATE public.client_portal_users
  SET email = NEW.email, updated_at = now()
  WHERE auth_user_id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger (idempotent)
DROP TRIGGER IF EXISTS on_user_email_change ON auth.users;
CREATE TRIGGER on_user_email_change
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.handle_user_email_change();

COMMENT ON FUNCTION public.handle_user_email_change IS 'Syncs email changes from auth.users to profiles and client_portal_users';

-- Verification: check for existing email mismatches and backfill
-- profiles vs auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS DISTINCT FROM u.email;

-- client_portal_users vs auth.users
UPDATE public.client_portal_users cpu
SET email = u.email
FROM auth.users u
WHERE cpu.auth_user_id = u.id AND cpu.email IS DISTINCT FROM u.email;
