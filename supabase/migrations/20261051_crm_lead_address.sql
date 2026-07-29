-- ═══════════════════════════════════════════════════════════════════
-- Endereço em crm_leads
-- ═══════════════════════════════════════════════════════════════════
--
-- A ficha do deal (deal-detail-view) tem uma aba "Endereço" que nunca
-- teve onde gravar: `crm_leads` só tem name/email/phone/company/role e
-- derivados. Deals vindos de formulário são lead-puro (sem client_id),
-- então a aba ficava permanentemente vazia pra eles.
--
-- Mesmo shape de `clients.address` (jsonb) — o front usa um único
-- componente de endereço pras duas entidades:
--   { street, number, complement, neighborhood, postal_code, city, state }
--
-- JSONB e não colunas: o endereço aqui é dado de contato exibido em
-- bloco, nunca filtrado/agregado. Colunas separadas custariam 7 ALTERs
-- e mais migrations a cada campo novo, sem ganho de query.

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS address JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN crm_leads.address IS
  'Endereço do lead. Mesmo shape de clients.address: street, number, complement, neighborhood, postal_code, city, state.';
