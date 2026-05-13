-- Fix: tasks.created_by era NOT NULL mas confirmBriefing (cliente publico
-- sem auth) precisa instanciar tasks auto sem profile_id de criador.
-- Tornar coluna nullable resolve sem quebrar invariantes existentes.

ALTER TABLE public.tasks ALTER COLUMN created_by DROP NOT NULL;

COMMENT ON COLUMN public.tasks.created_by IS
  'Nullable porque tasks auto-instanciadas pelo sistema (onboarding flow apos confirmBriefing por cliente publico) nao tem profile_id de criador.';
