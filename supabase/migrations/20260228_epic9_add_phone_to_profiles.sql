-- Story 9.3 - Add phone column to profiles table
-- Needed for admin/agent profile editing (Story 9.1)

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;

COMMENT ON COLUMN public.profiles.phone IS 'Telefone de contato do usuário';
