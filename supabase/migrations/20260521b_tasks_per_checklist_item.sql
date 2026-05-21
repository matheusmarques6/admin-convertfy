-- Migration: AUTO·CLIENTE / "1 task por checklist item" — mover slug +
-- auto_complete_on de task_checklists para tasks.
--
-- Mudanca de modelo: cada item do checklist_template do SEED passa a virar
-- 1 task individual na tabela `tasks` (atribuivel ao role responsavel),
-- em vez de sub-item dentro de uma task unica por coluna.
--
-- O conceito de "marcacao automatica" sai dos checklists e vai pras tasks
-- diretamente: tasks.auto_complete_on JSONB marca task.status='completed'
-- quando o evento dispara.
--
-- Campos antigos em task_checklists (slug, auto_complete_on da migration
-- 20260521_task_checklists_auto_complete.sql) ficam preservados pra rollback
-- mas nao sao mais usados pelo novo fluxo.
--
-- Sem rollback automatico.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS auto_complete_on JSONB;

-- Unique parcial: 1 task por (onboarding, version, slug). Garante
-- idempotencia em re-execucoes do instantiateTaskForColumn.
CREATE UNIQUE INDEX IF NOT EXISTS tasks_onboarding_version_slug_unique
  ON tasks (onboarding_id, version, slug)
  WHERE slug IS NOT NULL AND onboarding_id IS NOT NULL;

-- Index pra lookup eficiente do auto-checklist service.
CREATE INDEX IF NOT EXISTS tasks_auto_complete_event
  ON tasks ((auto_complete_on->>'event'))
  WHERE auto_complete_on IS NOT NULL;

COMMENT ON COLUMN tasks.slug IS
  'Identificador estavel do template (vem de ChecklistItem.slug do SEED_COLUMNS). Sobrevive a re-seeds e habilita auto-complete.';
COMMENT ON COLUMN tasks.auto_complete_on IS
  'JSONB describendo o evento que marca status=completed automaticamente. Ver onboarding-auto-checklist.service.ts.';
