-- ═══════════════════════════════════════════════════════════════
-- DIAGNÓSTICO — por que /admin/comercial/funil deu erro?
--
-- As migrations do funil já estão aplicadas, então a causa é outra.
-- Este script confere TODAS as colunas e tabelas que a rota
-- /api/crm/funnel consulta, não só as do funil. Só LÊ o catálogo.
--
-- Qualquer linha com "FALTA" é candidata a causa do erro.
-- ═══════════════════════════════════════════════════════════════

WITH checagem(tabela, coluna, obrigatorio) AS (
  VALUES
    -- Pipelines e etapas
    ('pipelines',                    'scope',              true),
    ('pipelines',                    'is_archived',        true),
    ('pipeline_stages',              'order',              true),
    ('pipeline_stages',              'stage_type',         true),
    ('pipeline_stages',              'funnel_step',        true),
    -- Deals
    ('deals',                        'status',             true),
    ('deals',                        'won_at',             true),
    ('deals',                        'utm',                true),
    ('deals',                        'lead_id',            true),
    ('deals',                        'client_id',          true),
    ('deals',                        'store_id',           true),
    ('deals',                        'cash_collected',     true),
    -- Histórico de etapa (contagem do funil)
    ('crm_deal_history',             'field',              true),
    ('crm_deal_history',             'new_value',          true),
    ('crm_deal_history',             'old_value',          true),
    ('crm_deal_history',             'changed_at',         true),
    -- Leads (topo do funil) — org_id NAO tem migration no repo
    ('crm_leads',                    'scope',              true),
    ('crm_leads',                    'utm',                true),
    ('crm_leads',                    'org_id',             true),
    -- Multi-tenant
    ('org_members',                  'profile_id',         true),
    ('org_members',                  'is_active',          true),
    -- Investimento e anúncios
    ('crm_ad_spend',                 'org_id',             true),
    ('crm_ad_spend',                 'source',             true),
    ('crm_ad_accounts',              'access_token',       true),
    ('crm_ad_insights',              'level',              true),
    ('crm_ad_insights',              'ad_name',            true),
    -- Cash collect e ponte com onboarding
    ('unified_invoices',             'payment_date',       true),
    ('unified_invoices',             'source',             true),
    ('onboardings',                  'source_deal_id',     true),
    ('onboardings',                  'current_column_id',  true),
    ('operational_pipeline_columns', 'name',               true),
    ('clients',                      'name',               true)
)
SELECT
  c.tabela || '.' || c.coluna AS item,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns ic
      WHERE ic.table_schema = 'public'
        AND ic.table_name = c.tabela
        AND ic.column_name = c.coluna
    ) THEN 'OK'
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables it
      WHERE it.table_schema = 'public' AND it.table_name = c.tabela
    ) THEN 'FALTA (tabela inexistente)'
    ELSE 'FALTA'
  END AS situacao
FROM checagem c
ORDER BY
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns ic
      WHERE ic.table_schema = 'public'
        AND ic.table_name = c.tabela
        AND ic.column_name = c.coluna
    ) THEN 2 ELSE 1
  END,
  c.tabela, c.coluna;


-- ── Etapas mapeadas no funil ─────────────────────────────────────
-- Sem mapeamento, MQL/Agendamento/Reunião contam zero (não é erro,
-- mas explica funil "vazio no meio").
SELECT
  p.name AS pipeline,
  ps.name AS etapa,
  ps.stage_type,
  COALESCE(ps.funnel_step, '— fora do funil') AS etapa_do_funil
FROM pipeline_stages ps
JOIN pipelines p ON p.id = ps.pipeline_id
WHERE p.scope = 'sales' AND p.is_archived = false
ORDER BY p.name, ps."order";
