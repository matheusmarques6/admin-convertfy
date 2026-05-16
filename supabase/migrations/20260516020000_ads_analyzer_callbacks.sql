-- Suporte aos callbacks do workflow n8n "Analisador de ADS"
--
-- 1) store_top_products: Top produtos coletados via TrendTrack (nova tabela)
-- 2) client_competitors: coluna `source` para distinguir concorrentes vindos do
--    n8n dos manuais, garantindo idempotência sem destruir entradas manuais.

-- ============================================================
-- 1) store_top_products
-- ============================================================
CREATE TABLE IF NOT EXISTS store_top_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 50),
  title TEXT NOT NULL,
  price NUMERIC,
  currency TEXT,
  handle TEXT,
  image_url TEXT,
  external_id TEXT,
  source TEXT NOT NULL DEFAULT 'trendtrack',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, rank)
);

CREATE INDEX IF NOT EXISTS idx_stp_store_rank ON store_top_products(store_id, rank);

ALTER TABLE store_top_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "all_store_top_products" ON store_top_products
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 2) client_competitors.source
-- ============================================================
ALTER TABLE client_competitors
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

-- Índice único parcial para idempotência do callback /competitors:
-- mesma loja + mesma URL (normalizada) só pode aparecer uma vez quando
-- o source for 'n8n'. Manuais ficam livres de constraint.
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_competitors_n8n_url
  ON client_competitors (store_id, lower(url))
  WHERE source = 'n8n' AND url IS NOT NULL;
