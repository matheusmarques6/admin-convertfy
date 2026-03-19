-- ============================================================================
-- Migration: Fix RLS USING(true) policies — Round 2
-- Date: 2026-03-20
-- Issue: 7 tables still have USING(true) for TO authenticated, allowing any
--        authenticated user to access data from any organization.
--
-- Tables fixed:
--   1. store_feedback_calls   (store_id)  — from 20250107_store_feedback_control.sql
--   2. store_onboarding_data  (store_id)  — from 20260220_store_onboarding_system.sql
--   3. store_briefings        (store_id)  — from 20260220_store_onboarding_system.sql
--   4. store_alerts           (store_id)  — from 20260223_store_alerts.sql
--   5. onboarding_approvals   (onboarding_id) — from 20260225_onboarding_flow_redesign.sql
--   6. onboarding_phase_transitions (onboarding_id) — from 20260225_onboarding_flow_redesign.sql
--   7. meeting_participants   (meeting_id) — from 20260223_fix_meeting_participants_schema.sql
--
-- NOTE: service_role policies are NOT touched here.
--       Only authenticated-user policies are being tightened.
--
-- Strategy:
--   - Tables with store_id: is_admin() OR can_access_store(store_id)
--   - Tables with onboarding_id: JOIN via client_onboardings + can_access_client()
--   - meeting_participants: is_admin() OR is_org_member()
--
-- Reference: 20250215_fix_rls_using_true.sql (same pattern)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. store_feedback_calls (has store_id)
--    Original policies from 20250107_store_feedback_control.sql
-- ============================================================================

DROP POLICY IF EXISTS "Users can view all feedback calls" ON store_feedback_calls;
DROP POLICY IF EXISTS "Users can insert feedback calls" ON store_feedback_calls;
DROP POLICY IF EXISTS "Users can update feedback calls" ON store_feedback_calls;

CREATE POLICY "Users can view store_feedback_calls"
  ON store_feedback_calls FOR SELECT TO authenticated
  USING (is_admin() OR can_access_store(store_id));

CREATE POLICY "Users can insert store_feedback_calls"
  ON store_feedback_calls FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR can_access_store(store_id));

CREATE POLICY "Users can update store_feedback_calls"
  ON store_feedback_calls FOR UPDATE TO authenticated
  USING (is_admin() OR can_access_store(store_id))
  WITH CHECK (is_admin() OR can_access_store(store_id));

-- ============================================================================
-- 2. store_onboarding_data (has store_id)
--    Original policy from 20260220_store_onboarding_system.sql
-- ============================================================================

DROP POLICY IF EXISTS "all_store_onboarding_data" ON store_onboarding_data;

CREATE POLICY "Users can view store_onboarding_data"
  ON store_onboarding_data FOR SELECT TO authenticated
  USING (is_admin() OR can_access_store(store_id));

CREATE POLICY "Users can insert store_onboarding_data"
  ON store_onboarding_data FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR can_access_store(store_id));

CREATE POLICY "Users can update store_onboarding_data"
  ON store_onboarding_data FOR UPDATE TO authenticated
  USING (is_admin() OR can_access_store(store_id))
  WITH CHECK (is_admin() OR can_access_store(store_id));

-- ============================================================================
-- 3. store_briefings (has store_id)
--    Original policy from 20260220_store_onboarding_system.sql
-- ============================================================================

DROP POLICY IF EXISTS "all_store_briefings" ON store_briefings;

CREATE POLICY "Users can view store_briefings"
  ON store_briefings FOR SELECT TO authenticated
  USING (is_admin() OR can_access_store(store_id));

CREATE POLICY "Users can insert store_briefings"
  ON store_briefings FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR can_access_store(store_id));

CREATE POLICY "Users can update store_briefings"
  ON store_briefings FOR UPDATE TO authenticated
  USING (is_admin() OR can_access_store(store_id))
  WITH CHECK (is_admin() OR can_access_store(store_id));

-- ============================================================================
-- 4. store_alerts (has store_id)
--    Original policy from 20260223_store_alerts.sql
-- ============================================================================

DROP POLICY IF EXISTS "all_store_alerts" ON store_alerts;

CREATE POLICY "Users can view store_alerts"
  ON store_alerts FOR SELECT TO authenticated
  USING (is_admin() OR can_access_store(store_id));

CREATE POLICY "Users can insert store_alerts"
  ON store_alerts FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR can_access_store(store_id));

CREATE POLICY "Users can update store_alerts"
  ON store_alerts FOR UPDATE TO authenticated
  USING (is_admin() OR can_access_store(store_id))
  WITH CHECK (is_admin() OR can_access_store(store_id));

-- ============================================================================
-- 5. onboarding_approvals (has onboarding_id — JOIN via client_onboardings)
--    Original policy from 20260225_onboarding_flow_redesign.sql
-- ============================================================================

DROP POLICY IF EXISTS "all_onboarding_approvals" ON onboarding_approvals;

CREATE POLICY "Users can view onboarding_approvals"
  ON onboarding_approvals FOR SELECT TO authenticated
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM client_onboardings co
      WHERE co.id = onboarding_approvals.onboarding_id
      AND can_access_client(co.client_id)
    )
  );

CREATE POLICY "Users can insert onboarding_approvals"
  ON onboarding_approvals FOR INSERT TO authenticated
  WITH CHECK (
    is_admin() OR EXISTS (
      SELECT 1 FROM client_onboardings co
      WHERE co.id = onboarding_approvals.onboarding_id
      AND can_access_client(co.client_id)
    )
  );

CREATE POLICY "Users can update onboarding_approvals"
  ON onboarding_approvals FOR UPDATE TO authenticated
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM client_onboardings co
      WHERE co.id = onboarding_approvals.onboarding_id
      AND can_access_client(co.client_id)
    )
  )
  WITH CHECK (
    is_admin() OR EXISTS (
      SELECT 1 FROM client_onboardings co
      WHERE co.id = onboarding_approvals.onboarding_id
      AND can_access_client(co.client_id)
    )
  );

-- ============================================================================
-- 6. onboarding_phase_transitions (has onboarding_id — JOIN via client_onboardings)
--    Original policy from 20260225_onboarding_flow_redesign.sql
-- ============================================================================

DROP POLICY IF EXISTS "all_onboarding_phase_transitions" ON onboarding_phase_transitions;

CREATE POLICY "Users can view onboarding_phase_transitions"
  ON onboarding_phase_transitions FOR SELECT TO authenticated
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM client_onboardings co
      WHERE co.id = onboarding_phase_transitions.onboarding_id
      AND can_access_client(co.client_id)
    )
  );

CREATE POLICY "Users can insert onboarding_phase_transitions"
  ON onboarding_phase_transitions FOR INSERT TO authenticated
  WITH CHECK (
    is_admin() OR EXISTS (
      SELECT 1 FROM client_onboardings co
      WHERE co.id = onboarding_phase_transitions.onboarding_id
      AND can_access_client(co.client_id)
    )
  );

CREATE POLICY "Users can update onboarding_phase_transitions"
  ON onboarding_phase_transitions FOR UPDATE TO authenticated
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM client_onboardings co
      WHERE co.id = onboarding_phase_transitions.onboarding_id
      AND can_access_client(co.client_id)
    )
  )
  WITH CHECK (
    is_admin() OR EXISTS (
      SELECT 1 FROM client_onboardings co
      WHERE co.id = onboarding_phase_transitions.onboarding_id
      AND can_access_client(co.client_id)
    )
  );

-- ============================================================================
-- 7. meeting_participants (org-level, no store_id)
--    Policies from 20260223_fix_meeting_participants_schema.sql re-created
--    USING(true) after the 20250215 fix. Fixing again.
-- ============================================================================

DROP POLICY IF EXISTS "meeting_participants_select_policy" ON meeting_participants;
DROP POLICY IF EXISTS "meeting_participants_insert_policy" ON meeting_participants;
DROP POLICY IF EXISTS "meeting_participants_update_policy" ON meeting_participants;
DROP POLICY IF EXISTS "meeting_participants_delete_policy" ON meeting_participants;
-- Also drop the old name from 20250215 in case it still exists
DROP POLICY IF EXISTS "Users can view meeting_participants" ON meeting_participants;

CREATE POLICY "Users can view meeting_participants"
  ON meeting_participants FOR SELECT TO authenticated
  USING (is_admin() OR is_org_member());

CREATE POLICY "Users can insert meeting_participants"
  ON meeting_participants FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "Users can update meeting_participants"
  ON meeting_participants FOR UPDATE TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "Users can delete meeting_participants"
  ON meeting_participants FOR DELETE TO authenticated
  USING (is_admin() OR is_org_member());

COMMIT;

-- ============================================================================
-- VERIFICATION QUERY (run after migration to confirm no USING(true) remains)
-- Should return 0 rows (except profiles, tags which are intentionally open)
-- ============================================================================
-- SELECT schemaname, tablename, policyname, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND roles::text LIKE '%authenticated%'
--   AND qual = 'true'
--   AND tablename NOT IN ('profiles', 'tags');

-- ============================================================================
-- ROLLBACK (uncomment if needed):
-- ============================================================================
--
-- -- store_feedback_calls
-- DROP POLICY IF EXISTS "Users can view store_feedback_calls" ON store_feedback_calls;
-- DROP POLICY IF EXISTS "Users can insert store_feedback_calls" ON store_feedback_calls;
-- DROP POLICY IF EXISTS "Users can update store_feedback_calls" ON store_feedback_calls;
-- CREATE POLICY "Users can view all feedback calls" ON store_feedback_calls FOR SELECT TO authenticated USING (true);
-- CREATE POLICY "Users can insert feedback calls" ON store_feedback_calls FOR INSERT TO authenticated WITH CHECK (true);
-- CREATE POLICY "Users can update feedback calls" ON store_feedback_calls FOR UPDATE TO authenticated USING (true);
--
-- -- store_onboarding_data
-- DROP POLICY IF EXISTS "Users can view store_onboarding_data" ON store_onboarding_data;
-- DROP POLICY IF EXISTS "Users can insert store_onboarding_data" ON store_onboarding_data;
-- DROP POLICY IF EXISTS "Users can update store_onboarding_data" ON store_onboarding_data;
-- CREATE POLICY "all_store_onboarding_data" ON store_onboarding_data FOR ALL TO authenticated USING (true) WITH CHECK (true);
--
-- -- store_briefings
-- DROP POLICY IF EXISTS "Users can view store_briefings" ON store_briefings;
-- DROP POLICY IF EXISTS "Users can insert store_briefings" ON store_briefings;
-- DROP POLICY IF EXISTS "Users can update store_briefings" ON store_briefings;
-- CREATE POLICY "all_store_briefings" ON store_briefings FOR ALL TO authenticated USING (true) WITH CHECK (true);
--
-- -- store_alerts
-- DROP POLICY IF EXISTS "Users can view store_alerts" ON store_alerts;
-- DROP POLICY IF EXISTS "Users can insert store_alerts" ON store_alerts;
-- DROP POLICY IF EXISTS "Users can update store_alerts" ON store_alerts;
-- CREATE POLICY "all_store_alerts" ON store_alerts FOR ALL TO authenticated USING (true) WITH CHECK (true);
--
-- -- onboarding_approvals
-- DROP POLICY IF EXISTS "Users can view onboarding_approvals" ON onboarding_approvals;
-- DROP POLICY IF EXISTS "Users can insert onboarding_approvals" ON onboarding_approvals;
-- DROP POLICY IF EXISTS "Users can update onboarding_approvals" ON onboarding_approvals;
-- CREATE POLICY "all_onboarding_approvals" ON onboarding_approvals FOR ALL TO authenticated USING (true) WITH CHECK (true);
--
-- -- onboarding_phase_transitions
-- DROP POLICY IF EXISTS "Users can view onboarding_phase_transitions" ON onboarding_phase_transitions;
-- DROP POLICY IF EXISTS "Users can insert onboarding_phase_transitions" ON onboarding_phase_transitions;
-- DROP POLICY IF EXISTS "Users can update onboarding_phase_transitions" ON onboarding_phase_transitions;
-- CREATE POLICY "all_onboarding_phase_transitions" ON onboarding_phase_transitions FOR ALL TO authenticated USING (true) WITH CHECK (true);
--
-- -- meeting_participants
-- DROP POLICY IF EXISTS "Users can view meeting_participants" ON meeting_participants;
-- DROP POLICY IF EXISTS "Users can insert meeting_participants" ON meeting_participants;
-- DROP POLICY IF EXISTS "Users can update meeting_participants" ON meeting_participants;
-- DROP POLICY IF EXISTS "Users can delete meeting_participants" ON meeting_participants;
-- CREATE POLICY "meeting_participants_select_policy" ON meeting_participants FOR SELECT TO authenticated USING (true);
-- CREATE POLICY "meeting_participants_insert_policy" ON meeting_participants FOR INSERT TO authenticated WITH CHECK (true);
-- CREATE POLICY "meeting_participants_update_policy" ON meeting_participants FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
-- CREATE POLICY "meeting_participants_delete_policy" ON meeting_participants FOR DELETE TO authenticated USING (true);
