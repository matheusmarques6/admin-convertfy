-- ============================================================
-- Epic AE: Agent Email Generation
-- Story AE-7 patch: index GIN em notifications.metadata
--
-- Motivacao: o servico de notificacao (story AE-7) consulta
-- `notifications.metadata @> {dedup_key: $key}` antes de cada
-- INSERT para garantir idempotencia em janela de 1h. Sem index,
-- a query degrada para sequential scan conforme a tabela cresce.
--
-- Partial index: apenas linhas com `dedup_key` indexadas — economiza
-- espaco e mantem latencia constante mesmo com milhoes de
-- notificacoes legadas sem o campo.
--
-- Idempotente: CREATE INDEX IF NOT EXISTS.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_notifications_dedup_key
  ON notifications USING GIN (metadata)
  WHERE metadata ? 'dedup_key';

COMMENT ON INDEX idx_notifications_dedup_key IS
  'Speeds up the dedup-key lookup used by Epic AE notify service '
  '(`metadata @> {dedup_key: ...}`). Partial: only rows that carry '
  'a dedup_key in metadata.';
