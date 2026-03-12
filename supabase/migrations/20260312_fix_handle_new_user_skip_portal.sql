-- Story 35.1: Fix trigger handle_new_user to skip portal users + cleanup orphan profiles
-- Portal users are managed via client_portal_users, not profiles.
-- The trigger was creating orphan profiles with role='sdr' and account_type='admin'
-- for portal users, causing PGRST116 errors when they accessed admin routes.

-- 1. Update trigger to skip portal users
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Portal users are managed via client_portal_users, not profiles
  IF (NEW.raw_user_meta_data->>'is_portal_user')::boolean IS TRUE THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'sdr')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Cleanup orphan profiles created for portal users
-- Broad query: catches all portal users that have orphan profiles (no org_members)
DELETE FROM profiles
WHERE id IN (
  SELECT p.id FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE (u.raw_user_meta_data->>'is_portal_user')::boolean IS TRUE
  AND NOT EXISTS (SELECT 1 FROM org_members om WHERE om.profile_id = p.id)
);
