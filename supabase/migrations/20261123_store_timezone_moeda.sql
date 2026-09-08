-- ════════════════════════════════════════════════════════════════════
-- Loja: fuso horário e procedência da moeda
-- ════════════════════════════════════════════════════════════════════
--
-- Medição de 08/09/2026, 63 lojas ativas:
--
--   53 com country = 'BR'  ← o DEFAULT da coluna, nunca sobrescrito
--   34 dessas com idioma estrangeiro (fr, de, pl, nl, da…)
--
-- O onboarding sincroniza SÓ o idioma para client_stores; país e moeda
-- ficam no default 'BR'/'BRL' para sempre. E a moeda estava entregue à
-- digitação manual por causa de um comentário FALSO em
-- omnisend-sync.service.ts ("Omnisend nao expoe currency via API") — a
-- API expõe: GET /v5/brands/current devolve {currency, timezone, website}.
--
-- O fuso importa mais do que parece. O offset que fatia a janela do
-- relatório do Omnisend era derivado da MOEDA (`offsetForCurrency`):
--
--   - moeda errada  → offset errado → receita no dia errado;
--   - EUR → "+01:00" para a Europa inteira (Berlim ≠ Lisboa);
--   - offset FIXO, sem horário de verão — em setembro Berlim está em
--     +02:00 e Nova York em -04:00, então o corte do dia sai deslocado.
--
-- Com o IANA da plataforma os três somem de uma vez.

ALTER TABLE client_stores
  ADD COLUMN IF NOT EXISTS timezone TEXT,
  ADD COLUMN IF NOT EXISTS currency_source TEXT
    CHECK (currency_source IS NULL OR currency_source IN ('omnisend','shopify','klaviyo','manual')),
  ADD COLUMN IF NOT EXISTS currency_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS timezone_source TEXT
    CHECK (timezone_source IS NULL OR timezone_source IN ('omnisend','shopify','klaviyo','manual'));

COMMENT ON COLUMN client_stores.timezone IS
  'Fuso IANA da loja (ex.: Europe/Berlin), lido da plataforma. NULL = desconhecido — o relatorio assume o fuso da conta e DIZ que assumiu.';

COMMENT ON COLUMN client_stores.currency_source IS
  'De onde veio a moeda. manual = alguem digitou; o sync nao sobrescreve sem que a tela mostre a divergencia.';

-- Lojas sem fuso são a fila de trabalho do backfill.
CREATE INDEX IF NOT EXISTS idx_client_stores_sem_fuso
  ON client_stores(id) WHERE timezone IS NULL;
