-- =============================================
-- ADD COO ROLE TO ENUMS + BOARD CONFIG TRIGGER
-- =============================================

-- 1. Add 'coo' to org_role enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'coo'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'org_role')
  ) THEN
    ALTER TYPE org_role ADD VALUE 'coo' AFTER 'manager';
  END IF;
END$$;

-- 2. Add 'coo' to user_role enum (if it exists as enum)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'coo'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
    ) THEN
      ALTER TYPE user_role ADD VALUE 'coo' AFTER 'manager';
    END IF;
  END IF;
END$$;

-- 3. Update board_config trigger to handle 'coo' role (same as owner/manager)
CREATE OR REPLACE FUNCTION apply_board_config_preset()
RETURNS TRIGGER AS $$
BEGIN
  -- Owner/Manager/COO: see all task sources
  IF NEW.role IN ('owner', 'manager', 'coo') THEN
    INSERT INTO board_config (org_member_id, org_id,
      show_onboarding_tasks, show_meeting_tasks, show_campaign_tasks,
      show_feedback_tasks, show_report_tasks, show_contract_tasks,
      show_manual_tasks, calendar_view_mode, show_personal_events)
    VALUES (NEW.id, NEW.org_id,
      true, true, true,
      true, true, true,
      true, 'monthly', true)
    ON CONFLICT (org_member_id) DO NOTHING;

  -- Designer/Developer: core task sources only
  ELSIF NEW.role IN ('designer', 'developer') THEN
    INSERT INTO board_config (org_member_id, org_id,
      show_onboarding_tasks, show_meeting_tasks, show_campaign_tasks,
      show_feedback_tasks, show_report_tasks, show_contract_tasks,
      show_manual_tasks, calendar_view_mode, show_personal_events)
    VALUES (NEW.id, NEW.org_id,
      true, true, true,
      false, false, false,
      true, 'weekly', true)
    ON CONFLICT (org_member_id) DO NOTHING;

  -- Coordinator: broad access
  ELSIF NEW.role = 'coordinator' THEN
    INSERT INTO board_config (org_member_id, org_id,
      show_onboarding_tasks, show_meeting_tasks, show_campaign_tasks,
      show_feedback_tasks, show_report_tasks, show_contract_tasks,
      show_manual_tasks, calendar_view_mode, show_personal_events)
    VALUES (NEW.id, NEW.org_id,
      true, true, false,
      true, true, true,
      true, 'monthly', true)
    ON CONFLICT (org_member_id) DO NOTHING;

  -- Support: broad access
  ELSIF NEW.role = 'support' THEN
    INSERT INTO board_config (org_member_id, org_id,
      show_onboarding_tasks, show_meeting_tasks, show_campaign_tasks,
      show_feedback_tasks, show_report_tasks, show_contract_tasks,
      show_manual_tasks, calendar_view_mode, show_personal_events)
    VALUES (NEW.id, NEW.org_id,
      true, true, false,
      true, true, true,
      true, 'monthly', true)
    ON CONFLICT (org_member_id) DO NOTHING;

  -- Copywriter: campaign focused
  ELSIF NEW.role = 'copywriter' THEN
    INSERT INTO board_config (org_member_id, org_id,
      show_onboarding_tasks, show_meeting_tasks, show_campaign_tasks,
      show_feedback_tasks, show_report_tasks, show_contract_tasks,
      show_manual_tasks, calendar_view_mode, show_personal_events)
    VALUES (NEW.id, NEW.org_id,
      false, false, true,
      false, false, false,
      true, 'weekly', true)
    ON CONFLICT (org_member_id) DO NOTHING;

  -- Analyst: reports focused
  ELSIF NEW.role = 'analyst' THEN
    INSERT INTO board_config (org_member_id, org_id,
      show_onboarding_tasks, show_meeting_tasks, show_campaign_tasks,
      show_feedback_tasks, show_report_tasks, show_contract_tasks,
      show_manual_tasks, calendar_view_mode, show_personal_events)
    VALUES (NEW.id, NEW.org_id,
      false, true, false,
      false, true, false,
      true, 'monthly', true)
    ON CONFLICT (org_member_id) DO NOTHING;

  -- Default: minimal
  ELSE
    INSERT INTO board_config (org_member_id, org_id,
      show_onboarding_tasks, show_meeting_tasks, show_campaign_tasks,
      show_feedback_tasks, show_report_tasks, show_contract_tasks,
      show_manual_tasks, calendar_view_mode, show_personal_events)
    VALUES (NEW.id, NEW.org_id,
      false, true, false,
      false, false, false,
      true, 'monthly', true)
    ON CONFLICT (org_member_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION apply_board_config_preset() IS 'Auto-creates board_config with role-based presets when a new org member is created. Updated to include COO role.';
