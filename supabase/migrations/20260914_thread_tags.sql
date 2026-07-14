-- ============================================================
-- Tags personalizadas nas conversas do Inbox
--
-- 1) crm_threads.tags TEXT[] — mesmo padrão vivo de deals.tags /
--    crm_leads.tags (array de NOMES; cor resolvida pela registry
--    global `tags` na UI). Índice GIN para o filtro ?tag= da lista.
--
-- 2) Saneamento idempotente da registry `tags`: as rotas
--    /api/crm/tags já usam org_id/created_by e entity 'lead', mas as
--    migrations commitadas nunca criaram essas colunas/valor (foram
--    aplicadas direto em prod). Aqui viram no-op onde já existem.
--
-- ATENÇÃO: ALTER TYPE ... ADD VALUE não pode rodar dentro de
-- transação em versões antigas do Postgres — se o SQL editor
-- reclamar, rode o bloco 3 como um "Run" separado.
-- ============================================================

-- 1) Tags na conversa
ALTER TABLE crm_threads ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_crm_threads_tags ON crm_threads USING GIN (tags);

-- 2) Registry `tags`: colunas usadas pelas rotas (idempotente)
ALTER TABLE tags ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE tags ADD COLUMN IF NOT EXISTS created_by UUID;

-- 3) Enum entity_type: valor 'lead' usado pelas rotas (idempotente)
ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'lead';
