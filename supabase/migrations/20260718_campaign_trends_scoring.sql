-- ─────────────────────────────────────────────────────────────────────
-- campaign_trends: scoring + risk + categoria
--
-- Estende a tabela criada em 20260716 com os campos que o agente v2
-- devolve (categoria, potencial comercial, urgência, campaign_angle)
-- e o filtro determinístico de risco aplicado no pós-processamento.
--
-- `fetched_via` prepara a cascata da fase 2: hoje só 'web_search' e
-- 'manual' são gravados; 'trendtrack' fica reservado pra integração.
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE campaign_trends
  ADD COLUMN IF NOT EXISTS category TEXT
    CHECK (category IN ('consumo','cultural','esportivo','social','viral','outros')),
  ADD COLUMN IF NOT EXISTS commercial_potential INT
    CHECK (commercial_potential BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS urgency TEXT
    CHECK (urgency IN ('week','month','quarter')),
  ADD COLUMN IF NOT EXISTS risk_flag TEXT NOT NULL DEFAULT 'low'
    CHECK (risk_flag IN ('low','med','high')),
  ADD COLUMN IF NOT EXISTS risk_reason TEXT,
  ADD COLUMN IF NOT EXISTS campaign_angle TEXT,
  ADD COLUMN IF NOT EXISTS fetched_via TEXT NOT NULL DEFAULT 'web_search'
    CHECK (fetched_via IN ('trendtrack','web_search','manual'));

-- Índice parcial pra leitura do rail "Temas em alta" (já filtra
-- trends de alto risco do feed normal — UI mostra em outra prateleira)
CREATE INDEX IF NOT EXISTS idx_campaign_trends_country_safe
  ON campaign_trends(country, cycle_id) WHERE risk_flag != 'high';
