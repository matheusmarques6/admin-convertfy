-- =============================================
-- PIPELINE FILE 06: FIX MEETING PARTICIPANTS RLS
-- =============================================
-- A tabela meeting_participants já existe (00002_meeting_participants.sql)
-- com colunas: id, meeting_id, user_id, role, status, responded_at, created_at
-- Este script apenas corrige as RLS policies de USING(true) para is_org_member()
-- =============================================

BEGIN;

-- Drop policies antigas com USING(true)
DROP POLICY IF EXISTS "Users can view meeting participants" ON meeting_participants;
DROP POLICY IF EXISTS "Users can manage meeting participants" ON meeting_participants;
DROP POLICY IF EXISTS "meeting_participants_select_policy" ON meeting_participants;
DROP POLICY IF EXISTS "meeting_participants_insert_policy" ON meeting_participants;
DROP POLICY IF EXISTS "meeting_participants_update_policy" ON meeting_participants;
DROP POLICY IF EXISTS "meeting_participants_delete_policy" ON meeting_participants;
DROP POLICY IF EXISTS "Service role meeting_participants" ON meeting_participants;

-- Recriar com controle de acesso
CREATE POLICY "meeting_participants_select"
  ON meeting_participants FOR SELECT TO authenticated
  USING (is_admin() OR is_org_member());

CREATE POLICY "meeting_participants_insert"
  ON meeting_participants FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "meeting_participants_update"
  ON meeting_participants FOR UPDATE TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "meeting_participants_delete"
  ON meeting_participants FOR DELETE TO authenticated
  USING (is_admin() OR is_org_member());

-- Service role full access
CREATE POLICY "Service role meeting_participants"
  ON meeting_participants FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMIT;

-- =============================================
-- 06_meeting_participants.sql DONE
-- =============================================
