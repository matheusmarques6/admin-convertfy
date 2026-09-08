-- ============================================================
-- Inbox — a fila da foto de perfil não pode travar no topo
-- ============================================================
-- O backfill (cron `crm-avatar-backfill`) pega os 20 primeiros por
-- `last_message_at DESC` e só carimba `contact_avatar_checked_at`
-- quando a origem RESPONDE. Erro do provedor (timeout, 5xx, número que
-- não existe no WhatsApp) devolvia "não tentei" e não carimbava nada —
-- então a mesma dúzia do topo voltava em toda rodada, para sempre, e as
-- conversas do fim da lista nunca eram alcançadas.
--
-- Duas peças resolvem:
--
--  1. `contact_avatar_failed_at` separa "a origem respondeu que não há
--     foto" (janela longa: 7 dias) de "a chamada falhou" (janela curta:
--     re-tenta na próxima rodada). Sem a separação, ou a falha queima
--     uma semana de espera, ou trava a fila — as duas ruins.
--
--  2. A ordem passa a ser `failed_at NULLS FIRST, checked_at NULLS
--     FIRST, last_message_at DESC`. A falha vem PRIMEIRO porque
--     carimbá-la não basta: quem falhou continua com `checked_at` nulo
--     e, ordenando só por ele, voltaria ao topo junto de quem nunca foi
--     tentado — a fila travaria do mesmo jeito.
--
-- Idempotente.
-- ============================================================

ALTER TABLE crm_threads
  ADD COLUMN IF NOT EXISTS contact_avatar_failed_at TIMESTAMPTZ;

COMMENT ON COLUMN crm_threads.contact_avatar_failed_at IS
  'Última falha ao BUSCAR a foto do contato (a origem foi chamada e errou). '
  'Distinto de contact_avatar_checked_at, que marca resposta obtida — '
  'inclusive "este contato não tem foto". Janela de re-tentativa curta.';

-- A fila é: sem foto nossa, não é comentário, fora das duas janelas.
-- Índice pela ORDEM da fila (failed_at e checked_at NULLS FIRST, depois
-- recência) para o lote não varrer a tabela inteira a cada rodada.
CREATE INDEX IF NOT EXISTS idx_crm_threads_avatar_fila
  ON crm_threads (contact_avatar_failed_at NULLS FIRST, contact_avatar_checked_at NULLS FIRST, last_message_at DESC)
  WHERE contact_external_id NOT LIKE 'comment:%';
