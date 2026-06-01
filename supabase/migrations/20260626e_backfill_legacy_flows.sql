-- ============================================================
-- Epic AE Pipeline Split — Story AE-22
-- Backfill: cria os flows + emails default em lojas legadas
-- que existem hoje sem ter passado pelo trigger AE-17
-- (tr_seed_default_flows_on_store_insert, criado em 20260626).
--
-- Triggers SQL não atuam retroativamente — só fire em INSERT
-- novo. Esta migration cobre lojas criadas ANTES do trigger
-- existir, garantindo que todo client_stores tenha o set
-- canônico de 7 flows + 34 emails.
--
-- Idempotente: WHERE NOT EXISTS em ambas as etapas. Rodar 2x
-- não duplica. Não toca em flows/emails pré-existentes.
--
-- Smoke test após aplicar:
--   SELECT
--     COUNT(*) FILTER (WHERE flows = 7 AND emails = 34) AS lojas_completas,
--     COUNT(*) FILTER (WHERE flows < 7 OR emails < 34) AS lojas_incompletas,
--     COUNT(*) AS total
--   FROM (
--     SELECT cs.id,
--            COUNT(DISTINCT ef.id) AS flows,
--            COUNT(efe.id) AS emails
--     FROM client_stores cs
--     LEFT JOIN email_flows ef ON ef.store_id = cs.id
--     LEFT JOIN email_flow_emails efe ON efe.flow_id = ef.id
--     GROUP BY cs.id
--   ) AS counts;
--   -- esperado: lojas_completas = total, lojas_incompletas = 0
-- ============================================================

-- ETAPA 1: insere flows faltantes em todas as lojas
INSERT INTO email_flows (store_id, flow_type, name, description, status, position)
SELECT cs.id, t.flow_type, t.name, t.description, 'in_progress', t.position
FROM client_stores cs
CROSS JOIN (VALUES
  ('welcome',            'Welcome Flow',         'Sequência de boas-vindas para novos inscritos', 1),
  ('site_abandoned',     'Site Abandoned',       'Recuperação de visitantes que saíram do site sem interagir', 2),
  ('browse_abandonment', 'Browse Abandoned',     'Recuperação de navegação sem compra', 3),
  ('abandoned_cart',     'Carrinho Abandonado',  'Recuperação de carrinho abandonado', 4),
  ('upsell',             'Upsell',               'Upsell pós-compra para aumentar ticket médio', 5),
  ('win_back',           'Winback',              'Reativação de clientes inativos', 6),
  ('shipping_stages',    'Etapas de Envio',      'Notificações transacionais durante o envio do pedido', 7)
) AS t(flow_type, name, description, position)
WHERE NOT EXISTS (
  SELECT 1 FROM email_flows ef
  WHERE ef.store_id = cs.id AND ef.flow_type = t.flow_type
);

-- ETAPA 2: insere emails faltantes em cada flow
WITH email_defaults(flow_type, number, name, delay_hours) AS (
  VALUES
    ('welcome', 1, 'Welcome 1', 0), ('welcome', 2, 'Welcome 2', 24),
    ('welcome', 3, 'Welcome 3', 48), ('welcome', 4, 'Welcome 4', 96),
    ('welcome', 5, 'Welcome 5', 120), ('welcome', 6, 'Welcome 6', 144),
    ('welcome', 7, 'Welcome 7', 168), ('welcome', 8, 'Welcome 8', 192),
    ('site_abandoned', 1, 'Site Abandoned 1', 1),
    ('browse_abandonment', 1, 'Browse Abandoned 1', 1),
    ('browse_abandonment', 2, 'Browse Abandoned 2', 24),
    ('browse_abandonment', 3, 'Browse Abandoned 3', 48),
    ('browse_abandonment', 4, 'Browse Abandoned 4', 72),
    ('browse_abandonment', 5, 'Browse Abandoned 5', 120),
    ('abandoned_cart', 1, 'Carrinho Abandonado 1', 1),
    ('abandoned_cart', 2, 'Carrinho Abandonado 2', 4),
    ('abandoned_cart', 3, 'Carrinho Abandonado 3', 24),
    ('abandoned_cart', 4, 'Carrinho Abandonado 4', 48),
    ('abandoned_cart', 5, 'Carrinho Abandonado 5', 72),
    ('abandoned_cart', 6, 'Carrinho Abandonado 6', 96),
    ('abandoned_cart', 7, 'Carrinho Abandonado 7', 120),
    ('abandoned_cart', 8, 'Carrinho Abandonado 8', 168),
    ('upsell', 1, 'Upsell 1', 24), ('upsell', 2, 'Upsell 2', 72),
    ('upsell', 3, 'Upsell 3', 168), ('upsell', 4, 'Upsell 4', 336),
    ('win_back', 1, 'Winback 1', 0), ('win_back', 2, 'Winback 2', 168),
    ('win_back', 3, 'Winback 3', 336),
    ('shipping_stages', 1, 'Pedido Pago', 0),
    ('shipping_stages', 2, 'Pedido em separação', 0),
    ('shipping_stages', 3, 'Pedido em coleta', 0),
    ('shipping_stages', 4, 'Atraso na Entrega', 0),
    ('shipping_stages', 5, 'Pedido Enviado', 0)
)
INSERT INTO email_flow_emails (flow_id, number, name, status, delay_hours)
SELECT ef.id, ed.number, ed.name, 'draft', ed.delay_hours
FROM email_flows ef
JOIN email_defaults ed ON ed.flow_type = ef.flow_type
WHERE NOT EXISTS (
  SELECT 1 FROM email_flow_emails efe
  WHERE efe.flow_id = ef.id AND efe.number = ed.number
);
