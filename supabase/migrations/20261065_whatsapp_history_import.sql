-- ════════════════════════════════════════════════════════════════════
-- Importação do histórico do WhatsApp (Evolution / QR)
--
-- Desenho: PULL paginado. O histórico que o WhatsApp entrega no
-- pareamento fica no banco da Evolution (DATABASE_SAVE_DATA_HISTORIC);
-- nós lemos de lá em páginas, no nosso ritmo, guiados por um job com
-- cursor. Nada disso fala com o WhatsApp — o único momento de exposição
-- é o pareamento em si.
--
-- Ver docs/crm/whatsapp-history-sync-plano.md.
-- ════════════════════════════════════════════════════════════════════

-- ── Marca de mensagem importada ────────────────────────────────────
-- Precisa existir ANTES do trigger abaixo, que a consulta.
ALTER TABLE crm_messages
  ADD COLUMN IF NOT EXISTS is_historical BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN crm_messages.is_historical IS
  'TRUE = veio da importação de histórico (não do fluxo ao vivo). '
  'Não conta como não-lida e permite rollback seletivo da importação.';

-- Rollback seletivo e relatórios por canal importado.
CREATE INDEX IF NOT EXISTS idx_crm_messages_historical
  ON crm_messages(thread_id) WHERE is_historical = TRUE;

-- ── Trigger da thread: duas correções ──────────────────────────────
--  (1) last_message_at só AVANÇA (GREATEST). Antes sobrescrevia com a
--      mensagem recém-inserida sem comparar data: qualquer mensagem
--      fora de ordem — o caso normal em importação, mas também um
--      reprocesso de fila — afundava a conversa na ordenação do inbox,
--      que lista por last_message_at DESC.
--  (2) mensagem histórica não incrementa unread_count. Sem isso o inbox
--      abriria com centenas de "não lidas" de meses atrás.
-- preview/direction acompanham a mensagem MAIS RECENTE, não a última
-- inserida (dentro do UPDATE, as colunas ainda têm o valor anterior).
CREATE OR REPLACE FUNCTION crm_messages_update_thread()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE crm_threads
  SET
    last_message_at = GREATEST(last_message_at, NEW.created_at),
    last_message_preview = CASE
      WHEN NEW.created_at >= last_message_at
        THEN LEFT(COALESCE(NEW.body, '[' || NEW.content_type || ']'), 200)
      ELSE last_message_preview
    END,
    last_message_direction = CASE
      WHEN NEW.created_at >= last_message_at THEN NEW.direction
      ELSE last_message_direction
    END,
    unread_count = CASE
      WHEN NEW.direction = 'inbound' AND NOT COALESCE(NEW.is_historical, FALSE)
        THEN unread_count + 1
      ELSE unread_count
    END,
    updated_at = NOW()
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Job de importação (estado retomável) ───────────────────────────
CREATE TABLE IF NOT EXISTS crm_history_import_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  channel_id UUID REFERENCES crm_channels(id) ON DELETE CASCADE NOT NULL,

  -- dry_run conta sem gravar (mede o volume antes de escrever).
  mode TEXT NOT NULL DEFAULT 'dry_run' CHECK (mode IN ('dry_run', 'import')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed')),

  -- Escopo: NULL = sem limite de data. Mídia fica de fora por padrão —
  -- é o que pesa em tempo e storage; texto resolve a busca no histórico.
  since_days INTEGER,
  include_media BOOLEAN NOT NULL DEFAULT FALSE,

  -- Cursor: lista de conversas + posição (conversa, página).
  chats JSONB NOT NULL DEFAULT '[]'::jsonb,
  chats_total INTEGER NOT NULL DEFAULT 0,
  cursor_chat_index INTEGER NOT NULL DEFAULT 0,
  cursor_page INTEGER NOT NULL DEFAULT 1,

  messages_seen INTEGER NOT NULL DEFAULT 0,
  messages_imported INTEGER NOT NULL DEFAULT 0,
  messages_skipped INTEGER NOT NULL DEFAULT 0,

  error TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  last_progress_at TIMESTAMPTZ,

  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE crm_history_import_jobs IS
  'Importação de histórico do WhatsApp por canal, retomável por cursor. '
  'O cron processa um job por vez, em páginas, com budget de tempo.';

-- Um job ativo por canal: barra clique duplo e concorrência de crons.
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_history_jobs_active_channel
  ON crm_history_import_jobs(channel_id)
  WHERE status IN ('pending', 'running');

-- Fila do cron (o mais antigo primeiro).
CREATE INDEX IF NOT EXISTS idx_crm_history_jobs_queue
  ON crm_history_import_jobs(created_at)
  WHERE status IN ('pending', 'running');

CREATE INDEX IF NOT EXISTS idx_crm_history_jobs_org
  ON crm_history_import_jobs(org_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_crm_history_jobs_updated_at ON crm_history_import_jobs;
CREATE TRIGGER trg_crm_history_jobs_updated_at
  BEFORE UPDATE ON crm_history_import_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ── Reconciliação pós-importação ───────────────────────────────────
-- O trigger já mantém last_message_at/unread corretos linha a linha.
-- Isto cobre thread que JÁ existia antes da importação e ficou com data
-- divergente, e zera não-lidas que só vieram de histórico. Roda uma vez
-- ao fim do job, escopada ao canal.
CREATE OR REPLACE FUNCTION crm_reconcile_thread_timestamps(p_channel_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE crm_threads t
  SET last_message_at = m.max_at
  FROM (
    SELECT c.thread_id, MAX(c.created_at) AS max_at
    FROM crm_messages c
    JOIN crm_threads th ON th.id = c.thread_id
    WHERE th.channel_id = p_channel_id
    GROUP BY c.thread_id
  ) m
  WHERE m.thread_id = t.id
    AND t.last_message_at IS DISTINCT FROM m.max_at;

  -- Thread cujas não-lidas vieram só de histórico volta a zero.
  UPDATE crm_threads t
  SET unread_count = 0
  WHERE t.channel_id = p_channel_id
    AND t.unread_count > 0
    AND NOT EXISTS (
      SELECT 1 FROM crm_messages c
      WHERE c.thread_id = t.id
        AND c.direction = 'inbound'
        AND c.is_historical = FALSE
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION crm_reconcile_thread_timestamps IS
  'Fecha a importação de histórico de um canal: last_message_at real por '
  'thread e zera não-lidas originadas apenas de mensagens históricas.';

-- ── RLS (permissive — multi-tenant via org_id no servidor) ─────────
ALTER TABLE crm_history_import_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "crm_history_import_jobs_authenticated" ON crm_history_import_jobs
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
