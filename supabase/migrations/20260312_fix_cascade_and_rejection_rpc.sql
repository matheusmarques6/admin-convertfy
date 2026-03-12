-- Fix 3 missing ON DELETE CASCADE constraints and create atomic rejection RPC
-- Related to: onboarding rejection flow cleanup

-- ============================================================
-- 1. Fix campaign_generations.client_id (missing CASCADE)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'campaign_generations_client_id_fkey'
      AND conrelid = 'campaign_generations'::regclass
  ) THEN
    ALTER TABLE campaign_generations DROP CONSTRAINT campaign_generations_client_id_fkey;
  END IF;

  ALTER TABLE campaign_generations
    ADD CONSTRAINT campaign_generations_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
END $$;

-- ============================================================
-- 2. Fix campaign_generation_stores.store_id (missing CASCADE)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'campaign_generation_stores_store_id_fkey'
      AND conrelid = 'campaign_generation_stores'::regclass
  ) THEN
    ALTER TABLE campaign_generation_stores DROP CONSTRAINT campaign_generation_stores_store_id_fkey;
  END IF;

  ALTER TABLE campaign_generation_stores
    ADD CONSTRAINT campaign_generation_stores_store_id_fkey
    FOREIGN KEY (store_id) REFERENCES client_stores(id) ON DELETE CASCADE;
END $$;

-- ============================================================
-- 3. Fix store_briefings.onboarding_data_id (missing ON DELETE)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'store_briefings_onboarding_data_id_fkey'
      AND conrelid = 'store_briefings'::regclass
  ) THEN
    ALTER TABLE store_briefings DROP CONSTRAINT store_briefings_onboarding_data_id_fkey;
  END IF;

  ALTER TABLE store_briefings
    ADD CONSTRAINT store_briefings_onboarding_data_id_fkey
    FOREIGN KEY (onboarding_data_id) REFERENCES store_onboarding_data(id) ON DELETE SET NULL;
END $$;

-- ============================================================
-- 4. Audit table for rejected onboardings (persistent, queryable)
-- ============================================================
CREATE TABLE IF NOT EXISTS onboarding_rejection_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  onboarding_id UUID NOT NULL,
  client_email TEXT NOT NULL,
  client_name TEXT,
  store_name TEXT,
  rejected_by UUID NOT NULL,
  comments TEXT,
  form_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orl_org_id ON onboarding_rejection_log(org_id);
CREATE INDEX IF NOT EXISTS idx_orl_email ON onboarding_rejection_log(client_email);

-- RLS: only org members can see their org's rejection logs
ALTER TABLE onboarding_rejection_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "org_members_read_rejection_log" ON onboarding_rejection_log
    FOR SELECT USING (
      org_id IN (
        SELECT om.org_id FROM org_members om
        WHERE om.profile_id = auth.uid() AND om.is_active = TRUE
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 5. RPC: Atomic deletion of rejected onboarding data
--    - Runs in a single transaction (all or nothing)
--    - Validates phase = pending_approval (defense-in-depth)
--    - Validates ID consistency (onboarding belongs to client/store)
--    - Locks client row to prevent TOCTOU race
--    - Skips client deletion if other stores/onboardings exist
-- ============================================================
CREATE OR REPLACE FUNCTION delete_rejected_onboarding(
  p_onboarding_id UUID,
  p_client_id UUID,
  p_store_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_onboarding RECORD;
  v_other_records INT;
  v_client_deleted BOOLEAN := FALSE;
BEGIN
  -- Guard 1: Validate onboarding exists, is in pending_approval, and IDs match
  SELECT id, client_id, store_id, current_phase
  INTO v_onboarding
  FROM client_onboardings
  WHERE id = p_onboarding_id
  FOR UPDATE;  -- Lock row to prevent concurrent approve/reject race

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Onboarding % not found', p_onboarding_id;
  END IF;

  IF v_onboarding.current_phase != 'pending_approval' THEN
    RAISE EXCEPTION 'Onboarding % is not in pending_approval (current: %)',
      p_onboarding_id, v_onboarding.current_phase;
  END IF;

  IF v_onboarding.client_id != p_client_id THEN
    RAISE EXCEPTION 'Client ID mismatch for onboarding %', p_onboarding_id;
  END IF;

  IF p_store_id IS NOT NULL AND v_onboarding.store_id IS DISTINCT FROM p_store_id THEN
    RAISE EXCEPTION 'Store ID mismatch for onboarding %', p_onboarding_id;
  END IF;

  -- Guard 2: Lock client row to prevent TOCTOU race on deletion
  IF p_client_id IS NOT NULL THEN
    PERFORM 1 FROM clients WHERE id = p_client_id FOR UPDATE;
  END IF;

  -- 1. Delete onboarding children (explicit for clarity, CASCADE would handle)
  DELETE FROM onboarding_phase_transitions WHERE onboarding_id = p_onboarding_id;
  DELETE FROM client_onboarding_steps WHERE onboarding_id = p_onboarding_id;
  DELETE FROM onboarding_approvals WHERE onboarding_id = p_onboarding_id;

  -- 2. Nullify copy_pipeline references (FK is ON DELETE SET NULL)
  UPDATE copy_pipeline SET onboarding_id = NULL WHERE onboarding_id = p_onboarding_id;

  -- 3. Delete the onboarding record
  DELETE FROM client_onboardings WHERE id = p_onboarding_id;

  -- 4. Delete store and its children (CASCADE handles most child tables)
  IF p_store_id IS NOT NULL THEN
    DELETE FROM store_onboarding_data WHERE store_id = p_store_id;
    DELETE FROM client_stores WHERE id = p_store_id;
  END IF;

  -- 5. Only delete client if no other stores or onboardings remain
  IF p_client_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_other_records
    FROM client_stores
    WHERE client_id = p_client_id;

    IF v_other_records = 0 THEN
      -- Double-check: no other onboardings either
      SELECT COUNT(*) INTO v_other_records
      FROM client_onboardings
      WHERE client_id = p_client_id;

      IF v_other_records = 0 THEN
        DELETE FROM clients WHERE id = p_client_id;
        v_client_deleted := TRUE;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'onboarding_deleted', TRUE,
    'store_deleted', p_store_id IS NOT NULL,
    'client_deleted', v_client_deleted
  );
END;
$$;

-- 6. Restrict RPC access to service_role only (prevents client-side abuse)
REVOKE ALL ON FUNCTION delete_rejected_onboarding(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION delete_rejected_onboarding(UUID, UUID, UUID) FROM authenticated;
REVOKE ALL ON FUNCTION delete_rejected_onboarding(UUID, UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION delete_rejected_onboarding(UUID, UUID, UUID) TO service_role;
