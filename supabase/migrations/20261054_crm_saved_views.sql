-- ═══════════════════════════════════════════════════════════════
-- Visões salvas do pipeline comercial
--
-- O board já tem filtros ricos (tags, responsável, status, origem,
-- motivo de perda, faixa de valor, datas) + ordenação, mas tudo se
-- perde ao recarregar: o vendedor remonta o mesmo recorte toda manhã.
-- Esta tabela guarda o recorte inteiro — filtros, ordenação, modo de
-- exibição e colunas visíveis — como uma "visão" nomeada.
--
-- Escopo: view é do usuário que criou (privada) ou da org inteira
-- (is_shared). pipeline_id NULL = vale para qualquer pipeline.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm_saved_views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- NULL = vale para todos os pipelines do escopo
  pipeline_id UUID REFERENCES pipelines(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'sales' CHECK (scope IN ('sales', 'cs', 'internal')),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  -- Snapshot do PipelineFilters do front (shape versionado pela app)
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort TEXT NOT NULL DEFAULT 'moved_desc',
  view_mode TEXT NOT NULL DEFAULT 'kanban' CHECK (view_mode IN ('kanban', 'table')),
  -- Colunas visíveis na tabela; vazio = padrão da aplicação
  columns TEXT[] NOT NULL DEFAULT '{}',
  -- Compartilhada com a org inteira (só o dono edita/apaga)
  is_shared BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Nome único por dono dentro do mesmo pipeline: evita duas "Minhas
-- prioridades" na mesma lista. COALESCE porque UNIQUE ignora NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_saved_views_unique_name
  ON crm_saved_views (
    created_by,
    COALESCE(pipeline_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(trim(name))
  );

CREATE INDEX IF NOT EXISTS idx_crm_saved_views_org
  ON crm_saved_views(org_id, scope);

CREATE INDEX IF NOT EXISTS idx_crm_saved_views_pipeline
  ON crm_saved_views(pipeline_id) WHERE pipeline_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_crm_saved_views_updated_at ON crm_saved_views;
CREATE TRIGGER trg_crm_saved_views_updated_at BEFORE UPDATE ON crm_saved_views
  FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

ALTER TABLE crm_saved_views ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "crm_saved_views_all" ON crm_saved_views
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE crm_saved_views IS
  'Recortes nomeados do board (filtros + ordenação + modo + colunas). Privados por padrão; is_shared publica para a org.';
