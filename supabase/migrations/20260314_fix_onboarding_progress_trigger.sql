-- Story 38.1: Fix trigger update_onboarding_progress
-- Problem: The trigger overwrites client_onboardings.status with generic values
-- (in_progress, completed) while the phase service uses it for phase tracking
-- (design, implementation, etc). This causes desync between status and current_phase.
--
-- Fix: The trigger now ONLY updates progress_percent and completed_at.
-- status and clients.status are managed exclusively by onboarding-phase.service.ts.

CREATE OR REPLACE FUNCTION update_onboarding_progress()
RETURNS TRIGGER AS $$
DECLARE
  _progress INTEGER;
BEGIN
  _progress := calculate_onboarding_progress(NEW.onboarding_id);

  UPDATE client_onboardings
  SET
    progress_percent = _progress,
    completed_at = CASE
      WHEN _progress = 100 AND completed_at IS NULL THEN NOW()
      ELSE completed_at
    END
  WHERE id = NEW.onboarding_id;

  -- Note: client_onboardings.status and clients.status are NOT touched here.
  -- They are managed exclusively by onboarding-phase.service.ts to avoid conflicts.

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
