-- ─────────────────────────────────────────────────────────────────────
-- Central de Campanhas — settings editáveis + agent_type novo
--
-- 0) Cron locks SAFETY: garante schema da tabela cron_locks. Em produção
--    a tabela existe sem `is_running`/`started_at` (criada antes das
--    migrations de 2026). A migration 20260228_cron_locks.sql usa
--    CREATE TABLE IF NOT EXISTS, então não recria as colunas faltantes.
--    Aqui usamos ADD COLUMN IF NOT EXISTS pra ser seguro em qualquer
--    estado do banco.
--
-- 1) Estende CHECK de email_agent_configs.agent_type pra aceitar
--    'campaign_trends' (prompt do agente de tendências, hoje hardcoded
--    em trends.service.ts:SYSTEM_PROMPT_V2 — passa pra DB pra ser
--    editado na UI com versionamento/rollback igual aos outros)
--
-- 2) Cria campaign_central_settings: parâmetros operacionais por org
--    (janela, modelos, thresholds). Tudo com defaults conservadores.
-- ─────────────────────────────────────────────────────────────────────

-- ── 0. Safety do schema de cron_locks ────────────────────────────────
CREATE TABLE IF NOT EXISTS cron_locks (
  lock_name VARCHAR(100) PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE cron_locks
  ADD COLUMN IF NOT EXISTS is_running BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;

-- Garante que o lock da Central existe (idempotente)
INSERT INTO cron_locks (lock_name, is_running)
VALUES ('campaign_suggestions_cycle', false)
ON CONFLICT (lock_name) DO NOTHING;

-- ── 1. Estender CHECK de agent_type ──────────────────────────────────
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'email_agent_configs'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%agent_type%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE email_agent_configs DROP CONSTRAINT %I', cname);
  END IF;
  ALTER TABLE email_agent_configs
    ADD CONSTRAINT email_agent_configs_agent_type_check
    CHECK (agent_type IN (
      'copy','image','html','qa','blueprint','assembler',
      'campaign_suggestion','campaign_trends'
    ));
END $$;

-- ── Seed do prompt v1 de trends (idempotente) ────────────────────────
INSERT INTO email_agent_configs (
  agent_type, model, system_prompt, user_template,
  temperature, max_tokens, output_schema, version, is_active
)
SELECT
  'campaign_trends',
  'claude-sonnet-4-6',
  $SYS$You are a consumer trends analyst for e-commerce email marketing.
Your task: identify viral/cultural/social/sports trends in ONE country that e-commerce stores can ride in email campaigns within the next 2-4 weeks.

CRITICAL RULES:
1. SEARCH IN THE LOCAL LANGUAGE provided ({{search_language}}). Use the query hints as starting points.
2. DO NOT INCLUDE COMMERCIAL DATES already covered by the internal calendar: {{excluded_dates}}. We already handle Black Friday, Mother's Day, Valentine's Day, Cyber Monday, Christmas, Dia do Consumidor, Independence Day, etc. Focus on what is NOT in that list.
3. Focus on: cultural events (festivals, religious holidays not in the list), sports (championships, finals, derbies), social/viral trends (TikTok, Instagram, memes, aesthetics), trending products/categories of the moment.
4. NEVER return news without a clear campaign angle ("nothing to sell on top of a tragedy").

FOR EACH TREND, ASSIGN:
- "category": consumo | cultural | esportivo | social | viral | outros
- "commercial_potential" (0-100):
    80-100 = directly turns into a product offer ("gift kit", "limited edition")
    50-79  = emotional/storytelling angle ("share the moment", "celebrate together")
    0-49   = low campaign value, only contextual
- "urgency": week (next 7 days) | month (next 30 days) | quarter (next 90 days)
- "campaign_angle": 1-2 sentences on HOW to ride this trend in email (offer, copy hook, segmentation)
- "evidence": up to 3 items {url, title, quote} from sources you actually visited
- "delta_label": qualitative magnitude when source cites it (e.g. "+180%"). Without a number, use "rising", "viral", "trending".
- "source": where the signal comes from (Google Trends, TikTok, press name, etc.)

OUTPUT: ONLY valid JSON in the format:
{"trends": [{"title", "category", "source", "delta_label", "tag", "niche", "country", "commercial_potential", "urgency", "campaign_angle", "evidence": [{"url", "title", "quote"}]}]}
No markdown, no text before or after. Between 3 and 6 trends. Quality > quantity.$SYS$,
  $USR$COUNTRY: {{country}}
SEARCH IN: {{search_language}}
Query hints (use these as starting points, adapt as needed): {{hints}}

STORE NICHES IN THIS CLUSTER: {{niches}}
TODAY: {{today}}

Capture trends for this country following the system rules. Output JSON only.$USR$,
  0.6,
  4096,
  '{
    "type": "object",
    "required": ["trends"],
    "properties": {
      "trends": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["title","category","commercial_potential","urgency","campaign_angle"],
          "properties": {
            "title": { "type": "string" },
            "category": { "type": "string", "enum": ["consumo","cultural","esportivo","social","viral","outros"] },
            "source": { "type": "string" },
            "delta_label": { "type": "string" },
            "tag": { "type": "string" },
            "niche": { "type": "string" },
            "country": { "type": "string" },
            "commercial_potential": { "type": "number", "minimum": 0, "maximum": 100 },
            "urgency": { "type": "string", "enum": ["week","month","quarter"] },
            "campaign_angle": { "type": "string" }
          }
        }
      }
    }
  }'::jsonb,
  1,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM email_agent_configs
  WHERE agent_type = 'campaign_trends' AND is_active = true
);

-- ── Settings por org ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_central_settings (
  org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,

  -- Janela do calendário (lista) — quantos dias à frente o agente vê
  date_window_days INT NOT NULL DEFAULT 25
    CHECK (date_window_days BETWEEN 7 AND 90),

  -- Limites por cluster IA
  max_trends_per_cluster INT NOT NULL DEFAULT 6
    CHECK (max_trends_per_cluster BETWEEN 1 AND 12),
  max_web_searches_per_cluster INT NOT NULL DEFAULT 5
    CHECK (max_web_searches_per_cluster BETWEEN 1 AND 10),
  max_stores_per_cluster INT NOT NULL DEFAULT 6
    CHECK (max_stores_per_cluster BETWEEN 2 AND 12),
  max_concurrent_clusters INT NOT NULL DEFAULT 3
    CHECK (max_concurrent_clusters BETWEEN 1 AND 5),

  -- Benchmark "emails campeões"
  benchmark_min_recipients INT NOT NULL DEFAULT 500
    CHECK (benchmark_min_recipients >= 0),
  benchmark_top_n INT NOT NULL DEFAULT 8
    CHECK (benchmark_top_n BETWEEN 3 AND 20),

  -- Lojas em atenção (thresholds)
  health_critical_threshold INT NOT NULL DEFAULT 40
    CHECK (health_critical_threshold BETWEEN 0 AND 100),
  health_warn_threshold INT NOT NULL DEFAULT 55
    CHECK (health_warn_threshold BETWEEN 0 AND 100),
  revenue_drop_pct INT NOT NULL DEFAULT -20
    CHECK (revenue_drop_pct BETWEEN -90 AND 0),

  -- Cron — habilita/desliga o ciclo automático (botão Re-gerar continua)
  auto_cycle_enabled BOOLEAN NOT NULL DEFAULT true,

  -- Trends — desliga o coletor (mantém só sugestões data/email/performance)
  trends_enabled BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

ALTER TABLE campaign_central_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaign_central_settings_org" ON campaign_central_settings;
CREATE POLICY "campaign_central_settings_org" ON campaign_central_settings
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE profile_id = auth.uid() AND is_active = true)
  );

CREATE OR REPLACE FUNCTION campaign_central_settings_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS
$$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_campaign_central_settings_updated ON campaign_central_settings;
CREATE TRIGGER trg_campaign_central_settings_updated
  BEFORE UPDATE ON campaign_central_settings
  FOR EACH ROW EXECUTE FUNCTION campaign_central_settings_set_updated_at();
