-- Enable Supabase Realtime for client_onboardings table
-- This allows the onboarding kanban board to auto-refresh when phases change
ALTER PUBLICATION supabase_realtime ADD TABLE client_onboardings;
