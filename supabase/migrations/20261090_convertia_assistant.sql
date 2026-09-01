-- ============================================================
-- ConvertIA — assistente interno via OpenRouter com conectores
-- MCP por loja, skills próprias e servidores MCP externos.
--
-- Reusa ai_chat_conversations/ai_chat_messages (20260510):
--  - o CHECK de role passa a aceitar 'system'/'tool' (o loop de
--    tool-calling grava os turns intermediários);
--  - ai_chat_messages.meta guarda fontes consultadas, modelo e uso
--    (tokens/custo) da resposta;
--  - workspace/loja/modelo da conversa viajam no context JSONB já
--    existente (sem coluna nova).
--
-- Tabelas novas:
--  - ai_skills: skills próprias (instruções injetadas no system
--    prompt quando ativas na conversa);
--  - ai_mcp_servers: servidores MCP externos (streamable HTTP) —
--    org-level (store_id NULL, ex.: Obsidian) ou por loja.
--
-- RLS: regra da casa — toda policy declara TO authenticated +
-- helper de escopo (is_org_member / can_access_store).
-- ============================================================

-- 1) Mensagens: tool turns + metadados
ALTER TABLE ai_chat_messages DROP CONSTRAINT IF EXISTS ai_chat_messages_role_check;
ALTER TABLE ai_chat_messages
  ADD CONSTRAINT ai_chat_messages_role_check
  CHECK (role IN ('user', 'assistant', 'system', 'tool'));

ALTER TABLE ai_chat_messages ADD COLUMN IF NOT EXISTS meta JSONB;

COMMENT ON COLUMN ai_chat_messages.meta IS
  'ConvertIA: { sources: [{connector,tool,label,summary}], model, usage: {tokens_input,tokens_output,cost_usd}, tool_calls }';

-- 2) Skills próprias
CREATE TABLE IF NOT EXISTS ai_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workspace TEXT NOT NULL DEFAULT 'geral'
    CHECK (workspace IN ('operacional', 'comercial', 'geral')),
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  -- Instruções injetadas no system prompt quando a skill está ativa
  instructions TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_skills_org ON ai_skills(org_id, workspace);

ALTER TABLE ai_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_skills_org_members" ON ai_skills;
CREATE POLICY "ai_skills_org_members" ON ai_skills
  FOR ALL TO authenticated
  USING (is_org_member())
  WITH CHECK (is_org_member());

-- 3) Servidores MCP externos (org-level ou por loja)
CREATE TABLE IF NOT EXISTS ai_mcp_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- NULL = servidor da organização (ex.: Obsidian); preenchido = da loja
  store_id UUID REFERENCES client_stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- Endpoint MCP streamable HTTP (JSON-RPC 2.0 via POST)
  url TEXT NOT NULL,
  -- Bearer token CRIPTOGRAFADO (AES-256-GCM, mesmo esquema das
  -- credenciais de loja) — nunca sai em GET
  auth_token TEXT,
  -- Headers extras (ex.: {"X-Api-Key": "..."}) — também sensíveis,
  -- só o backend lê
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- false = só tools anotadas como read-only (readOnlyHint) são expostas
  allow_write BOOLEAN NOT NULL DEFAULT false,
  last_status TEXT,          -- 'ok' | mensagem de erro do último teste
  last_checked_at TIMESTAMPTZ,
  tool_count INTEGER,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_mcp_servers_org ON ai_mcp_servers(org_id);
CREATE INDEX IF NOT EXISTS idx_ai_mcp_servers_store ON ai_mcp_servers(store_id) WHERE store_id IS NOT NULL;

ALTER TABLE ai_mcp_servers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_mcp_servers_org_members" ON ai_mcp_servers;
CREATE POLICY "ai_mcp_servers_org_members" ON ai_mcp_servers
  FOR ALL TO authenticated
  USING (
    is_org_member()
    AND (store_id IS NULL OR can_access_store(store_id))
  )
  WITH CHECK (
    is_org_member()
    AND (store_id IS NULL OR can_access_store(store_id))
  );

COMMENT ON TABLE ai_skills IS 'Skills próprias da ConvertIA — instruções versionáveis por workspace';
COMMENT ON TABLE ai_mcp_servers IS 'Servidores MCP externos da ConvertIA (streamable HTTP): org-level (Obsidian etc.) ou por loja';
