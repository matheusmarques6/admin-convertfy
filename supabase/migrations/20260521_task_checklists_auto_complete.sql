-- Migration: AUTO·CLIENTE — marcação automática de checklist items
--
-- Permite que items de task_checklists sejam marcados como is_completed=true
-- automaticamente quando eventos externos disparam (cliente avança seções
-- do wizard, confirma briefing, recebe email "Conta ativa").
--
-- Campos novos:
--   task_checklists.slug            - identificador estável do item (mapeia
--                                     templates do SEED_COLUMNS pro registro
--                                     instanciado, sobrevive a re-seeds)
--   task_checklists.auto_complete_on JSONB describindo o trigger:
--     { "event": "form_section_completed", "sections": ["marca"] }
--     { "event": "form_section_completed", "sections": ["loja", "cliente"] }
--     { "event": "briefing_approved" }
--     { "event": "email_sent", "template_slug": "conta_ativa" }
--
--   onboardings.form_sections_completed JSONB  - array de slugs das seções
--     do wizard já completadas pelo cliente (set-union, idempotente).
--
-- Sem rollback automático: rodar manualmente em caso de revert.

ALTER TABLE task_checklists
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS auto_complete_on JSONB;

-- Unique parcial: garante 1 item por (task, slug) quando slug populado.
-- Templates sem slug (legado) continuam funcionando sem restrição.
CREATE UNIQUE INDEX IF NOT EXISTS task_checklists_task_slug_unique
  ON task_checklists (task_id, slug)
  WHERE slug IS NOT NULL;

-- Index pra lookup eficiente quando o auto-checklist service varre items
-- elegíveis durante um submit-data.
CREATE INDEX IF NOT EXISTS task_checklists_auto_complete_event
  ON task_checklists ((auto_complete_on->>'event'))
  WHERE auto_complete_on IS NOT NULL;

ALTER TABLE onboardings
  ADD COLUMN IF NOT EXISTS form_sections_completed JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN task_checklists.slug IS
  'Identificador estável (vem do ChecklistItem.slug do SEED). Sobrevive a re-seeds e habilita auto-complete.';
COMMENT ON COLUMN task_checklists.auto_complete_on IS
  'JSONB que descreve o evento que marca is_completed=true automaticamente. Ver onboarding-auto-checklist.service.ts.';
COMMENT ON COLUMN onboardings.form_sections_completed IS
  'Array JSONB de slugs de seções do wizard do form público (empresa, loja, marca, cliente, objetivos, materiais) já completadas pelo cliente. Set-union, idempotente.';
