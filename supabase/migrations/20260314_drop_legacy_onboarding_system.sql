-- Story 38.3: Drop legacy onboarding system
-- The legacy system (onboarding_stage on clients table) has been fully replaced
-- by the new system (client_onboardings table + onboarding-phase.service.ts).
-- These triggers, functions, columns, and tables are no longer referenced in code.

-- 1. Drop triggers on clients table
DROP TRIGGER IF EXISTS trigger_onboarding_completion ON clients;
DROP TRIGGER IF EXISTS trigger_record_onboarding_change ON clients;

-- 2. Drop functions
DROP FUNCTION IF EXISTS handle_onboarding_completion();
DROP FUNCTION IF EXISTS record_onboarding_stage_change();

-- 3. Drop legacy columns from clients table
ALTER TABLE clients DROP COLUMN IF EXISTS onboarding_stage;
ALTER TABLE clients DROP COLUMN IF EXISTS onboarding_started_at;
ALTER TABLE clients DROP COLUMN IF EXISTS onboarding_completed_at;
ALTER TABLE clients DROP COLUMN IF EXISTS onboarding_assigned_to;

-- 4. Drop legacy audit table BEFORE the enum type (table depends on it)
DROP TABLE IF EXISTS onboarding_history;

-- 5. Drop legacy enum type (now safe, no dependents)
DROP TYPE IF EXISTS onboarding_stage;

-- Note: The index idx_clients_onboarding_stage is automatically dropped
-- when the onboarding_stage column is dropped.
