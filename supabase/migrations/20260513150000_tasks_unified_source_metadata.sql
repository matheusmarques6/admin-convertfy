-- Sprint final: unificacao de tasks. tasks ja tinha source_type, source_id,
-- assignee_role, due_date, onboarding_id, operational_column_id, metadata.
-- Adicionando source_metadata (jsonb) pra carregar contexto de renderizacao
-- (store_name, client_name, stage_name, stage_color) sem precisar de joins
-- caros em /admin/me. Tambem adicionando sla_hours pra calculo direto.

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS source_metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS sla_hours integer;

-- Backfill via subquery (PG nao permite referenciar t no LEFT JOIN extra)
UPDATE public.tasks t
SET source_metadata = jsonb_build_object(
  'store_name', sub.store_name,
  'client_name', sub.client_name,
  'stage_name', sub.stage_name,
  'stage_color', sub.stage_color,
  'stage_slug', sub.stage_slug,
  'onboarding_id', t.onboarding_id
),
sla_hours = COALESCE(t.sla_hours, sub.stage_sla)
FROM (
  SELECT
    o.id AS onb_id,
    s.store_name,
    c.name AS client_name,
    col.id AS col_id,
    col.name AS stage_name,
    col.color AS stage_color,
    col.slug AS stage_slug,
    col.sla_hours AS stage_sla
  FROM public.onboardings o
  LEFT JOIN public.client_stores s ON s.id = o.store_id
  LEFT JOIN public.clients c ON c.id = o.client_id
  LEFT JOIN public.operational_pipeline_columns col ON col.pipeline_id = o.pipeline_id
) sub
WHERE t.onboarding_id = sub.onb_id
  AND t.operational_column_id = sub.col_id
  AND (t.source_metadata = '{}'::jsonb OR t.source_metadata IS NULL);

-- Normaliza source_type pros 5 valores esperados pela unificacao
UPDATE public.tasks SET source_type = 'onboarding' WHERE source_type = 'auto_onboarding_step';

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_role_status ON public.tasks(assignee_role, status) WHERE assignee_role IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_source_type ON public.tasks(source_type);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks(due_date) WHERE due_date IS NOT NULL;

COMMENT ON COLUMN public.tasks.source_metadata IS 'Contexto de renderizacao: {store_name, client_name, stage_name, stage_color, onboarding_id}';
COMMENT ON COLUMN public.tasks.sla_hours IS 'SLA em horas pra calculo de cor visual';
