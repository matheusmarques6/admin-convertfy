-- Story 34.1: Add org_id column to tasks table
-- The column was missing from original migration (20250125_07_tasks.sql)
-- but is referenced by: board/page.tsx, task-automation.service.ts, copy_pipeline trigger
-- Without it, BoardPage throws Postgres error 42703 (undefined_column)

-- 1. Add column with FK to organizations
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id);

-- 2. Index for multi-tenant queries (board page filters by org_id)
CREATE INDEX IF NOT EXISTS idx_tasks_org_id ON public.tasks(org_id);

-- 3. Backfill org_id from assignee's org membership
UPDATE public.tasks t
SET org_id = om.org_id
FROM public.org_members om
WHERE t.assignee_id = om.id
  AND t.org_id IS NULL;

-- 4. Backfill remaining tasks (no assignee) via client → org relationship
UPDATE public.tasks t
SET org_id = c.org_id
FROM public.clients c
WHERE t.client_id = c.id
  AND t.org_id IS NULL;
