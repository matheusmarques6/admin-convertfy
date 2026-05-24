-- ============================================================
-- Reestrutura lista de flows de email do workspace de produção.
--
-- Decisão (Marco 2026): 7 flows fixos por loja, substituindo o
-- modelo antigo de 5 flows. `post_purchase` fica no enum por
-- retrocompatibilidade (tasks de onboarding legadas ainda
-- referenciam) mas init-flows nao cria mais.
--
-- Novos flow_types:
--   - site_abandoned    (Site Abandoned)     — 1 email
--   - upsell            (Upsell)             — 4 emails
--   - shipping_stages   (Etapas de Envio)    — 5 emails fixos
--
-- Idempotente.
-- ============================================================

-- ── 1. CHECK constraint estendido ─────────────────────────
ALTER TABLE email_flows
  DROP CONSTRAINT IF EXISTS email_flows_flow_type_check;

ALTER TABLE email_flows
  ADD CONSTRAINT email_flows_flow_type_check
  CHECK (flow_type IN (
    'welcome',
    'site_abandoned',
    'browse_abandonment',
    'abandoned_cart',
    'upsell',
    'win_back',
    'shipping_stages',
    'post_purchase',
    'custom'
  ));

-- ── 2. Reposiciona flows existentes ───────────────────────
-- Nova ordem na sidebar: welcome=1, site_abandoned=2, browse=3,
-- carrinho=4, upsell=5, winback=6, shipping_stages=7.
-- post_purchase fica como 99 (deprecated; some no final se ainda existir).
UPDATE email_flows SET position = 1  WHERE flow_type = 'welcome';
UPDATE email_flows SET position = 3, name = 'Browse Abandoned'
  WHERE flow_type = 'browse_abandonment';
UPDATE email_flows SET position = 4, name = 'Carrinho Abandonado'
  WHERE flow_type = 'abandoned_cart';
UPDATE email_flows SET position = 6, name = 'Winback'
  WHERE flow_type = 'win_back';
UPDATE email_flows SET position = 99 WHERE flow_type = 'post_purchase';

-- ── 3. Cria os 3 novos flows pros stores que ja tem welcome ─
INSERT INTO email_flows (store_id, flow_type, name, description, status, position)
SELECT ef.store_id, 'site_abandoned', 'Site Abandoned',
       'Recuperação de visitantes que saíram do site sem interagir', 'blocked', 2
FROM email_flows ef
WHERE ef.flow_type = 'welcome'
  AND NOT EXISTS (
    SELECT 1 FROM email_flows ef2
    WHERE ef2.store_id = ef.store_id AND ef2.flow_type = 'site_abandoned'
  );

INSERT INTO email_flows (store_id, flow_type, name, description, status, position)
SELECT ef.store_id, 'upsell', 'Upsell',
       'Upsell pós-compra para aumentar ticket médio', 'blocked', 5
FROM email_flows ef
WHERE ef.flow_type = 'welcome'
  AND NOT EXISTS (
    SELECT 1 FROM email_flows ef2
    WHERE ef2.store_id = ef.store_id AND ef2.flow_type = 'upsell'
  );

INSERT INTO email_flows (store_id, flow_type, name, description, status, position)
SELECT ef.store_id, 'shipping_stages', 'Etapas de Envio',
       'Notificações transacionais durante o envio do pedido', 'blocked', 7
FROM email_flows ef
WHERE ef.flow_type = 'welcome'
  AND NOT EXISTS (
    SELECT 1 FROM email_flows ef2
    WHERE ef2.store_id = ef.store_id AND ef2.flow_type = 'shipping_stages'
  );

-- ── 4. Seed de emails default por flow_type ───────────────
-- Insere apenas os emails que ainda nao existem (idempotente).

-- Welcome: renomeia emails existentes (1-5) e adiciona 6-8
UPDATE email_flow_emails efe
SET name = 'Welcome ' || efe.number
FROM email_flows ef
WHERE efe.flow_id = ef.id
  AND ef.flow_type = 'welcome'
  AND efe.number BETWEEN 1 AND 5
  AND efe.name != 'Welcome ' || efe.number;

INSERT INTO email_flow_emails (flow_id, number, name, status, delay_hours)
SELECT ef.id, t.number, t.name, 'draft', t.delay_hours
FROM email_flows ef
CROSS JOIN (VALUES
  (6, 'Welcome 6', 144),
  (7, 'Welcome 7', 168),
  (8, 'Welcome 8', 192)
) AS t(number, name, delay_hours)
WHERE ef.flow_type = 'welcome'
  AND NOT EXISTS (
    SELECT 1 FROM email_flow_emails efe
    WHERE efe.flow_id = ef.id AND efe.number = t.number
  );

-- Site Abandoned 1
INSERT INTO email_flow_emails (flow_id, number, name, status, delay_hours)
SELECT ef.id, 1, 'Site Abandoned 1', 'draft', 1
FROM email_flows ef
WHERE ef.flow_type = 'site_abandoned'
  AND NOT EXISTS (
    SELECT 1 FROM email_flow_emails efe
    WHERE efe.flow_id = ef.id AND efe.number = 1
  );

-- Browse Abandoned 1-5
INSERT INTO email_flow_emails (flow_id, number, name, status, delay_hours)
SELECT ef.id, t.number, t.name, 'draft', t.delay_hours
FROM email_flows ef
CROSS JOIN (VALUES
  (1, 'Browse Abandoned 1', 1),
  (2, 'Browse Abandoned 2', 24),
  (3, 'Browse Abandoned 3', 48),
  (4, 'Browse Abandoned 4', 72),
  (5, 'Browse Abandoned 5', 120)
) AS t(number, name, delay_hours)
WHERE ef.flow_type = 'browse_abandonment'
  AND NOT EXISTS (
    SELECT 1 FROM email_flow_emails efe
    WHERE efe.flow_id = ef.id AND efe.number = t.number
  );

-- Carrinho Abandonado 1-8
INSERT INTO email_flow_emails (flow_id, number, name, status, delay_hours)
SELECT ef.id, t.number, t.name, 'draft', t.delay_hours
FROM email_flows ef
CROSS JOIN (VALUES
  (1, 'Carrinho Abandonado 1', 1),
  (2, 'Carrinho Abandonado 2', 4),
  (3, 'Carrinho Abandonado 3', 24),
  (4, 'Carrinho Abandonado 4', 48),
  (5, 'Carrinho Abandonado 5', 72),
  (6, 'Carrinho Abandonado 6', 96),
  (7, 'Carrinho Abandonado 7', 120),
  (8, 'Carrinho Abandonado 8', 168)
) AS t(number, name, delay_hours)
WHERE ef.flow_type = 'abandoned_cart'
  AND NOT EXISTS (
    SELECT 1 FROM email_flow_emails efe
    WHERE efe.flow_id = ef.id AND efe.number = t.number
  );

-- Upsell 1-4
INSERT INTO email_flow_emails (flow_id, number, name, status, delay_hours)
SELECT ef.id, t.number, t.name, 'draft', t.delay_hours
FROM email_flows ef
CROSS JOIN (VALUES
  (1, 'Upsell 1', 24),
  (2, 'Upsell 2', 72),
  (3, 'Upsell 3', 168),
  (4, 'Upsell 4', 336)
) AS t(number, name, delay_hours)
WHERE ef.flow_type = 'upsell'
  AND NOT EXISTS (
    SELECT 1 FROM email_flow_emails efe
    WHERE efe.flow_id = ef.id AND efe.number = t.number
  );

-- Winback 1-3
INSERT INTO email_flow_emails (flow_id, number, name, status, delay_hours)
SELECT ef.id, t.number, t.name, 'draft', t.delay_hours
FROM email_flows ef
CROSS JOIN (VALUES
  (1, 'Winback 1', 0),
  (2, 'Winback 2', 168),
  (3, 'Winback 3', 336)
) AS t(number, name, delay_hours)
WHERE ef.flow_type = 'win_back'
  AND NOT EXISTS (
    SELECT 1 FROM email_flow_emails efe
    WHERE efe.flow_id = ef.id AND efe.number = t.number
  );

-- Etapas de Envio (nomes fixos, nao numerados)
INSERT INTO email_flow_emails (flow_id, number, name, status, delay_hours)
SELECT ef.id, t.number, t.name, 'draft', 0
FROM email_flows ef
CROSS JOIN (VALUES
  (1, 'Pedido Pago'),
  (2, 'Pedido em separação'),
  (3, 'Pedido em coleta'),
  (4, 'Atraso na Entrega'),
  (5, 'Pedido Enviado')
) AS t(number, name)
WHERE ef.flow_type = 'shipping_stages'
  AND NOT EXISTS (
    SELECT 1 FROM email_flow_emails efe
    WHERE efe.flow_id = ef.id AND efe.number = t.number
  );
