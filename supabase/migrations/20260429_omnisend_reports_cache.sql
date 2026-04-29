-- Migration: Omnisend Reports cache (persistent, survives cold starts)
-- Data: 2026-04-29
--
-- Por que: o cache em memoria do fetchOmnisendReports (Map<key, entry>)
-- perde entre cold starts da Lambda no Vercel. Em producao, isso significa
-- que cada nova instancia faz uma chamada fresh ao /api/analytics/reports
-- — queimando o rate limit agressivo da API (cooldowns de ate 30min
-- observados em discovery rounds).
--
-- Solucao: cache em 2 camadas
--   L1 — Map em memoria (fast-path, ~1ms)
--   L2 — esta tabela Supabase (persistent, ~50ms)
--
-- Quando a chamada API e bem-sucedida, popula AMBOS os niveis.
-- Quando falha, serve do L2 stale (ate 24h) antes de zerar revenue.
--
-- TTLs:
--   fresh_until  — 1h apos fetch bem-sucedido (cache fresco, retorna direto)
--   stale_until  — 24h apos fetch (servido em fallback se API falhar)
--
-- Cleanup: rows com stale_until < now() podem ser deletadas (cleanup job
-- ou TTL trigger). Sem cleanup automatico ainda — tabela cresce no
-- maximo ~N stores * N periodos por dia, ~ alguns MB/mes. Aceitavel.

CREATE TABLE IF NOT EXISTS omnisend_reports_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Chave composta: "<apiKeySuffix>|<isoFromDate>|<isoToDate>"
  -- apiKeySuffix = ultimos 12 chars da API key (nao expoe secret completo)
  cache_key TEXT NOT NULL UNIQUE,

  -- Payload completo: OmnisendReportsResult em JSON
  -- (attributedRevenue, attributedOrders, sent, opened, clicked, etc)
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

COMMENT ON TABLE omnisend_reports_cache IS
  'Cache persistent (L2) para POST /api/analytics/reports da Omnisend. Sobrevive a cold starts. fresh_until=1h, stale_until=24h.';

COMMENT ON COLUMN omnisend_reports_cache.cache_key IS
  'Formato: "<apiKeySuffix>|<isoFrom>|<isoTo>". apiKeySuffix = .slice(-12) da API key (nao expoe o token completo).';

COMMENT ON COLUMN omnisend_reports_cache.data IS
  'OmnisendReportsResult: { attributedRevenue, attributedOrders, attributedOrdersUnique, attributedRevenuePerOrder, attributedRevenuePerSent, sent, opened, openedUnique, openRate, clicked, clickedUnique, clickRate, failed }';

-- RLS: tabela e acessada APENAS via service_role do backend (cron + sync).
-- Nao ha leitura via cliente. Bloqueamos qualquer policy de RLS por
-- consistencia com outras tabelas de cache.
ALTER TABLE omnisend_reports_cache ENABLE ROW LEVEL SECURITY;

-- Negar tudo por padrao — service_role bypassa RLS automaticamente
CREATE POLICY "Block all client access to omnisend_reports_cache"
  ON omnisend_reports_cache
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- Trigger: atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_omnisend_reports_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_omnisend_reports_cache_updated_at
  BEFORE UPDATE ON omnisend_reports_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_omnisend_reports_cache_updated_at();
