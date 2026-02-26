-- Function to delete auth users by email (used for invite re-send flow)
-- SECURITY DEFINER allows accessing auth.users from public schema
CREATE OR REPLACE FUNCTION public.delete_auth_user_by_email(target_email text)
RETURNS void AS $$
BEGIN
  DELETE FROM auth.users WHERE email = target_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only service_role can call this function
REVOKE ALL ON FUNCTION public.delete_auth_user_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_auth_user_by_email(text) FROM anon;
REVOKE ALL ON FUNCTION public.delete_auth_user_by_email(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_auth_user_by_email(text) TO service_role;
