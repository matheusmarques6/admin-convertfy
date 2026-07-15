-- ===========================================
-- Google Calendar push notifications (watch channels)
-- ===========================================
-- Para o import Google -> admin ser INSTANTANEO (em vez de esperar o cron),
-- registramos um "watch" na agenda central da convertfy. O Google faz POST
-- no nosso webhook a cada mudanca, e o import roda na hora.
--
-- Guardamos o canal na propria linha do token org (user_type='org').
-- Canais expiram (~7 dias); um cron renova os que estao perto de vencer.
-- ===========================================

ALTER TABLE user_google_tokens
  ADD COLUMN IF NOT EXISTS calendar_channel_id TEXT,
  ADD COLUMN IF NOT EXISTS calendar_resource_id TEXT,
  ADD COLUMN IF NOT EXISTS calendar_channel_token TEXT,
  ADD COLUMN IF NOT EXISTS calendar_channel_expiration TIMESTAMPTZ;

-- Busca rapida do dono pelo channel_id (usado no webhook)
CREATE INDEX IF NOT EXISTS idx_user_google_tokens_channel
  ON user_google_tokens(calendar_channel_id)
  WHERE calendar_channel_id IS NOT NULL;

COMMENT ON COLUMN user_google_tokens.calendar_channel_id IS
  'ID do canal de push (watch) da Google Calendar API — so em rows user_type=org.';
COMMENT ON COLUMN user_google_tokens.calendar_channel_token IS
  'Token secreto ecoado pelo Google em X-Goog-Channel-Token; validado no webhook.';

NOTIFY pgrst, 'reload schema';
