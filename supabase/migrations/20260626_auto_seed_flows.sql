-- ============================================================
-- Migration: Auto-seed dos 7 flows + 38 emails default quando
--            uma loja (client_stores) é criada.
--
-- Story: AE-17
-- Plan : /root/.claude/plans/muito-bom-agora-vamos-playful-marble.md
--
-- Antes desta migration, o designer abria `/admin/stores/{id}/producao`
-- e precisava clicar "Inicializar flows" (warning + botão) que chamava
-- `POST /api/admin/stores/[id]/init-flows`. Fricção desnecessária —
-- toda loja recebe os mesmos defaults canônicos.
--
-- Decisão AE-17:
--   - Todos os 7 flows nascem com status='in_progress' (antes welcome
--     era 'in_progress' e os outros 'blocked'). O pipeline AE ignora
--     `email_flows.status` pra enfileirar, então `blocked` semanticamente
--     enganava — fica como flag manual opcional no enum.
--   - Idempotente:
--       * Flows usam `ON CONFLICT (store_id, flow_type) DO NOTHING`.
--       * Emails usam `WHERE NOT EXISTS (... flow_id + number)`.
--   - Catálogo (names + delay_hours) bate 100% com:
--       * `src/lib/services/flow-seed.service.ts` (DEFAULT_FLOWS / DEFAULT_EMAILS)
--       * `src/app/api/admin/stores/[id]/init-flows/route.ts` (legacy, agora
--         delega ao service — kept para repair de loja legada)
--
-- post_purchase fica fora (deprecated; preservado no enum por retrocompat
-- da migration 20260620_email_flows_restructure.sql).
-- ============================================================

CREATE OR REPLACE FUNCTION fn_seed_default_flows_on_store_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_welcome_id           UUID;
  v_site_abandoned_id    UUID;
  v_browse_id            UUID;
  v_cart_id              UUID;
  v_upsell_id            UUID;
  v_winback_id           UUID;
  v_shipping_id          UUID;
BEGIN
  -- ── 1. Inserir os 7 flows (idempotente via UNIQUE store_id+flow_type) ──
  INSERT INTO email_flows (store_id, flow_type, name, description, status, position)
  VALUES
    (NEW.id, 'welcome',            'Welcome Flow',       'Sequência de boas-vindas para novos inscritos',                'in_progress', 1),
    (NEW.id, 'site_abandoned',     'Site Abandoned',     'Recuperação de visitantes que saíram do site sem interagir',  'in_progress', 2),
    (NEW.id, 'browse_abandonment', 'Browse Abandoned',   'Recuperação de navegação sem compra',                           'in_progress', 3),
    (NEW.id, 'abandoned_cart',     'Carrinho Abandonado','Recuperação de carrinho abandonado',                            'in_progress', 4),
    (NEW.id, 'upsell',             'Upsell',             'Upsell pós-compra para aumentar ticket médio',                  'in_progress', 5),
    (NEW.id, 'win_back',           'Winback',            'Reativação de clientes inativos',                                'in_progress', 6),
    (NEW.id, 'shipping_stages',    'Etapas de Envio',    'Notificações transacionais durante o envio do pedido',          'in_progress', 7)
  ON CONFLICT (store_id, flow_type) DO NOTHING;

  -- ── 2. Pegar os IDs dos flows recém-criados (ou pré-existentes) ──
  SELECT id INTO v_welcome_id        FROM email_flows WHERE store_id = NEW.id AND flow_type = 'welcome';
  SELECT id INTO v_site_abandoned_id FROM email_flows WHERE store_id = NEW.id AND flow_type = 'site_abandoned';
  SELECT id INTO v_browse_id         FROM email_flows WHERE store_id = NEW.id AND flow_type = 'browse_abandonment';
  SELECT id INTO v_cart_id           FROM email_flows WHERE store_id = NEW.id AND flow_type = 'abandoned_cart';
  SELECT id INTO v_upsell_id         FROM email_flows WHERE store_id = NEW.id AND flow_type = 'upsell';
  SELECT id INTO v_winback_id        FROM email_flows WHERE store_id = NEW.id AND flow_type = 'win_back';
  SELECT id INTO v_shipping_id       FROM email_flows WHERE store_id = NEW.id AND flow_type = 'shipping_stages';

  -- ── 3. Inserir os 38 emails default ──
  -- Welcome (8 emails)
  INSERT INTO email_flow_emails (flow_id, number, name, status, delay_hours)
  SELECT v_welcome_id, n, em_name, 'draft', delay
  FROM (VALUES
    (1, 'Welcome 1',   0),
    (2, 'Welcome 2',  24),
    (3, 'Welcome 3',  48),
    (4, 'Welcome 4',  96),
    (5, 'Welcome 5', 120),
    (6, 'Welcome 6', 144),
    (7, 'Welcome 7', 168),
    (8, 'Welcome 8', 192)
  ) AS t(n, em_name, delay)
  WHERE v_welcome_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM email_flow_emails efe
      WHERE efe.flow_id = v_welcome_id AND efe.number = t.n
    );

  -- Site Abandoned (1 email)
  INSERT INTO email_flow_emails (flow_id, number, name, status, delay_hours)
  SELECT v_site_abandoned_id, n, em_name, 'draft', delay
  FROM (VALUES
    (1, 'Site Abandoned 1', 1)
  ) AS t(n, em_name, delay)
  WHERE v_site_abandoned_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM email_flow_emails efe
      WHERE efe.flow_id = v_site_abandoned_id AND efe.number = t.n
    );

  -- Browse Abandoned (5 emails)
  INSERT INTO email_flow_emails (flow_id, number, name, status, delay_hours)
  SELECT v_browse_id, n, em_name, 'draft', delay
  FROM (VALUES
    (1, 'Browse Abandoned 1',   1),
    (2, 'Browse Abandoned 2',  24),
    (3, 'Browse Abandoned 3',  48),
    (4, 'Browse Abandoned 4',  72),
    (5, 'Browse Abandoned 5', 120)
  ) AS t(n, em_name, delay)
  WHERE v_browse_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM email_flow_emails efe
      WHERE efe.flow_id = v_browse_id AND efe.number = t.n
    );

  -- Carrinho Abandonado (8 emails)
  INSERT INTO email_flow_emails (flow_id, number, name, status, delay_hours)
  SELECT v_cart_id, n, em_name, 'draft', delay
  FROM (VALUES
    (1, 'Carrinho Abandonado 1',   1),
    (2, 'Carrinho Abandonado 2',   4),
    (3, 'Carrinho Abandonado 3',  24),
    (4, 'Carrinho Abandonado 4',  48),
    (5, 'Carrinho Abandonado 5',  72),
    (6, 'Carrinho Abandonado 6',  96),
    (7, 'Carrinho Abandonado 7', 120),
    (8, 'Carrinho Abandonado 8', 168)
  ) AS t(n, em_name, delay)
  WHERE v_cart_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM email_flow_emails efe
      WHERE efe.flow_id = v_cart_id AND efe.number = t.n
    );

  -- Upsell (4 emails)
  INSERT INTO email_flow_emails (flow_id, number, name, status, delay_hours)
  SELECT v_upsell_id, n, em_name, 'draft', delay
  FROM (VALUES
    (1, 'Upsell 1',  24),
    (2, 'Upsell 2',  72),
    (3, 'Upsell 3', 168),
    (4, 'Upsell 4', 336)
  ) AS t(n, em_name, delay)
  WHERE v_upsell_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM email_flow_emails efe
      WHERE efe.flow_id = v_upsell_id AND efe.number = t.n
    );

  -- Winback (3 emails)
  INSERT INTO email_flow_emails (flow_id, number, name, status, delay_hours)
  SELECT v_winback_id, n, em_name, 'draft', delay
  FROM (VALUES
    (1, 'Winback 1',   0),
    (2, 'Winback 2', 168),
    (3, 'Winback 3', 336)
  ) AS t(n, em_name, delay)
  WHERE v_winback_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM email_flow_emails efe
      WHERE efe.flow_id = v_winback_id AND efe.number = t.n
    );

  -- Etapas de Envio (5 emails)
  INSERT INTO email_flow_emails (flow_id, number, name, status, delay_hours)
  SELECT v_shipping_id, n, em_name, 'draft', delay
  FROM (VALUES
    (1, 'Pedido Pago',          0),
    (2, 'Pedido em separação',  0),
    (3, 'Pedido em coleta',     0),
    (4, 'Atraso na Entrega',    0),
    (5, 'Pedido Enviado',       0)
  ) AS t(n, em_name, delay)
  WHERE v_shipping_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM email_flow_emails efe
      WHERE efe.flow_id = v_shipping_id AND efe.number = t.n
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_seed_default_flows_on_store_insert() IS
  'AE-17 — Auto-seed dos 7 flows + 38 emails default quando uma loja é criada. '
  'Idempotente. Paridade 1:1 com src/lib/services/flow-seed.service.ts.';

DROP TRIGGER IF EXISTS tr_seed_default_flows_on_store_insert ON client_stores;
CREATE TRIGGER tr_seed_default_flows_on_store_insert
  AFTER INSERT ON client_stores
  FOR EACH ROW
  EXECUTE FUNCTION fn_seed_default_flows_on_store_insert();
