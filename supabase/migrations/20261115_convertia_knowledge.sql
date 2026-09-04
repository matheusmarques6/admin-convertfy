-- ============================================================
-- ConvertIA — base de conhecimento do Obsidian (set/2026)
--
-- Segunda pasta do vault (VAULT_KNOWLEDGE_BASE_PATH, default
-- "Admin Convertfy/Conhecimento") sincronizada do GitHub para cá com o
-- que faz o Obsidian valer: título, pasta, tags, LINKS de saída
-- (wikilinks resolvidos por nome) — backlinks são a consulta inversa —
-- e embedding para busca semântica (pgvector; OpenAI
-- text-embedding-3-small, 1536 dims). Sem OPENAI_API_KEY a busca
-- degrada para full-text em português (coluna `search`).
--
-- Só nota com `status: aprovado` (ou aprovada/approved) fica ativa —
-- rascunho nunca chega ao modelo. Advisors = notas da pasta de
-- advisors (VAULT_KNOWLEDGE_ADVISORS_FOLDER, default "Advisors") ou
-- com `tipo: advisor`: viram personas selecionáveis no composer.
--
-- Escopo: o vault é um por instalação (mesmo modelo do vault de
-- emails) — leitura para qualquer membro autenticado da org; escrita
-- só pelo service role (sync).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS ai_knowledge_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- caminho relativo à base, ex.: "Advisors/Max Sutherland.md"
  path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  folder TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'nota' CHECK (kind IN ('nota', 'advisor')),
  status TEXT NOT NULL DEFAULT 'pendente',
  is_active BOOLEAN NOT NULL DEFAULT false,
  frontmatter JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags TEXT[] NOT NULL DEFAULT '{}',
  -- alvos dos wikilinks, normalizados (minúsculas, sem acento)
  links TEXT[] NOT NULL DEFAULT '{}',
  aliases TEXT[] NOT NULL DEFAULT '{}',
  body_md TEXT NOT NULL,
  excerpt TEXT,
  word_count INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT,
  embedding vector(1536),
  embedding_model TEXT,
  embedded_at TIMESTAMPTZ,
  -- Sem as tags aqui: array_to_string é STABLE e coluna gerada exige
  -- IMMUTABLE (o GIN em `tags` cobre a busca por tag). Tags inline
  -- (#tag) já estão no corpo.
  search TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese'::regconfig, coalesce(title, '')), 'A') ||
    setweight(to_tsvector('portuguese'::regconfig, coalesce(left(body_md, 20000), '')), 'C')
  ) STORED,
  synced_commit_sha TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_notes_search ON ai_knowledge_notes USING GIN (search);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_notes_tags ON ai_knowledge_notes USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_notes_links ON ai_knowledge_notes USING GIN (links);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_notes_active ON ai_knowledge_notes (is_active, kind, folder);
-- HNSW funciona com tabela vazia (ivfflat precisaria de dados para treinar)
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_notes_embedding
  ON ai_knowledge_notes USING hnsw (embedding vector_cosine_ops);

ALTER TABLE ai_knowledge_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_knowledge_notes_org_read" ON ai_knowledge_notes;
CREATE POLICY "ai_knowledge_notes_org_read" ON ai_knowledge_notes
  FOR SELECT TO authenticated
  USING (is_org_member());
-- escrita: só service role (sync)

CREATE TABLE IF NOT EXISTS ai_knowledge_sync_state (
  id TEXT PRIMARY KEY DEFAULT 'default',
  repo TEXT,
  branch TEXT,
  base_path TEXT,
  last_commit_sha TEXT,
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  notes_total INTEGER NOT NULL DEFAULT 0,
  notes_active INTEGER NOT NULL DEFAULT 0,
  embedded_total INTEGER NOT NULL DEFAULT 0,
  skipped JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_knowledge_sync_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_knowledge_sync_state_org_read" ON ai_knowledge_sync_state;
CREATE POLICY "ai_knowledge_sync_state_org_read" ON ai_knowledge_sync_state
  FOR SELECT TO authenticated
  USING (is_org_member());

-- Busca semântica (cosseno). Só notas ativas; `folder_prefix` restringe
-- a uma pasta ("Advisors", "Popups/…").
CREATE OR REPLACE FUNCTION ai_knowledge_search(
  query_embedding vector(1536),
  match_count INTEGER DEFAULT 8,
  folder_prefix TEXT DEFAULT NULL
) RETURNS TABLE (
  id UUID,
  path TEXT,
  title TEXT,
  folder TEXT,
  kind TEXT,
  tags TEXT[],
  excerpt TEXT,
  similarity DOUBLE PRECISION
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT n.id, n.path, n.title, n.folder, n.kind, n.tags, n.excerpt,
         1 - (n.embedding <=> query_embedding) AS similarity
  FROM ai_knowledge_notes n
  WHERE n.is_active
    AND n.embedding IS NOT NULL
    AND (folder_prefix IS NULL OR n.folder = folder_prefix OR n.folder LIKE folder_prefix || '/%')
  ORDER BY n.embedding <=> query_embedding
  LIMIT GREATEST(1, LEAST(match_count, 50));
$$;

REVOKE ALL ON FUNCTION ai_knowledge_search(vector, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION ai_knowledge_search(vector, INTEGER, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION ai_knowledge_search(vector, INTEGER, TEXT) TO authenticated, service_role;

COMMENT ON TABLE ai_knowledge_notes IS
  'ConvertIA: notas do Obsidian (pasta de conhecimento) com grafo (links/backlinks/tags) e embedding — só status aprovado entra no chat.';
