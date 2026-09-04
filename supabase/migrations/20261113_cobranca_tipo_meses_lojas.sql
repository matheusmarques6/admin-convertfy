-- =============================================
-- Financeiro ligado à loja: tipo da cobrança, meses de referência,
-- loja da cobrança e assinatura ↔ lojas
-- =============================================
--
-- O que existia: `client_charges` (cobranças locais) e `invoices`
-- (Asaas) só sabiam o CLIENTE. Toda a informação de negócio — "é
-- comissão ou mensalidade?", "comissão de QUAL mês?", "de QUAL loja?"
-- — vivia em texto livre na descrição ("Comissões Azzurro dos meses de
-- Abril, Maio e Junho"). A Gestão de Carteira agrupava faturas por
-- cliente, então um cliente com duas lojas via a MESMA mensalidade nas
-- duas, e comissão e mensalidade se misturavam no mesmo histórico.
--
-- (1) `charge_type` em client_charges e invoices:
--     subscription | commission | other. Default 'other' para linha
--     antiga; o backfill abaixo classifica pela descrição.
-- (2) `reference_months TEXT[]` (YYYY-MM, mesmo formato das calls):
--     comissão referente a julho é "2026-07", mesmo vencendo em agosto.
-- (3) `store_id` em client_charges e invoices — a loja da cobrança.
-- (4) `invoices.asaas_subscription_id`: o pagamento do Asaas nasce de
--     uma assinatura (campo `subscription` do payment) e isso nunca era
--     gravado; com ele a view resolve a assinatura local da fatura.
-- (5) `client_subscription_stores`: uma assinatura cobre 1..N lojas
--     ("Plano Mensal 2 Lojas"). É o vínculo que deixa a carteira dizer,
--     POR LOJA, se a mensalidade está paga.
-- (6) `unified_invoices` recriada expondo tudo isso (colunas APENDADAS
--     — CREATE OR REPLACE VIEW não aceita reordenar).
-- (7) enum `store_platform` alinhado com PLATFORMS do código
--     (tray/vtex/dupla_estrutura existiam na UI e estouravam no banco).

-- ── (7) enum de plataforma ──────────────────────────────────────────
-- ADD VALUE não pode ser USADO na mesma transação em que foi criado;
-- aqui só é declarado, ninguém insere com ele nesta migration.
ALTER TYPE store_platform ADD VALUE IF NOT EXISTS 'tray';
ALTER TYPE store_platform ADD VALUE IF NOT EXISTS 'vtex';
ALTER TYPE store_platform ADD VALUE IF NOT EXISTS 'dupla_estrutura';

-- ── helper: array de "YYYY-MM" válidos ──────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_is_month_key_array(arr TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT arr IS NULL OR NOT EXISTS (
    SELECT 1 FROM unnest(arr) AS m
    WHERE m !~ '^\d{4}-(0[1-9]|1[0-2])$'
  );
$$;

-- ── (1)(2)(3) client_charges ────────────────────────────────────────
ALTER TABLE client_charges
  ADD COLUMN IF NOT EXISTS charge_type TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS reference_months TEXT[],
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES client_stores(id) ON DELETE SET NULL;

ALTER TABLE client_charges DROP CONSTRAINT IF EXISTS client_charges_charge_type_check;
ALTER TABLE client_charges ADD CONSTRAINT client_charges_charge_type_check
  CHECK (charge_type IN ('subscription', 'commission', 'other'));
ALTER TABLE client_charges DROP CONSTRAINT IF EXISTS client_charges_reference_months_check;
ALTER TABLE client_charges ADD CONSTRAINT client_charges_reference_months_check
  CHECK (fin_is_month_key_array(reference_months));

CREATE INDEX IF NOT EXISTS idx_client_charges_store_id
  ON client_charges (store_id) WHERE store_id IS NOT NULL;

COMMENT ON COLUMN client_charges.charge_type IS
  'subscription = mensalidade/assinatura; commission = comissão sobre resultado; other = avulsa.';
COMMENT ON COLUMN client_charges.reference_months IS
  'Meses a que a cobrança se refere (YYYY-MM). Comissão de julho vencendo em agosto = {2026-07}.';
COMMENT ON COLUMN client_charges.store_id IS
  'Loja da cobrança. NULL = cobrança do cliente sem loja definida (a carteira só atribui quando o cliente tem uma loja só).';

-- ── (1)(2)(3)(4) invoices (Asaas) ───────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS charge_type TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS reference_months TEXT[],
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES client_stores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS asaas_subscription_id TEXT;

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_charge_type_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_charge_type_check
  CHECK (charge_type IN ('subscription', 'commission', 'other'));
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_reference_months_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_reference_months_check
  CHECK (fin_is_month_key_array(reference_months));

CREATE INDEX IF NOT EXISTS idx_invoices_store_id
  ON invoices (store_id) WHERE store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_asaas_subscription_id
  ON invoices (asaas_subscription_id) WHERE asaas_subscription_id IS NOT NULL;

COMMENT ON COLUMN invoices.asaas_subscription_id IS
  'Campo `subscription` do payment no Asaas — preenchido pelo sync. Resolve a assinatura local na unified_invoices.';

-- ── (5) assinatura ↔ lojas ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_subscription_stores (
  subscription_id UUID NOT NULL REFERENCES client_subscriptions(id) ON DELETE CASCADE,
  store_id        UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (subscription_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_client_subscription_stores_store
  ON client_subscription_stores (store_id);

COMMENT ON TABLE client_subscription_stores IS
  'Lojas cobertas por uma assinatura. Uma assinatura pode cobrir várias lojas ("Plano Mensal 2 Lojas"); sem vínculo, a carteira só atribui a assinatura quando o cliente tem uma loja só.';

ALTER TABLE client_subscription_stores ENABLE ROW LEVEL SECURITY;

-- Mesmo escopo das tabelas-mãe (client_subscriptions): admin gerencia,
-- quem acessa o cliente lê. SEMPRE `TO authenticated` (regra da casa).
DROP POLICY IF EXISTS "css_admin_manage" ON client_subscription_stores;
CREATE POLICY "css_admin_manage" ON client_subscription_stores
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "css_view_by_client" ON client_subscription_stores;
CREATE POLICY "css_view_by_client" ON client_subscription_stores
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM client_subscriptions s
      WHERE s.id = client_subscription_stores.subscription_id
        AND (is_admin() OR can_access_client(s.client_id))
    )
  );

-- ── (6) unified_invoices ────────────────────────────────────────────
-- Colunas novas no FIM. Para a fatura do Asaas, `subscription_id` (que
-- era NULL fixo) passa a ser a assinatura LOCAL resolvida pelo
-- asaas_subscription_id — mesmo tipo, mesma posição.
CREATE OR REPLACE VIEW unified_invoices WITH (security_invoker = true) AS
SELECT
  i.id,
  i.client_id,
  i.amount,
  i.due_date,
  i.payment_date,
  i.status::TEXT                               AS status,
  i.description,
  i.asaas_id,
  (
    SELECT cs.id FROM client_subscriptions cs
    WHERE i.asaas_subscription_id IS NOT NULL
      AND cs.asaas_subscription_id = i.asaas_subscription_id
      AND cs.client_id = i.client_id
    ORDER BY cs.created_at
    LIMIT 1
  )                                            AS subscription_id,
  NULL::TEXT                                   AS payment_method,
  NULL::TEXT                                   AS actual_payment_method,
  NULL::TEXT                                   AS notes,
  i.created_at,
  COALESCE(i.updated_at, i.created_at)         AS updated_at,
  'asaas'::TEXT                                AS source,
  COALESCE(rs.total_refunded, 0)               AS refund_total,
  i.amount - COALESCE(rs.total_refunded, 0)    AS net_amount,
  i.charge_type,
  i.reference_months,
  i.store_id,
  i.asaas_subscription_id
FROM invoices i
LEFT JOIN refund_summaries rs ON rs.invoice_id = i.id

UNION ALL

SELECT
  cc.id,
  cc.client_id,
  cc.value                                     AS amount,
  cc.due_date,
  cc.payment_date,
  cc.status,
  cc.description,
  NULL::TEXT                                   AS asaas_id,
  cc.subscription_id,
  cc.payment_method,
  cc.actual_payment_method,
  cc.notes,
  cc.created_at,
  COALESCE(cc.updated_at, cc.created_at)       AS updated_at,
  'local'::TEXT                                AS source,
  COALESCE(rs.total_refunded, 0)               AS refund_total,
  cc.value - COALESCE(rs.total_refunded, 0)    AS net_amount,
  cc.charge_type,
  cc.reference_months,
  cc.store_id,
  NULL::TEXT                                   AS asaas_subscription_id
FROM client_charges cc
LEFT JOIN refund_summaries rs ON rs.charge_id = cc.id;

COMMENT ON VIEW unified_invoices IS
  'Read-only unified view over invoices (Asaas) and client_charges (local). '
  'source distingue a origem. charge_type/reference_months/store_id ligam a cobrança ao negócio (mensalidade × comissão, mês, loja). '
  'subscription_id da fatura Asaas é resolvido por asaas_subscription_id. security_invoker=true.';

GRANT SELECT ON unified_invoices TO authenticated;
GRANT SELECT ON unified_invoices TO service_role;

-- ── Backfill ────────────────────────────────────────────────────────
-- Best-effort a partir da descrição, como o time escrevia à mão:
-- "Cobrança referente à comissão do mês de Julho", "Comissões Azzurro
-- dos meses de Abril, Maio e Junho", "Comissão Julho/Agosto".
-- O parser canônico (com ranges "abril a junho") fica no código
-- (`charge-description.ts`); aqui vai o suficiente para as linhas que
-- existem. Só toca linha ainda sem classificação.

-- Meses citados por nome → YYYY-MM. Ano: o do vencimento, recuando um
-- ano quando o mês citado é POSTERIOR ao do vencimento (comissão de
-- dezembro vence em janeiro). Ano explícito na descrição ("julho de
-- 2026") vence a inferência.
CREATE OR REPLACE FUNCTION public.fin_infer_reference_months(p_desc TEXT, p_due DATE)
RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_desc TEXT := lower(coalesce(p_desc, ''));
  v_names TEXT[] := ARRAY['janeiro','fevereiro','março','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  v_nums  INT[]  := ARRAY[1,2,3,3,4,5,6,7,8,9,10,11,12];
  v_abbr  TEXT[] := ARRAY['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  v_year  INT;
  v_explicit INT;
  v_out TEXT[] := '{}';
  v_m INT;
  v_y INT;
  i INT;
BEGIN
  IF p_due IS NULL THEN RETURN NULL; END IF;
  v_year := EXTRACT(YEAR FROM p_due)::INT;
  v_explicit := NULLIF(substring(v_desc FROM '\m(20\d{2})\M'), '')::INT;

  FOR i IN 1..array_length(v_names, 1) LOOP
    IF v_desc ~ ('\m' || v_names[i] || '\M') THEN
      v_m := v_nums[i];
      v_y := coalesce(v_explicit, CASE WHEN v_m > EXTRACT(MONTH FROM p_due)::INT THEN v_year - 1 ELSE v_year END);
      v_out := array_append(v_out, format('%s-%s', v_y, lpad(v_m::TEXT, 2, '0')));
    END IF;
  END LOOP;

  -- Abreviações só quando nenhum nome completo bateu (evita "mar" em "marca").
  IF array_length(v_out, 1) IS NULL THEN
    FOR i IN 1..12 LOOP
      IF v_desc ~ ('\m' || v_abbr[i] || '(/\d{2,4})?\M') AND v_abbr[i] NOT IN ('mar','set','out') THEN
        v_m := i;
        v_y := coalesce(v_explicit, CASE WHEN v_m > EXTRACT(MONTH FROM p_due)::INT THEN v_year - 1 ELSE v_year END);
        v_out := array_append(v_out, format('%s-%s', v_y, lpad(v_m::TEXT, 2, '0')));
      END IF;
    END LOOP;
  END IF;

  IF array_length(v_out, 1) IS NULL THEN RETURN NULL; END IF;
  SELECT array_agg(DISTINCT m ORDER BY m) INTO v_out FROM unnest(v_out) AS m;
  RETURN v_out;
END;
$$;

-- Tipo pela descrição (cobrança ligada a assinatura é assinatura).
UPDATE client_charges
SET charge_type = CASE
  WHEN subscription_id IS NOT NULL THEN 'subscription'
  WHEN description ~* 'comiss' THEN 'commission'
  WHEN description ~* 'mensalidade|assinatura|plano' THEN 'subscription'
  ELSE 'other'
END
WHERE charge_type = 'other';

UPDATE invoices
SET charge_type = CASE
  WHEN description ~* 'comiss' THEN 'commission'
  WHEN description ~* 'mensalidade|assinatura|plano' THEN 'subscription'
  ELSE 'other'
END
WHERE charge_type = 'other';

-- Meses de referência citados na descrição (comissão E mensalidade
-- "do mês de Julho"). Onde nada foi citado fica NULL — a carteira usa
-- o mês do vencimento como aproximação e diz que é aproximação.
UPDATE client_charges
SET reference_months = fin_infer_reference_months(description, due_date)
WHERE reference_months IS NULL AND charge_type IN ('commission', 'subscription');

UPDATE invoices
SET reference_months = fin_infer_reference_months(description, due_date)
WHERE reference_months IS NULL AND charge_type IN ('commission', 'subscription');

-- Loja: cliente com UMA loja ativa → é ela. Com várias, só quando o
-- nome de exatamente uma loja aparece na descrição ("Comissão Vecta").
WITH single_store AS (
  SELECT client_id, MIN(id::TEXT)::UUID AS store_id
  FROM client_stores
  WHERE is_active
  GROUP BY client_id
  HAVING COUNT(*) = 1
)
UPDATE client_charges cc
SET store_id = ss.store_id
FROM single_store ss
WHERE cc.store_id IS NULL AND cc.client_id = ss.client_id;

WITH single_store AS (
  SELECT client_id, MIN(id::TEXT)::UUID AS store_id
  FROM client_stores
  WHERE is_active
  GROUP BY client_id
  HAVING COUNT(*) = 1
)
UPDATE invoices i
SET store_id = ss.store_id
FROM single_store ss
WHERE i.store_id IS NULL AND i.client_id = ss.client_id;

WITH by_name AS (
  SELECT cc.id AS charge_id, MIN(s.id::TEXT)::UUID AS store_id, COUNT(*) AS n
  FROM client_charges cc
  JOIN client_stores s ON s.client_id = cc.client_id AND s.is_active
  WHERE cc.store_id IS NULL
    AND length(s.store_name) >= 4
    AND cc.description ILIKE '%' || s.store_name || '%'
  GROUP BY cc.id
  HAVING COUNT(*) = 1
)
UPDATE client_charges cc
SET store_id = b.store_id
FROM by_name b
WHERE cc.id = b.charge_id;

WITH by_name AS (
  SELECT i.id AS invoice_id, MIN(s.id::TEXT)::UUID AS store_id, COUNT(*) AS n
  FROM invoices i
  JOIN client_stores s ON s.client_id = i.client_id AND s.is_active
  WHERE i.store_id IS NULL
    AND length(s.store_name) >= 4
    AND i.description ILIKE '%' || s.store_name || '%'
  GROUP BY i.id
  HAVING COUNT(*) = 1
)
UPDATE invoices i
SET store_id = b.store_id
FROM by_name b
WHERE i.id = b.invoice_id;

-- Segunda passada pelo PRIMEIRO nome da loja ("Comissões Azzurro" ×
-- loja "Azzurro Milano", "Comissão Vecta" × "Vecta Studio"), só
-- quando exatamente uma loja do cliente casa.
WITH by_word AS (
  SELECT i.id AS invoice_id, MIN(s.id::TEXT)::UUID AS store_id
  FROM invoices i
  JOIN client_stores s ON s.client_id = i.client_id AND s.is_active
  WHERE i.store_id IS NULL
    AND length(split_part(s.store_name, ' ', 1)) >= 4
    AND i.description ~* ('\m' || split_part(s.store_name, ' ', 1) || '\M')
  GROUP BY i.id
  HAVING COUNT(DISTINCT s.id) = 1
)
UPDATE invoices i SET store_id = b.store_id FROM by_word b WHERE i.id = b.invoice_id;

WITH by_word AS (
  SELECT cc.id AS charge_id, MIN(s.id::TEXT)::UUID AS store_id
  FROM client_charges cc
  JOIN client_stores s ON s.client_id = cc.client_id AND s.is_active
  WHERE cc.store_id IS NULL
    AND length(split_part(s.store_name, ' ', 1)) >= 4
    AND cc.description ~* ('\m' || split_part(s.store_name, ' ', 1) || '\M')
  GROUP BY cc.id
  HAVING COUNT(DISTINCT s.id) = 1
)
UPDATE client_charges cc SET store_id = b.store_id FROM by_word b WHERE cc.id = b.charge_id;

-- Assinatura ↔ loja: cliente com uma loja só → a assinatura é dela.
-- Cliente com várias fica SEM vínculo de propósito (quem sabe qual
-- assinatura cobre qual loja é o financeiro — a UI pede).
INSERT INTO client_subscription_stores (subscription_id, store_id)
SELECT s.id, ss.store_id
FROM client_subscriptions s
JOIN (
  SELECT client_id, MIN(id::TEXT)::UUID AS store_id
  FROM client_stores
  WHERE is_active
  GROUP BY client_id
  HAVING COUNT(*) = 1
) ss ON ss.client_id = s.client_id
ON CONFLICT DO NOTHING;
