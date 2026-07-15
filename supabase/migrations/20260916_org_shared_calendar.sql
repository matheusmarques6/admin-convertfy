-- ===========================================
-- Conta Google compartilhada da organizacao ("convertfy")
-- ===========================================
-- Introduz um novo user_type = 'org' em user_google_tokens, onde
-- user_id = org_id. Assim uma organizacao tem UMA conta Google central
-- (a "convertfy") que concentra todas as reunioes de clientes, reusando
-- toda a maquina existente (saveTokens/getValidAccessToken/refresh/cripto).
--
-- Tambem adiciona calendar_sync_token para o sync incremental bidirecional
-- (Google -> admin) via nextSyncToken da Calendar API.
-- ===========================================

-- 1. Permitir user_type = 'org' (mantendo os existentes)
ALTER TABLE user_google_tokens
  DROP CONSTRAINT IF EXISTS user_google_tokens_user_type_check;

ALTER TABLE user_google_tokens
  ADD CONSTRAINT user_google_tokens_user_type_check
  CHECK (user_type IN ('profile', 'portal_user', 'org'));

-- 2. Token de sync incremental (armazena o nextSyncToken da agenda central)
ALTER TABLE user_google_tokens
  ADD COLUMN IF NOT EXISTS calendar_sync_token TEXT;

COMMENT ON COLUMN user_google_tokens.calendar_sync_token IS
  'nextSyncToken da Google Calendar API para import incremental (so usado em rows user_type=org, a agenda central da convertfy).';

COMMENT ON COLUMN user_google_tokens.user_type IS
  'profile = admin (profiles.id = auth.uid); portal_user = usuario do portal; org = conta Google compartilhada da organizacao (user_id = org_id), a agenda central "convertfy".';

-- 3. Reload do schema cache do PostgREST
NOTIFY pgrst, 'reload schema';
