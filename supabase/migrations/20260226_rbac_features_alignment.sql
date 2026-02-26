-- =============================================
-- RBAC FEATURES ALIGNMENT - Story 3.1
-- =============================================
-- Realigns role→feature mappings for the 4 main profiles:
-- Admin (owner), COO (manager), Design (designer), Implementação (developer)
-- Also updates existing members to match new defaults.

-- =============================================
-- 1. UPDATE TRIGGER FUNCTION
-- =============================================

CREATE OR REPLACE FUNCTION assign_default_features()
RETURNS TRIGGER AS $$
BEGIN
  -- Owners receive ALL features
  IF NEW.role = 'owner' THEN
    INSERT INTO org_member_features (org_member_id, feature_key, enabled, granted_by)
    SELECT NEW.id, key, true, NEW.profile_id
    FROM features_catalog
    WHERE is_active = true
    ON CONFLICT (org_member_id, feature_key) DO NOTHING;

  -- Manager (COO): broad access except financial and client creation
  ELSIF NEW.role = 'manager' THEN
    INSERT INTO org_member_features (org_member_id, feature_key, enabled, granted_by)
    VALUES
      (NEW.id, 'onboarding_control', true, NEW.profile_id),
      (NEW.id, 'onboarding_view', true, NEW.profile_id),
      (NEW.id, 'team_control', true, NEW.profile_id),
      (NEW.id, 'team_view', true, NEW.profile_id),
      (NEW.id, 'campaign_view', true, NEW.profile_id),
      (NEW.id, 'campaign_copy', true, NEW.profile_id),
      (NEW.id, 'request_control', true, NEW.profile_id),
      (NEW.id, 'request_execute', true, NEW.profile_id),
      (NEW.id, 'calendar_control', true, NEW.profile_id),
      (NEW.id, 'view_reports', true, NEW.profile_id)
    ON CONFLICT (org_member_id, feature_key) DO NOTHING;

  -- Coordinator: broader access (unchanged concept, updated set)
  ELSIF NEW.role = 'coordinator' THEN
    INSERT INTO org_member_features (org_member_id, feature_key, enabled, granted_by)
    VALUES
      (NEW.id, 'team_view', true, NEW.profile_id),
      (NEW.id, 'onboarding_view', true, NEW.profile_id),
      (NEW.id, 'campaign_view', true, NEW.profile_id),
      (NEW.id, 'request_control', true, NEW.profile_id),
      (NEW.id, 'request_execute', true, NEW.profile_id),
      (NEW.id, 'calendar_control', true, NEW.profile_id)
    ON CONFLICT (org_member_id, feature_key) DO NOTHING;

  -- Designer: content-focused access
  ELSIF NEW.role = 'designer' THEN
    INSERT INTO org_member_features (org_member_id, feature_key, enabled, granted_by)
    VALUES
      (NEW.id, 'onboarding_view', true, NEW.profile_id),
      (NEW.id, 'team_view', true, NEW.profile_id),
      (NEW.id, 'campaign_view', true, NEW.profile_id),
      (NEW.id, 'campaign_copy', true, NEW.profile_id),
      (NEW.id, 'request_execute', true, NEW.profile_id),
      (NEW.id, 'calendar_control', true, NEW.profile_id)
    ON CONFLICT (org_member_id, feature_key) DO NOTHING;

  -- Developer (Implementação): execution-focused access
  ELSIF NEW.role = 'developer' THEN
    INSERT INTO org_member_features (org_member_id, feature_key, enabled, granted_by)
    VALUES
      (NEW.id, 'onboarding_view', true, NEW.profile_id),
      (NEW.id, 'team_view', true, NEW.profile_id),
      (NEW.id, 'campaign_control', true, NEW.profile_id),
      (NEW.id, 'campaign_view', true, NEW.profile_id),
      (NEW.id, 'request_execute', true, NEW.profile_id),
      (NEW.id, 'calendar_control', true, NEW.profile_id)
    ON CONFLICT (org_member_id, feature_key) DO NOTHING;

  -- Support: request execution and calendar
  ELSIF NEW.role = 'support' THEN
    INSERT INTO org_member_features (org_member_id, feature_key, enabled, granted_by)
    VALUES
      (NEW.id, 'request_execute', true, NEW.profile_id),
      (NEW.id, 'calendar_control', true, NEW.profile_id)
    ON CONFLICT (org_member_id, feature_key) DO NOTHING;

  -- Analyst: view access and reports
  ELSIF NEW.role = 'analyst' THEN
    INSERT INTO org_member_features (org_member_id, feature_key, enabled, granted_by)
    VALUES
      (NEW.id, 'campaign_view', true, NEW.profile_id),
      (NEW.id, 'view_reports', true, NEW.profile_id),
      (NEW.id, 'calendar_control', true, NEW.profile_id)
    ON CONFLICT (org_member_id, feature_key) DO NOTHING;

  -- Copywriter: campaign copy and view
  ELSIF NEW.role = 'copywriter' THEN
    INSERT INTO org_member_features (org_member_id, feature_key, enabled, granted_by)
    VALUES
      (NEW.id, 'campaign_view', true, NEW.profile_id),
      (NEW.id, 'campaign_copy', true, NEW.profile_id),
      (NEW.id, 'request_execute', true, NEW.profile_id),
      (NEW.id, 'calendar_control', true, NEW.profile_id)
    ON CONFLICT (org_member_id, feature_key) DO NOTHING;

  -- Default: calendar and request execute
  ELSE
    INSERT INTO org_member_features (org_member_id, feature_key, enabled, granted_by)
    VALUES
      (NEW.id, 'calendar_control', true, NEW.profile_id),
      (NEW.id, 'request_execute', true, NEW.profile_id)
    ON CONFLICT (org_member_id, feature_key) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 2. RE-APPLY DEFAULTS FOR EXISTING MEMBERS
-- =============================================
-- This adds missing features to existing members based on new role mappings.
-- Uses ON CONFLICT DO NOTHING so it won't overwrite existing custom assignments.

DO $$
DECLARE
  v_member RECORD;
BEGIN
  FOR v_member IN
    SELECT om.id, om.role, om.profile_id
    FROM org_members om
    WHERE om.is_active = true
  LOOP
    -- Manager (COO): add new features they should have
    IF v_member.role = 'manager' THEN
      INSERT INTO org_member_features (org_member_id, feature_key, enabled, granted_by)
      VALUES
        (v_member.id, 'onboarding_control', true, v_member.profile_id),
        (v_member.id, 'onboarding_view', true, v_member.profile_id),
        (v_member.id, 'team_control', true, v_member.profile_id),
        (v_member.id, 'team_view', true, v_member.profile_id),
        (v_member.id, 'campaign_view', true, v_member.profile_id),
        (v_member.id, 'campaign_copy', true, v_member.profile_id),
        (v_member.id, 'request_control', true, v_member.profile_id),
        (v_member.id, 'request_execute', true, v_member.profile_id),
        (v_member.id, 'calendar_control', true, v_member.profile_id),
        (v_member.id, 'view_reports', true, v_member.profile_id)
      ON CONFLICT (org_member_id, feature_key) DO NOTHING;

    -- Designer: add all new features
    ELSIF v_member.role = 'designer' THEN
      INSERT INTO org_member_features (org_member_id, feature_key, enabled, granted_by)
      VALUES
        (v_member.id, 'onboarding_view', true, v_member.profile_id),
        (v_member.id, 'team_view', true, v_member.profile_id),
        (v_member.id, 'campaign_view', true, v_member.profile_id),
        (v_member.id, 'campaign_copy', true, v_member.profile_id),
        (v_member.id, 'request_execute', true, v_member.profile_id),
        (v_member.id, 'calendar_control', true, v_member.profile_id)
      ON CONFLICT (org_member_id, feature_key) DO NOTHING;

    -- Developer (Implementação): add all new features
    ELSIF v_member.role = 'developer' THEN
      INSERT INTO org_member_features (org_member_id, feature_key, enabled, granted_by)
      VALUES
        (v_member.id, 'onboarding_view', true, v_member.profile_id),
        (v_member.id, 'team_view', true, v_member.profile_id),
        (v_member.id, 'campaign_control', true, v_member.profile_id),
        (v_member.id, 'campaign_view', true, v_member.profile_id),
        (v_member.id, 'request_execute', true, v_member.profile_id),
        (v_member.id, 'calendar_control', true, v_member.profile_id)
      ON CONFLICT (org_member_id, feature_key) DO NOTHING;

    -- Owner: ensure ALL features (in case new ones were added)
    ELSIF v_member.role = 'owner' THEN
      INSERT INTO org_member_features (org_member_id, feature_key, enabled, granted_by)
      SELECT v_member.id, key, true, v_member.profile_id
      FROM features_catalog
      WHERE is_active = true
      ON CONFLICT (org_member_id, feature_key) DO NOTHING;

    END IF;

    RAISE NOTICE 'Updated features for member % with role %', v_member.id, v_member.role;
  END LOOP;
END$$;

COMMENT ON FUNCTION assign_default_features() IS 'Automatically assigns default features based on role when a new org member is created. Updated in Story 3.1 to align with Admin/COO/Design/Implementation profiles.';
