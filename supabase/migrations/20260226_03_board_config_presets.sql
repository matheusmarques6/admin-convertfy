-- =============================================
-- BOARD CONFIG PRESETS - Story 3.4
-- =============================================
-- 1. Auto-create board_config with role-based presets when org member is created
-- 2. Backfill existing members without board_config

-- =============================================
-- 1. TRIGGER: Auto-create board_config on member insert
-- =============================================

CREATE OR REPLACE FUNCTION apply_board_config_preset()
RETURNS TRIGGER AS $$
BEGIN
  -- Owner/Manager: see all task sources
  IF NEW.role IN ('owner', 'manager') THEN
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

-- Attach trigger (after the feature assignment trigger)
DROP TRIGGER IF EXISTS trg_apply_board_config_preset ON org_members;
CREATE TRIGGER trg_apply_board_config_preset
  AFTER INSERT ON org_members
  FOR EACH ROW
  EXECUTE FUNCTION apply_board_config_preset();

-- =============================================
-- 2. BACKFILL: Apply presets for existing members without board_config
-- =============================================

DO $$
DECLARE
  v_member RECORD;
BEGIN
  FOR v_member IN
    SELECT om.id, om.org_id, om.role
    FROM org_members om
    LEFT JOIN board_config bc ON bc.org_member_id = om.id
    WHERE om.is_active = true
    AND bc.id IS NULL
  LOOP
    -- Owner/Manager
    IF v_member.role IN ('owner', 'manager') THEN
      INSERT INTO board_config (org_member_id, org_id,
        show_onboarding_tasks, show_meeting_tasks, show_campaign_tasks,
        show_feedback_tasks, show_report_tasks, show_contract_tasks,
        show_manual_tasks, calendar_view_mode, show_personal_events)
      VALUES (v_member.id, v_member.org_id,
        true, true, true,
        true, true, true,
        true, 'monthly', true)
      ON CONFLICT (org_member_id) DO NOTHING;

    -- Designer/Developer
    ELSIF v_member.role IN ('designer', 'developer') THEN
      INSERT INTO board_config (org_member_id, org_id,
        show_onboarding_tasks, show_meeting_tasks, show_campaign_tasks,
        show_feedback_tasks, show_report_tasks, show_contract_tasks,
        show_manual_tasks, calendar_view_mode, show_personal_events)
      VALUES (v_member.id, v_member.org_id,
        true, true, true,
        false, false, false,
        true, 'weekly', true)
      ON CONFLICT (org_member_id) DO NOTHING;

    -- Others: use table defaults
    ELSE
      INSERT INTO board_config (org_member_id, org_id,
        show_meeting_tasks, show_manual_tasks)
      VALUES (v_member.id, v_member.org_id, true, true)
      ON CONFLICT (org_member_id) DO NOTHING;
    END IF;

    RAISE NOTICE 'Created board_config for member % (role: %)', v_member.id, v_member.role;
  END LOOP;
END$$;

COMMENT ON FUNCTION apply_board_config_preset() IS 'Auto-creates board_config with role-based presets when a new org member is created. Story 3.4.';
