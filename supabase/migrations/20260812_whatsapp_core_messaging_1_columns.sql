-- ============================================================
-- WhatsApp — Núcleo de atendimento · PARTE 1/3: colunas
--
-- Só os locks pesados (AccessExclusiveLock), numa transação curta.
-- Aplicar como um "Run" isolado no SQL editor; depois a parte 2 e 3.
--
-- ORDEM DE LOCK IGUAL À DA APLICAÇÃO: crm_messages ANTES de
-- crm_threads. Todo INSERT em crm_messages dispara o trigger
-- trg_crm_messages_update_thread que atualiza crm_threads — travar
-- na ordem inversa (threads→messages) deadlocka contra o webhook
-- (foi exatamente o 40P01 na primeira tentativa de aplicação).
--
-- lock_timeout: se houver tráfego segurando lock, falha rápido
-- (55P03) em vez de enfileirar/deadlockar — basta reaplicar.
-- Idempotente: rodável mais de uma vez.
-- ============================================================

SET lock_timeout = '10s';
SET statement_timeout = '60s';

-- ── crm_messages: mídia (PRIMEIRO — ver nota de ordem acima) ───────
ALTER TABLE crm_messages
  ADD COLUMN IF NOT EXISTS media_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS media_filename TEXT,
  ADD COLUMN IF NOT EXISTS media_size INTEGER;

-- ── crm_threads: janela de 24h ─────────────────────────────────────
ALTER TABLE crm_threads
  ADD COLUMN IF NOT EXISTS is_window_open BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS window_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_customer_message_at TIMESTAMPTZ;

-- Índice parcial pro cron de fechamento (rápido — o lock exclusivo
-- de crm_threads já é nosso neste ponto da transação)
CREATE INDEX IF NOT EXISTS idx_crm_threads_open_window
  ON crm_threads (window_expires_at)
  WHERE is_window_open = TRUE;
