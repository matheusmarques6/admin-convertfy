-- O check constraint original so aceitava prefixos auto_*. A unificacao
-- precisa dos 5 valores do PRD (onboarding/acompanhamento/project/crm/manual)
-- + mantem compat com legacy auto_*. Drop + recreate.

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_source_type_check;

ALTER TABLE public.tasks
ADD CONSTRAINT tasks_source_type_check
CHECK (source_type IN (
  -- Valores unificados (PRD)
  'manual', 'onboarding', 'acompanhamento', 'project', 'crm',
  -- Legacy (mantidos pra nao quebrar tasks antigas)
  'auto_onboarding', 'auto_onboarding_step', 'auto_meeting',
  'auto_campaign', 'auto_feedback', 'auto_report', 'auto_contract'
));

UPDATE public.tasks
SET source_type = 'onboarding'
WHERE source_type IN ('auto_onboarding', 'auto_onboarding_step')
  AND onboarding_id IS NOT NULL;
