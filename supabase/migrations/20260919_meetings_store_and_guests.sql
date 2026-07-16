-- ===========================================
-- meetings.store_id (INT-01, faltava neste banco) + guest_emails
-- ===========================================
-- store_id: coluna esperada pelo POST /api/meetings (a migration original
-- 20260415 nao foi aplicada neste ambiente -> insert falhava com PGRST204).
-- guest_emails: convidados EXTERNOS por email (viram attendees no Google e
-- recebem o convite na propria caixa de entrada), estilo Google Calendar.
-- ===========================================

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES client_stores(id) ON DELETE SET NULL;

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS guest_emails TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_meetings_store
  ON meetings(store_id) WHERE store_id IS NOT NULL;

COMMENT ON COLUMN meetings.guest_emails IS
  'Emails de convidados externos (nao-membros). Adicionados como attendees no evento do Google para receberem o convite.';

NOTIFY pgrst, 'reload schema';
