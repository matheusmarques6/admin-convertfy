-- ============================================================
-- Store Transfer System
-- Allows transferring a store from one client to another
-- Phase 1: Same-org transfers only
-- ============================================================

-- 1. Audit table for transfer history
CREATE TABLE IF NOT EXISTS store_transfer_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  from_client_id UUID,              -- NULL if store was orphan
  to_client_id UUID NOT NULL,
  org_id UUID NOT NULL,             -- Phase 1: same org; Phase 2: split into from/to
  transfer_type TEXT NOT NULL DEFAULT 'same_org'
    CHECK (transfer_type IN ('same_org', 'cross_org')),
  transferred_by UUID NOT NULL,
  reason TEXT,
  snapshot JSONB DEFAULT '{}',      -- pre-transfer state for rollback
  affected_tables JSONB DEFAULT '{}', -- row counts per table
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for querying transfer history by store
CREATE INDEX idx_store_transfer_history_store_id ON store_transfer_history(store_id);
CREATE INDEX idx_store_transfer_history_created_at ON store_transfer_history(created_at DESC);

-- RLS for store_transfer_history
ALTER TABLE store_transfer_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access_store_transfer_history"
  ON store_transfer_history
  FOR ALL
  USING (is_admin() = true);

CREATE POLICY "org_owner_read_store_transfer_history"
  ON store_transfer_history
  FOR SELECT
  USING (is_org_owner() = true);

-- ============================================================
-- 2. RPC Function: transfer_store_to_client
--
-- Authorization is handled by the API layer (requireStoreAccess).
-- This function is called via adminClient (service role), so
-- auth.uid() is not available. The caller ID is passed explicitly
-- for audit trail purposes.
-- ============================================================
CREATE OR REPLACE FUNCTION transfer_store_to_client(
  p_store_id UUID,
  p_target_client_id UUID,
  p_caller_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store RECORD;
  v_target_client RECORD;
  v_source_client_id UUID;
  v_source_org_id UUID;
  v_target_org_id UUID;
  v_snapshot JSONB;
  v_affected JSONB := '{}'::JSONB;
  v_transfer_id UUID;
  v_count INT;
  v_deleted_onboardings JSONB;
BEGIN
  -- Validate required parameters
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'store_id e obrigatorio' USING ERRCODE = 'P0001';
  END IF;
  IF p_target_client_id IS NULL THEN
    RAISE EXCEPTION 'target_client_id e obrigatorio' USING ERRCODE = 'P0001';
  END IF;
  IF p_caller_id IS NULL THEN
    RAISE EXCEPTION 'caller_id e obrigatorio' USING ERRCODE = 'P0001';
  END IF;

  -- 1. Lock and fetch store
  SELECT id, client_id, org_id, store_name
  INTO v_store
  FROM client_stores
  WHERE id = p_store_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loja nao encontrada: %', p_store_id USING ERRCODE = 'P0004';
  END IF;

  v_source_client_id := v_store.client_id;
  v_source_org_id := v_store.org_id;

  -- Guard: store must have org_id
  IF v_source_org_id IS NULL THEN
    RAISE EXCEPTION 'Loja sem organizacao associada (org_id NULL)' USING ERRCODE = 'P0002';
  END IF;

  -- 2. Fetch target client
  SELECT id, org_id
  INTO v_target_client
  FROM clients
  WHERE id = p_target_client_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente destino nao encontrado: %', p_target_client_id USING ERRCODE = 'P0005';
  END IF;

  v_target_org_id := v_target_client.org_id;

  -- 3. Guard: already belongs to target
  IF v_source_client_id = p_target_client_id THEN
    RETURN jsonb_build_object(
      'status', 'no_op',
      'message', 'Loja ja pertence a este cliente'
    );
  END IF;

  -- 4. Guard: cross-org not supported in Phase 1
  IF v_source_org_id != v_target_org_id THEN
    RAISE EXCEPTION 'Transferencia cross-org nao suportada. Ambos os clientes devem pertencer a mesma organizacao.'
      USING ERRCODE = 'P0006';
  END IF;

  -- 5. Build snapshot for rollback
  v_snapshot := jsonb_build_object(
    'store', jsonb_build_object(
      'id', v_store.id,
      'client_id', v_source_client_id,
      'org_id', v_source_org_id,
      'store_name', v_store.store_name
    )
  );

  -- 6. Atomic updates

  -- 6a. client_stores
  UPDATE client_stores
  SET client_id = p_target_client_id, updated_at = now()
  WHERE id = p_store_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_affected := v_affected || jsonb_build_object('client_stores', v_count);

  -- 6b. campaigns
  UPDATE campaigns
  SET client_id = p_target_client_id
  WHERE store_id = p_store_id
    AND client_id IS DISTINCT FROM p_target_client_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_affected := v_affected || jsonb_build_object('campaigns', v_count);

  -- 6c. store_alerts
  UPDATE store_alerts
  SET client_id = p_target_client_id
  WHERE store_id = p_store_id
    AND client_id IS DISTINCT FROM p_target_client_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_affected := v_affected || jsonb_build_object('store_alerts', v_count);

  -- 6d. client_onboardings (handle UNIQUE constraint)
  -- Capture conflicting rows before deleting (for forensics/rollback)
  SELECT COALESCE(jsonb_agg(to_jsonb(co)), '[]'::JSONB)
  INTO v_deleted_onboardings
  FROM client_onboardings co
  WHERE client_id = p_target_client_id AND store_id = p_store_id;

  IF v_deleted_onboardings != '[]'::JSONB THEN
    v_snapshot := v_snapshot || jsonb_build_object('deleted_onboarding_conflicts', v_deleted_onboardings);
  END IF;

  -- Delete conflicting rows on the target client
  DELETE FROM client_onboardings
  WHERE client_id = p_target_client_id AND store_id = p_store_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_affected := v_affected || jsonb_build_object('client_onboardings_conflicts_deleted', v_count);

  -- Then update existing onboardings for this store
  UPDATE client_onboardings
  SET client_id = p_target_client_id
  WHERE store_id = p_store_id
    AND client_id IS DISTINCT FROM p_target_client_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_affected := v_affected || jsonb_build_object('client_onboardings', v_count);

  -- 6e. store_onboarding_data
  UPDATE store_onboarding_data
  SET client_id = p_target_client_id
  WHERE store_id = p_store_id
    AND client_id IS DISTINCT FROM p_target_client_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_affected := v_affected || jsonb_build_object('store_onboarding_data', v_count);

  -- 6f. client_reports
  UPDATE client_reports
  SET client_id = p_target_client_id
  WHERE store_id = p_store_id
    AND client_id IS DISTINCT FROM p_target_client_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_affected := v_affected || jsonb_build_object('client_reports', v_count);

  -- 6g. store_feedback_calls
  UPDATE store_feedback_calls
  SET client_id = p_target_client_id
  WHERE store_id = p_store_id
    AND client_id IS DISTINCT FROM p_target_client_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_affected := v_affected || jsonb_build_object('store_feedback_calls', v_count);

  -- 6h. copy_pipeline
  UPDATE copy_pipeline
  SET client_id = p_target_client_id
  WHERE store_id = p_store_id
    AND client_id IS DISTINCT FROM p_target_client_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_affected := v_affected || jsonb_build_object('copy_pipeline', v_count);

  -- 6i. tasks (nullable store_id and client_id)
  UPDATE tasks
  SET client_id = p_target_client_id
  WHERE store_id = p_store_id
    AND client_id IS DISTINCT FROM p_target_client_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_affected := v_affected || jsonb_build_object('tasks', v_count);

  -- 6j. client_report_tokens (shared report links follow the store)
  UPDATE client_report_tokens
  SET client_id = p_target_client_id
  WHERE store_id = p_store_id
    AND client_id IS DISTINCT FROM p_target_client_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_affected := v_affected || jsonb_build_object('client_report_tokens', v_count);

  -- 6k. campaign_generations (only single-store generations tied to this store)
  -- campaign_generations has client_id; campaign_generation_stores links by store_id.
  -- Only update generations where this is the ONLY store (avoids corrupting multi-store generations).
  UPDATE campaign_generations cg
  SET client_id = p_target_client_id
  WHERE cg.id IN (
    SELECT cgs.generation_id
    FROM campaign_generation_stores cgs
    WHERE cgs.store_id = p_store_id
    GROUP BY cgs.generation_id
    HAVING COUNT(*) = (
      SELECT COUNT(*) FROM campaign_generation_stores WHERE generation_id = cgs.generation_id
    )
  )
  AND cg.client_id IS DISTINCT FROM p_target_client_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_affected := v_affected || jsonb_build_object('campaign_generations', v_count);

  -- 7. Cache invalidation
  DELETE FROM dashboard_cache WHERE store_id = p_store_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_affected := v_affected || jsonb_build_object('dashboard_cache_invalidated', v_count);

  DELETE FROM store_revenue_summary WHERE store_id = p_store_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_affected := v_affected || jsonb_build_object('store_revenue_summary_invalidated', v_count);

  -- 8. Insert audit record
  v_transfer_id := gen_random_uuid();
  INSERT INTO store_transfer_history (
    id, store_id, from_client_id, to_client_id, org_id,
    transfer_type, transferred_by, reason, snapshot, affected_tables
  ) VALUES (
    v_transfer_id, p_store_id, v_source_client_id, p_target_client_id, v_source_org_id,
    'same_org', p_caller_id, p_reason, v_snapshot, v_affected
  );

  -- 9. Return summary
  RETURN jsonb_build_object(
    'status', 'success',
    'transfer_id', v_transfer_id,
    'store_id', p_store_id,
    'store_name', v_store.store_name,
    'from_client_id', v_source_client_id,
    'to_client_id', p_target_client_id,
    'org_id', v_source_org_id,
    'affected_tables', v_affected
  );
END;
$$;

-- Grant execute to service role (called via adminClient from API layer)
GRANT EXECUTE ON FUNCTION transfer_store_to_client(UUID, UUID, UUID, TEXT) TO service_role;
