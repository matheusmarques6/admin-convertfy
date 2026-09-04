-- ============================================================
-- ConvertIA v3 (set/2026) — motor do chat:
--
--  1) ai_chat_message_progress(): merge de `meta` + content numa
--     única UPDATE. A persistência parcial (a cada 2,5 s) e as flags
--     escritas por OUTRAS requisições (cancel_requested pelo botão
--     Parar, pending_confirmation resolvida pelo Confirmar) disputam a
--     mesma coluna JSONB — um UPDATE com o objeto inteiro apagaria a
--     flag que acabou de ser gravada. Merge (||) no banco resolve.
--  2) ai_mcp_servers.tools_cache/tools_cached_at: lista de tools do
--     servidor MCP guardada — o chat não faz mais tools/list a cada
--     mensagem (latência + dependência do MCP para a conversa começar).
--  3) ai_chat_jobs: continuação de um turno cujo orçamento de tempo
--     acabou (280 s) — o cron retoma o loop de tools de onde parou.
--  4) ai_memories: memória entre conversas, por loja ou org, proposta
--     pela IA e APROVADA por humano antes de entrar no prompt.
--  5) ai_eval_cases / ai_eval_runs: conjunto de avaliação (perguntas
--     reais dos 👍) rodado periodicamente em mais de um modelo com
--     rubrica — decidir modelo/prompt com dado, não no feeling.
--
-- RLS: regra da casa — toda policy declara TO authenticated + helper
-- de escopo. Escrita nas tabelas de job/eval é só do service role.
-- ============================================================

-- 1) Merge de meta na mensagem ---------------------------------------
CREATE OR REPLACE FUNCTION ai_chat_message_progress(
  p_id UUID,
  p_content TEXT,
  p_meta_patch JSONB
) RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE ai_chat_messages
  SET content = COALESCE(p_content, content),
      meta = COALESCE(meta, '{}'::jsonb) || COALESCE(p_meta_patch, '{}'::jsonb)
  WHERE id = p_id;
$$;

REVOKE ALL ON FUNCTION ai_chat_message_progress(UUID, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION ai_chat_message_progress(UUID, TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION ai_chat_message_progress(UUID, TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION ai_chat_message_progress(UUID, TEXT, JSONB) TO service_role;

COMMENT ON FUNCTION ai_chat_message_progress(UUID, TEXT, JSONB) IS
  'ConvertIA: atualiza content e faz MERGE (||) em meta — nunca sobrescreve flags gravadas por outra requisição (cancel_requested, pending_confirmation).';

-- 2) Cache da lista de tools do MCP ----------------------------------
ALTER TABLE ai_mcp_servers ADD COLUMN IF NOT EXISTS tools_cache JSONB;
ALTER TABLE ai_mcp_servers ADD COLUMN IF NOT EXISTS tools_cached_at TIMESTAMPTZ;

COMMENT ON COLUMN ai_mcp_servers.tools_cache IS
  'ConvertIA: lista crua de tools/list ([{name,description,inputSchema,readOnly,destructive}]) — o chat lê daqui; refresh no botão Testar, no cron horário e em background quando passa de 6h.';

-- 3) Continuação de turno em job -------------------------------------
CREATE TABLE IF NOT EXISTS ai_chat_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_chat_conversations(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES ai_chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'done', 'failed')),
  -- Estado serializado do loop (mensagens, rodada, conectores, telemetria)
  payload JSONB NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  claimed_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_jobs_pending
  ON ai_chat_jobs(status, created_at)
  WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS idx_ai_chat_jobs_message ON ai_chat_jobs(message_id);

ALTER TABLE ai_chat_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_chat_jobs_owner_read" ON ai_chat_jobs;
CREATE POLICY "ai_chat_jobs_owner_read" ON ai_chat_jobs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
-- INSERT/UPDATE/DELETE: só o service role (sem policy = negado)

COMMENT ON TABLE ai_chat_jobs IS
  'ConvertIA: turnos que estouraram o orçamento de tempo da rota e continuam pelo cron /api/cron/convertia-continue.';

-- 4) Memórias entre conversas ----------------------------------------
CREATE TABLE IF NOT EXISTS ai_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- NULL = memória da organização; preenchido = anexada à loja
  store_id UUID REFERENCES client_stores(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 3 AND 600),
  kind TEXT NOT NULL DEFAULT 'fato'
    CHECK (kind IN ('fato', 'preferencia', 'decisao', 'aviso')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  source TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'human')),
  source_conversation_id UUID REFERENCES ai_chat_conversations(id) ON DELETE SET NULL,
  source_message_id UUID REFERENCES ai_chat_messages(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_memories_scope
  ON ai_memories(org_id, store_id, status, created_at DESC);

ALTER TABLE ai_memories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_memories_org_members" ON ai_memories;
CREATE POLICY "ai_memories_org_members" ON ai_memories
  FOR ALL TO authenticated
  USING (is_org_member() AND (store_id IS NULL OR can_access_store(store_id)))
  WITH CHECK (is_org_member() AND (store_id IS NULL OR can_access_store(store_id)));

COMMENT ON TABLE ai_memories IS
  'ConvertIA: fatos/preferências/decisões lembrados entre conversas — propostos pela IA (source=ai, status=pending) e aprovados por humano antes de entrar no prompt.';

-- 5) Conjunto de avaliação -------------------------------------------
CREATE TABLE IF NOT EXISTS ai_eval_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL CHECK (char_length(prompt) BETWEEN 5 AND 8000),
  prompt_hash TEXT GENERATED ALWAYS AS (md5(lower(btrim(prompt)))) STORED,
  workspace TEXT NOT NULL DEFAULT 'operacional'
    CHECK (workspace IN ('operacional', 'comercial')),
  store_id UUID REFERENCES client_stores(id) ON DELETE SET NULL,
  connectors TEXT[] NOT NULL DEFAULT '{}',
  -- O que uma resposta boa precisa ter (o juiz lê)
  expectations TEXT,
  source_message_id UUID REFERENCES ai_chat_messages(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, prompt_hash)
);

CREATE TABLE IF NOT EXISTS ai_eval_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES ai_eval_cases(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'error')),
  response TEXT,
  -- Nota 0–10 do juiz e a rubrica detalhada
  score NUMERIC(4, 1),
  rubric JSONB,
  judge_model TEXT,
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  cost_cents NUMERIC(12, 4) NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  tool_calls INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_eval_runs_batch ON ai_eval_runs(batch_id);
CREATE INDEX IF NOT EXISTS idx_ai_eval_runs_case ON ai_eval_runs(case_id, created_at DESC);

ALTER TABLE ai_eval_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_eval_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_eval_cases_org_members" ON ai_eval_cases;
CREATE POLICY "ai_eval_cases_org_members" ON ai_eval_cases
  FOR ALL TO authenticated
  USING (is_org_member())
  WITH CHECK (is_org_member());

DROP POLICY IF EXISTS "ai_eval_runs_org_members_read" ON ai_eval_runs;
CREATE POLICY "ai_eval_runs_org_members_read" ON ai_eval_runs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ai_eval_cases c
      WHERE c.id = ai_eval_runs.case_id AND is_org_member()
    )
  );
-- runs: escrita só pelo service role (cron)

COMMENT ON TABLE ai_eval_cases IS
  'ConvertIA: perguntas reais (dos 👍) usadas para avaliar modelos/prompt periodicamente.';
COMMENT ON TABLE ai_eval_runs IS
  'ConvertIA: uma execução de um caso em um modelo, com nota do juiz e custo.';
