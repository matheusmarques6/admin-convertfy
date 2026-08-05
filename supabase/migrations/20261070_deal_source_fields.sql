-- =============================================================
-- 20261070 — Colunas de origem detalhada do negócio
--
-- O NewDealDialog já ENVIA source_type ("indicacao", "meta_ads"...) e
-- source_referrer ("quem indicou" — ex.: Luan) e o POST /api/crm/deals
-- já os aceita — mas as colunas nunca existiram em migration: o dado se
-- perdia no insert e a rota de duplicar precisou de retry pra não
-- quebrar no SELECT. Esta migration materializa as colunas e destrava a
-- EDIÇÃO da origem no drawer (pedido: "o lead veio do Luan e não do
-- Carlos, não consigo editar").
--
-- deals.source (TEXT) segue como está — é a origem exibida; source_type
-- guarda o valor canônico e source_referrer a pessoa/parceiro.
--
-- Idempotente — pode rodar mais de uma vez.
-- =============================================================

ALTER TABLE deals ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS source_referrer TEXT;

COMMENT ON COLUMN deals.source_type IS
  'Origem canônica (indicacao, meta_ads, google_ads...) — vocabulário em crm-sources.ts';
COMMENT ON COLUMN deals.source_referrer IS
  'Quem indicou/trouxe o negócio (pessoa ou parceiro) quando a origem é indicação';

-- Verificação: deve retornar 2 linhas
SELECT column_name AS ok
FROM information_schema.columns
WHERE table_name = 'deals'
  AND column_name IN ('source_type', 'source_referrer')
ORDER BY column_name;
