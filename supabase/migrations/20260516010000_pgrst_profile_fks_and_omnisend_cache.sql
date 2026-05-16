-- Fix PGRST200 errors quando PostgREST tenta inferir relationship entre
-- store_activity / client_monthly_reports e profiles. As FKs apontavam
-- pra auth.users(id), e PostgREST nao consegue navegar via essa cadeia
-- automaticamente. Como profiles.id é 1:1 com auth.users.id (FK CASCADE),
-- re-apontar diretamente pra profiles preserva integridade e destrava
-- joins do tipo `author:profiles!store_activity_author_user_id_fkey(...)`.

-- store_activity.author_user_id
ALTER TABLE store_activity DROP CONSTRAINT IF EXISTS store_activity_author_user_id_fkey;
ALTER TABLE store_activity
  ADD CONSTRAINT store_activity_author_user_id_fkey
  FOREIGN KEY (author_user_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- client_monthly_reports.generated_by
ALTER TABLE client_monthly_reports DROP CONSTRAINT IF EXISTS client_monthly_reports_generated_by_fkey;
ALTER TABLE client_monthly_reports
  ADD CONSTRAINT client_monthly_reports_generated_by_fkey
  FOREIGN KEY (generated_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- Re-cria tabela omnisend_reports_cache caso esteja faltando no ambiente
-- (mantém compat com supabase/migrations/20260429_omnisend_reports_cache.sql
-- pra ambientes que ja aplicaram).
CREATE TABLE IF NOT EXISTS omnisend_reports_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT NOT NULL UNIQUE,
  data JSONB NOT NULL,
  fresh_until TIMESTAMPTZ NOT NULL,
  stale_until TIMESTAMPTZ NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_omnisend_reports_cache_key
  ON omnisend_reports_cache(cache_key);

CREATE INDEX IF NOT EXISTS idx_omnisend_reports_cache_stale_until
  ON omnisend_reports_cache(stale_until);

ALTER TABLE omnisend_reports_cache ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'omnisend_reports_cache'
      AND policyname = 'Block all client access to omnisend_reports_cache'
  ) THEN
    CREATE POLICY "Block all client access to omnisend_reports_cache"
      ON omnisend_reports_cache
      FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;
