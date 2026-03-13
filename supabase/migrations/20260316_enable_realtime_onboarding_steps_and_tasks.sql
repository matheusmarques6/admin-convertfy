-- Enable Supabase Realtime for client_onboarding_steps and tasks tables
-- This allows the onboarding kanban and board to auto-refresh when changes occur

-- client_onboarding_steps: onboarding kanban reacts to step status changes
ALTER PUBLICATION supabase_realtime ADD TABLE client_onboarding_steps;

-- tasks: board reacts to new tasks created by sync or manual creation
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
