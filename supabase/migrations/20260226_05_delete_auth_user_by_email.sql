-- Function to delete auth users by email (used for invite re-send flow)
-- SECURITY DEFINER allows accessing auth.users from public schema
-- Clears FK references in campaign_batches and client_portal_users before deleting
CREATE OR REPLACE FUNCTION public.delete_auth_user_by_email(target_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE email = target_email;
  IF uid IS NULL THEN
    RETURN;
  END IF;

  -- Remove FK references that block deletion
  UPDATE public.campaign_batches SET created_by = NULL WHERE created_by = uid;
  UPDATE public.client_portal_users SET auth_user_id = NULL WHERE auth_user_id = uid;

  -- Now delete the auth user (profiles cascades automatically)
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

-- Only service_role can call this function
REVOKE ALL ON FUNCTION public.delete_auth_user_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_auth_user_by_email(text) FROM anon;
REVOKE ALL ON FUNCTION public.delete_auth_user_by_email(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_auth_user_by_email(text) TO service_role;
