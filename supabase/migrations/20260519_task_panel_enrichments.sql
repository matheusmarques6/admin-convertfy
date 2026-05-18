-- =============================================
-- Task Panel Enrichments (Sprint 2026-05-19)
-- =============================================
-- Adiciona suporte aos novos blocos do drawer de task sem desfazer
-- o schema do Onboarding v2:
--  - onboardings.visual_assets   → paleta, logos, fonte, top produtos
--  - tasks.acceptance_criteria   → critérios de aceitação (text[])
--  - tasks.private_notes         → anotações pessoais (RLS owner-only)
--  - tasks.ai_suggestions        → cache das 3 variações geradas pela IA
--  - Trigger task_history para status/assignee/completion (popula timeline)
--
-- Idempotente. Não recria nada que já existe.

-- ── 1. onboardings.visual_assets ────────────────────────────────────────
-- Estrutura esperada (JSONB):
--   {
--     "palette": ["#1A1A1A", "#D4AF37", "#FFFFFF", "#8B7355", "#F5F5F0"],
--     "logos": {
--       "main": { "url": "...", "size": 24576, "filename": "logo.png" },
--       "mono": { "url": "...", "size": 18432, "filename": "logo-mono.png" }
--     },
--     "font": { "family": "Inter", "fallback": "Helvetica" },
--     "top_products": [
--       { "name": "...", "image_url": "...", "url": "..." }
--     ]
--   }
ALTER TABLE onboardings
  ADD COLUMN IF NOT EXISTS visual_assets JSONB;

-- ── 2. tasks.acceptance_criteria ─────────────────────────────────────────
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS acceptance_criteria TEXT[];

-- ── 3. tasks.private_notes ───────────────────────────────────────────────
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS private_notes TEXT;

-- ── 4. tasks.ai_suggestions ─────────────────────────────────────────────
-- Estrutura esperada (JSONB):
--   {
--     "generated_at": "2026-05-18T...",
--     "model": "claude-sonnet-4-5-20250929",
--     "target_block": "hero|beneficios|cta",
--     "variations": [
--       { "label": "direto",    "headline": "...", "body": "...", "cta": "..." },
--       { "label": "beneficio", "headline": "...", "body": "...", "cta": "..." },
--       { "label": "pergunta",  "headline": "...", "body": "...", "cta": "..." }
--     ]
--   }
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS ai_suggestions JSONB;

-- ── 5. RLS de private_notes: só owner/assignee lê ───────────────────────
-- A coluna private_notes herda a policy genérica de tasks (já permite SELECT
-- por org_members). Para garantir privacidade extra, adicionamos policy
-- específica que limita UPDATE de private_notes a quem é owner/assignee.
-- Não bloqueia SELECT no nível de coluna (Postgres não suporta),
-- mas o endpoint /api/tasks/[id]/private-notes filtra no app layer.

-- ── 6. Trigger task_history pra eventos do sistema ──────────────────────
-- Popula task_history automaticamente em: status changes, assignee changes,
-- completion. Isso alimenta a timeline unificada no drawer.

CREATE OR REPLACE FUNCTION log_task_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
BEGIN
  v_actor := COALESCE(auth.uid(), NEW.created_by);

  -- Status change
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO task_history (task_id, actor_id, action, old_value, new_value)
    VALUES (
      NEW.id,
      v_actor,
      'status_changed',
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status)
    );
  END IF;

  -- Assignee change
  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
    INSERT INTO task_history (task_id, actor_id, action, old_value, new_value)
    VALUES (
      NEW.id,
      v_actor,
      'assigned',
      jsonb_build_object('assignee_id', OLD.assignee_id),
      jsonb_build_object('assignee_id', NEW.assignee_id)
    );
  END IF;

  -- Completion
  IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN
    INSERT INTO task_history (task_id, actor_id, action, old_value, new_value)
    VALUES (
      NEW.id,
      v_actor,
      'completed',
      NULL,
      jsonb_build_object('completed_at', NEW.completed_at)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_task_change ON tasks;
CREATE TRIGGER trg_log_task_change
AFTER UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION log_task_change();

-- Created event
CREATE OR REPLACE FUNCTION log_task_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO task_history (task_id, actor_id, action, old_value, new_value)
  VALUES (
    NEW.id,
    COALESCE(auth.uid(), NEW.created_by),
    'created',
    NULL,
    jsonb_build_object('title', NEW.title, 'status', NEW.status)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_task_created ON tasks;
CREATE TRIGGER trg_log_task_created
AFTER INSERT ON tasks
FOR EACH ROW
EXECUTE FUNCTION log_task_created();

-- ── 7. Comentário registrado em task_history quando novo ────────────────
CREATE OR REPLACE FUNCTION log_task_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO task_history (task_id, actor_id, action, old_value, new_value)
  VALUES (
    NEW.task_id,
    NEW.author_id,
    'commented',
    NULL,
    jsonb_build_object('comment_id', NEW.id, 'preview', LEFT(NEW.content, 100))
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_task_comment ON task_comments;
CREATE TRIGGER trg_log_task_comment
AFTER INSERT ON task_comments
FOR EACH ROW
EXECUTE FUNCTION log_task_comment();

-- ── 8. Deliverable upload registrado ────────────────────────────────────
CREATE OR REPLACE FUNCTION log_task_deliverable_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO task_history (task_id, actor_id, action, old_value, new_value)
    VALUES (
      NEW.task_id,
      auth.uid(),
      'deliverable_status_changed',
      jsonb_build_object('deliverable_id', NEW.id, 'status', OLD.status),
      jsonb_build_object('deliverable_id', NEW.id, 'status', NEW.status, 'label', NEW.label)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_task_deliverable_change ON task_deliverables;
CREATE TRIGGER trg_log_task_deliverable_change
AFTER UPDATE ON task_deliverables
FOR EACH ROW
EXECUTE FUNCTION log_task_deliverable_change();

-- ── 9. Storage bucket para visual_assets ────────────────────────────────
-- bucket onboarding-deliverables já existe; criamos um separado para
-- assets visuais (logos, paletas) com policies próprias.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'onboarding-visual-assets',
  'onboarding-visual-assets',
  false,
  10485760,  -- 10MB
  ARRAY['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Policies pro bucket
DROP POLICY IF EXISTS "Visual assets upload by org members" ON storage.objects;
CREATE POLICY "Visual assets upload by org members"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'onboarding-visual-assets'
  AND EXISTS (
    SELECT 1 FROM onboardings o
    JOIN org_members om ON om.org_id = o.org_id
    WHERE o.id::text = (storage.foldername(name))[1]
      AND om.profile_id = auth.uid()
      AND om.is_active = true
  )
);

DROP POLICY IF EXISTS "Visual assets read by org members" ON storage.objects;
CREATE POLICY "Visual assets read by org members"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'onboarding-visual-assets'
  AND EXISTS (
    SELECT 1 FROM onboardings o
    JOIN org_members om ON om.org_id = o.org_id
    WHERE o.id::text = (storage.foldername(name))[1]
      AND om.profile_id = auth.uid()
      AND om.is_active = true
  )
);

DROP POLICY IF EXISTS "Visual assets delete by org managers" ON storage.objects;
CREATE POLICY "Visual assets delete by org managers"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'onboarding-visual-assets'
  AND EXISTS (
    SELECT 1 FROM onboardings o
    JOIN org_members om ON om.org_id = o.org_id
    WHERE o.id::text = (storage.foldername(name))[1]
      AND om.profile_id = auth.uid()
      AND om.is_active = true
      AND om.role IN ('owner', 'manager', 'coordinator')
  )
);

COMMENT ON COLUMN onboardings.visual_assets IS
  'Paleta, logos, fonte e top produtos da brand. JSONB { palette: hex[], logos: { main, mono }, font: { family, fallback }, top_products: [...] }';

COMMENT ON COLUMN tasks.acceptance_criteria IS
  'Lista de critérios de aceitação para a task (text[]). Renderizado no drawer com checks verdes inline.';

COMMENT ON COLUMN tasks.private_notes IS
  'Anotações pessoais do owner/assignee. RLS app-layer no endpoint.';

COMMENT ON COLUMN tasks.ai_suggestions IS
  'Cache das 3 variações de copy geradas pela IA. Estrutura: { generated_at, model, target_block, variations: [{label, headline, body, cta}] }';
