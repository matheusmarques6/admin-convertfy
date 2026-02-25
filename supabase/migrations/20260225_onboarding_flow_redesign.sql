-- ============================================================
-- ONB-1.1: Redesign do fluxo de onboarding
-- Novos status, tabelas de aprovação e audit trail
-- ============================================================

-- 1. Adicionar novos valores ao enum onboarding_status
-- ALTER TYPE ADD VALUE é seguro e não pode ser revertido
DO $$
BEGIN
  -- Verificar se os valores já existem antes de adicionar
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'pending_approval' AND enumtypid = 'onboarding_status'::regtype) THEN
    ALTER TYPE onboarding_status ADD VALUE 'pending_approval' BEFORE 'in_progress';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'generating_copies' AND enumtypid = 'onboarding_status'::regtype) THEN
    ALTER TYPE onboarding_status ADD VALUE 'generating_copies' AFTER 'pending_approval';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'design' AND enumtypid = 'onboarding_status'::regtype) THEN
    ALTER TYPE onboarding_status ADD VALUE 'design' AFTER 'generating_copies';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'implementation' AND enumtypid = 'onboarding_status'::regtype) THEN
    ALTER TYPE onboarding_status ADD VALUE 'implementation' AFTER 'design';
  END IF;
END $$;

-- 2. Novos campos no client_onboardings
ALTER TABLE client_onboardings
  ADD COLUMN IF NOT EXISTS current_phase TEXT DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID,
  ADD COLUMN IF NOT EXISTS copies_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS design_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS implementation_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_notified_at TIMESTAMPTZ;

-- 3. Tabela de aprovações de onboarding
CREATE TABLE IF NOT EXISTS onboarding_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id UUID NOT NULL REFERENCES client_onboardings(id) ON DELETE CASCADE,
  approved_by UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('approved', 'rejected', 'revision_requested')),
  comments TEXT,
  form_snapshot JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Tabela de log de transições de fase
CREATE TABLE IF NOT EXISTS onboarding_phase_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_id UUID NOT NULL REFERENCES client_onboardings(id) ON DELETE CASCADE,
  from_phase TEXT NOT NULL,
  to_phase TEXT NOT NULL,
  triggered_by TEXT NOT NULL,
  triggered_by_user UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_oa_onboarding ON onboarding_approvals(onboarding_id);
CREATE INDEX IF NOT EXISTS idx_oa_created ON onboarding_approvals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_opt_onboarding ON onboarding_phase_transitions(onboarding_id);
CREATE INDEX IF NOT EXISTS idx_opt_created ON onboarding_phase_transitions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_co_current_phase ON client_onboardings(current_phase);
CREATE INDEX IF NOT EXISTS idx_co_submitted ON client_onboardings(submitted_at);

-- 6. RLS
ALTER TABLE onboarding_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_phase_transitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "all_onboarding_approvals" ON onboarding_approvals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "all_onboarding_phase_transitions" ON onboarding_phase_transitions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 7. Feature onboarding_approve é atribuída via member_feature_flags
-- Para dar permissão de aprovação a um membro:
-- INSERT INTO member_feature_flags (org_member_id, feature_key) VALUES ('uuid-do-membro', 'onboarding_approve');
