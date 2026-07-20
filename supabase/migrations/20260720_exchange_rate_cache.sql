-- Cache global de taxas de câmbio (1 linha só, upsert por chave).
--
-- Corrige o erro 22P02 recorrente nos logs do Postgres:
-- exchange-rate.service gravava a string "global_exchange_rates" em
-- dashboard_cache.store_id, que é UUID NOT NULL com FK para
-- client_stores(id). Tanto o SELECT quanto o UPSERT sempre falharam
-- (erro engolido pelo service) — o cache em banco nunca funcionou e
-- cada cold start refazia o fetch na API externa (open.er-api.com).
--
-- O câmbio é global (não pertence a loja nenhuma), então ganha tabela
-- própria mínima em vez de forçar a FK do dashboard_cache.
CREATE TABLE IF NOT EXISTS exchange_rate_cache (
  key TEXT PRIMARY KEY,              -- sempre 'latest' hoje; extensível
  rates JSONB NOT NULL,              -- { "USD": 0.175, "EUR": 0.161, ... } (1 BRL = X moeda)
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE exchange_rate_cache ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy para authenticated: só o service role (admin client) lê/escreve.

COMMENT ON TABLE exchange_rate_cache IS
  'Cache global de taxas de câmbio (open.er-api.com). Linha única key=latest, TTL via expires_at. Acesso só via service role.';
