-- =============================================
-- AUTO-ASSIGN FEATURES TO ORG MEMBERS
-- =============================================
-- This migration adds a trigger to automatically assign
-- default features when a new org member is created.
-- Also fixes any existing members who don't have features.

-- Function to assign default features based on role
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

  -- Managers receive team controls and views
  ELSIF NEW.role = 'manager' THEN
    INSERT INTO org_member_features (org_member_id, feature_key, enabled, granted_by)
    VALUES
      (NEW.id, 'team_control', true, NEW.profile_id),
      (NEW.id, 'team_view', true, NEW.profile_id),
      (NEW.id, 'onboarding_view', true, NEW.profile_id),
      (NEW.id, 'campaign_view', true, NEW.profile_id),
      (NEW.id, 'request_control', true, NEW.profile_id),
      (NEW.id, 'request_execute', true, NEW.profile_id),
      (NEW.id, 'calendar_control', true, NEW.profile_id)
    ON CONFLICT (org_member_id, feature_key) DO NOTHING;

  -- Coordinators receive broader access
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

  -- Support gets request execution and calendar
  ELSIF NEW.role = 'support' THEN
    INSERT INTO org_member_features (org_member_id, feature_key, enabled, granted_by)
    VALUES
      (NEW.id, 'request_execute', true, NEW.profile_id),
      (NEW.id, 'calendar_control', true, NEW.profile_id)
    ON CONFLICT (org_member_id, feature_key) DO NOTHING;

  -- Analyst gets view access and reports
  ELSIF NEW.role = 'analyst' THEN
    INSERT INTO org_member_features (org_member_id, feature_key, enabled, granted_by)
    VALUES
      (NEW.id, 'campaign_view', true, NEW.profile_id),
      (NEW.id, 'view_reports', true, NEW.profile_id),
      (NEW.id, 'calendar_control', true, NEW.profile_id)
    ON CONFLICT (org_member_id, feature_key) DO NOTHING;

  -- Copywriter gets campaign copy and view
  ELSIF NEW.role = 'copywriter' THEN
    INSERT INTO org_member_features (org_member_id, feature_key, enabled, granted_by)
    VALUES
      (NEW.id, 'campaign_view', true, NEW.profile_id),
      (NEW.id, 'campaign_copy', true, NEW.profile_id),
      (NEW.id, 'request_execute', true, NEW.profile_id),
      (NEW.id, 'calendar_control', true, NEW.profile_id)
    ON CONFLICT (org_member_id, feature_key) DO NOTHING;

  -- Designer gets request execution and calendar
  ELSIF NEW.role = 'designer' THEN
    INSERT INTO org_member_features (org_member_id, feature_key, enabled, granted_by)
    VALUES
      (NEW.id, 'request_execute', true, NEW.profile_id),
      (NEW.id, 'calendar_control', true, NEW.profile_id)
    ON CONFLICT (org_member_id, feature_key) DO NOTHING;

  -- Developer gets request execution and calendar
  ELSIF NEW.role = 'developer' THEN
    INSERT INTO org_member_features (org_member_id, feature_key, enabled, granted_by)
    VALUES
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

-- Create trigger for new org members
DROP TRIGGER IF EXISTS trg_assign_default_features ON org_members;
CREATE TRIGGER trg_assign_default_features
  AFTER INSERT ON org_members
  FOR EACH ROW
  EXECUTE FUNCTION assign_default_features();

-- =============================================
-- FIX EXISTING MEMBERS WITHOUT FEATURES
-- =============================================
-- Find all active org members who don't have any features assigned
-- and assign default features based on their role

DO $$
DECLARE
  v_member RECORD;
  v_feature RECORD;
  v_feature_count INT;
BEGIN
  -- For each active org member
  FOR v_member IN
    SELECT om.id, om.role, om.profile_id
    FROM org_members om
    WHERE om.is_active = true
  LOOP
    -- Check if member has any features
    SELECT COUNT(*) INTO v_feature_count
    FROM org_member_features
    WHERE org_member_id = v_member.id AND enabled = true;

    -- If no features, assign defaults based on role
    IF v_feature_count = 0 THEN
      -- Owners receive ALL features
      IF v_member.role = 'owner' THEN
        FOR v_feature IN SELECT key FROM features_catalog WHERE is_active = true LOOP
          INSERT INTO org_member_features (org_member_id, feature_key, enabled, granted_by)
          VALUES (v_member.id, v_feature.key, true, v_member.profile_id)
          ON CONFLICT (org_member_id, feature_key) DO NOTHING;
        END LOOP;

      -- Managers receive team controls and views
      ELSIF v_member.role = 'manager' THEN
        INSERT INTO org_member_features (org_member_id, feature_key, enabled, granted_by)
        VALUES
          (v_member.id, 'team_control', true, v_member.profile_id),
          (v_member.id, 'team_view', true, v_member.profile_id),
          (v_member.id, 'onboarding_view', true, v_member.profile_id),
          (v_member.id, 'campaign_view', true, v_member.profile_id),
          (v_member.id, 'request_control', true, v_member.profile_id),
          (v_member.id, 'request_execute', true, v_member.profile_id),
          (v_member.id, 'calendar_control', true, v_member.profile_id)
        ON CONFLICT (org_member_id, feature_key) DO NOTHING;

      -- Coordinators receive broader access
      ELSIF v_member.role = 'coordinator' THEN
        INSERT INTO org_member_features (org_member_id, feature_key, enabled, granted_by)
        VALUES
          (v_member.id, 'team_view', true, v_member.profile_id),
          (v_member.id, 'onboarding_view', true, v_member.profile_id),
          (v_member.id, 'campaign_view', true, v_member.profile_id),
          (v_member.id, 'request_control', true, v_member.profile_id),
          (v_member.id, 'request_execute', true, v_member.profile_id),
          (v_member.id, 'calendar_control', true, v_member.profile_id)
        ON CONFLICT (org_member_id, feature_key) DO NOTHING;

      -- Support gets request execution and calendar
      ELSIF v_member.role = 'support' THEN
        INSERT INTO org_member_features (org_member_id, feature_key, enabled, granted_by)
        VALUES
          (v_member.id, 'request_execute', true, v_member.profile_id),
          (v_member.id, 'calendar_control', true, v_member.profile_id)
        ON CONFLICT (org_member_id, feature_key) DO NOTHING;

      -- Analyst gets view access and reports
      ELSIF v_member.role = 'analyst' THEN
        INSERT INTO org_member_features (org_member_id, feature_key, enabled, granted_by)
        VALUES
          (v_member.id, 'campaign_view', true, v_member.profile_id),
          (v_member.id, 'view_reports', true, v_member.profile_id),
          (v_member.id, 'calendar_control', true, v_member.profile_id)
        ON CONFLICT (org_member_id, feature_key) DO NOTHING;

      -- Copywriter gets campaign copy and view
      ELSIF v_member.role = 'copywriter' THEN
        INSERT INTO org_member_features (org_member_id, feature_key, enabled, granted_by)
        VALUES
          (v_member.id, 'campaign_view', true, v_member.profile_id),
          (v_member.id, 'campaign_copy', true, v_member.profile_id),
          (v_member.id, 'request_execute', true, v_member.profile_id),
          (v_member.id, 'calendar_control', true, v_member.profile_id)
        ON CONFLICT (org_member_id, feature_key) DO NOTHING;

      -- Designer gets request execution and calendar
      ELSIF v_member.role = 'designer' THEN
        INSERT INTO org_member_features (org_member_id, feature_key, enabled, granted_by)
        VALUES
          (v_member.id, 'request_execute', true, v_member.profile_id),
          (v_member.id, 'calendar_control', true, v_member.profile_id)
        ON CONFLICT (org_member_id, feature_key) DO NOTHING;

      -- Developer gets request execution and calendar
      ELSIF v_member.role = 'developer' THEN
        INSERT INTO org_member_features (org_member_id, feature_key, enabled, granted_by)
        VALUES
          (v_member.id, 'request_execute', true, v_member.profile_id),
          (v_member.id, 'calendar_control', true, v_member.profile_id)
        ON CONFLICT (org_member_id, feature_key) DO NOTHING;

      -- Default: calendar and request execute
      ELSE
        INSERT INTO org_member_features (org_member_id, feature_key, enabled, granted_by)
        VALUES
          (v_member.id, 'calendar_control', true, v_member.profile_id),
          (v_member.id, 'request_execute', true, v_member.profile_id)
        ON CONFLICT (org_member_id, feature_key) DO NOTHING;
      END IF;

      RAISE NOTICE 'Assigned default features to member % with role %', v_member.id, v_member.role;
    END IF;
  END LOOP;
END$$;

-- Comment
COMMENT ON FUNCTION assign_default_features() IS 'Automatically assigns default features based on role when a new org member is created';
