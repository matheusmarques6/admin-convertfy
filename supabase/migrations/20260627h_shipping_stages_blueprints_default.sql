-- ============================================================
-- Shipping stages blueprints — composição padrão universal (1-5)
--
-- Define a estrutura `blocks` JSONB de cada um dos 5 emails do flow
-- shipping_stages como template default que toda loja nova herda via
-- `seedBlocksFromBlueprint`. Não é específico de nenhuma loja —
-- representa a receita genérica de etapas de envio do produto.
--
-- E1 — Pedido Pago (7 blocos)
-- E2 — Em Separação (8 blocos)
-- E3 — Em Coleta (8 blocos — igual E2)
-- E4 — Atraso na Entrega (1 bloco — aviso operacional)
-- E5 — Pedido Enviado (9 blocos)
--
-- DECISÃO IMPORTANTE — Blocos transacionais (Order Details, Totais):
--
-- Esses blocos NÃO são preenchidos pelo agente de copy (IA). Os dados
-- (número do pedido, totais, endereço, código de rastreio) mudam por
-- pedido e são preenchidos pelo Omnisend através de variáveis Liquid
-- transacionais. O blueprint reserva esses blocos como `text` com
-- purpose explícito documentando as variáveis típicas do Omnisend —
-- assim o agente Copy ignora (não gera nada) e o template HTML final
-- expõe os placeholders pra Omnisend interpolar.
--
-- Trust Badges → features (consistente com welcome 1, browse_abandonment,
-- abandoned_cart, win_back).
--
-- E5 Hero + CTA → 2 blocos separados (Opção A — padrão dos outros flows).
--
-- E4 "Atraso" → bloco text único (aviso operacional, não carta pessoal).
--
-- UPSERT (ON CONFLICT DO UPDATE) só toca os campos relevantes
-- (objective, messaging, subject_hint, blocks, updated_at) — preserva
-- image_brief, image_aspect, image_mode e image_overlay_reserve_bottom
-- se já tiverem sido setados em migrations anteriores.
--
-- Idempotente em ambiente novo (CI/db reset) e prod.
-- ============================================================

-- E1 — Pedido Pago (7 blocos)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'shipping_stages', 1,
  'Confirmação de pagamento recebido. Tom de tranquilidade — pedido em andamento.',
  'Hero confirmando + order details (Omnisend) + produtos + totais (Omnisend) + trust badges + texto agradecimento.',
  'Pagamento confirmado — seu pedido está sendo preparado',
  '[
    {"type":"hero","label":"Hero","purpose":"Hero confirmando pagamento (ex: \"HAS BEEN APPROVED\")","needs_image":true},
    {"type":"text","label":"Order Details","purpose":"Placeholder Omnisend — bloco transacional. Renderizado com variáveis tipo {{order.number}}, {{order.date}}, {{order.shipping_address}}. IA NÃO gera conteúdo aqui.","needs_image":false},
    {"type":"products","label":"Produtos","purpose":"Lista de produtos do pedido (preenchido pelo Omnisend com {{order.items}})","needs_image":false},
    {"type":"text","label":"Totais","purpose":"Placeholder Omnisend — totais do pedido. Variáveis tipo {{order.subtotal}}, {{order.shipping_cost}}, {{order.discount}}, {{order.total}}. IA NÃO gera conteúdo aqui.","needs_image":false},
    {"type":"features","label":"Trust Badges","purpose":"Strip de selos de confiança (\"tem alguma dúvida?\" / \"trocas e devoluções\")","needs_image":false},
    {"type":"text","label":"Texto","purpose":"Texto de agradecimento + próximos passos (este sim a IA preenche, com tom da marca)","needs_image":false},
    {"type":"footer","label":"Rodapé padrão","purpose":"Rodapé padrão","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET objective = EXCLUDED.objective,
    messaging = EXCLUDED.messaging,
    subject_hint = EXCLUDED.subject_hint,
    blocks = EXCLUDED.blocks,
    updated_at = NOW();

-- E2 — Em Separação (8 blocos)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'shipping_stages', 2,
  'Pedido em separação no estoque. Tom de progresso — engajamento + upsell sutil.',
  'Hero "in preparation" + order details (Omnisend) + produtos + totais (Omnisend) + trust badges + texto + sugestões de produtos.',
  'Seu pedido está em separação',
  '[
    {"type":"hero","label":"Hero","purpose":"Hero indicando \"IS IN PREPARATION\"","needs_image":true},
    {"type":"text","label":"Order Details","purpose":"Placeholder Omnisend — bloco transacional. Variáveis {{order.number}}, {{order.date}}, {{order.shipping_address}}. IA NÃO gera conteúdo aqui.","needs_image":false},
    {"type":"products","label":"Produtos","purpose":"Lista de produtos do pedido (preenchido pelo Omnisend com {{order.items}})","needs_image":false},
    {"type":"text","label":"Totais","purpose":"Placeholder Omnisend — totais do pedido. Variáveis {{order.subtotal}}, {{order.shipping_cost}}, {{order.discount}}, {{order.total}}. IA NÃO gera conteúdo aqui.","needs_image":false},
    {"type":"features","label":"Trust Badges","purpose":"Strip de selos de confiança","needs_image":false},
    {"type":"text","label":"Texto","purpose":"Texto explicando o status \"em separação\" + tempo estimado (IA preenche com tom da marca)","needs_image":false},
    {"type":"products","label":"Produtos","purpose":"Sugestões de produtos complementares (upsell sutil)","needs_image":false},
    {"type":"footer","label":"Rodapé padrão","purpose":"Rodapé padrão","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET objective = EXCLUDED.objective,
    messaging = EXCLUDED.messaging,
    subject_hint = EXCLUDED.subject_hint,
    blocks = EXCLUDED.blocks,
    updated_at = NOW();

-- E3 — Em Coleta (8 blocos — mesma estrutura que E2)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'shipping_stages', 3,
  'Pedido coletado pela transportadora. Tom de progresso — pedido a caminho.',
  'Hero "transporter" + order details (Omnisend) + produtos + totais (Omnisend) + trust badges + texto + sugestões.',
  'Seu pedido foi coletado pela transportadora',
  '[
    {"type":"hero","label":"Hero","purpose":"Hero indicando \"TRANSPORTER\" / em coleta","needs_image":true},
    {"type":"text","label":"Order Details","purpose":"Placeholder Omnisend — bloco transacional. Variáveis {{order.number}}, {{order.tracking_code}}, {{order.tracking_url}}. IA NÃO gera conteúdo aqui.","needs_image":false},
    {"type":"products","label":"Produtos","purpose":"Lista de produtos do pedido (preenchido pelo Omnisend com {{order.items}})","needs_image":false},
    {"type":"text","label":"Totais","purpose":"Placeholder Omnisend — totais do pedido. Variáveis {{order.subtotal}}, {{order.shipping_cost}}, {{order.discount}}, {{order.total}}. IA NÃO gera conteúdo aqui.","needs_image":false},
    {"type":"features","label":"Trust Badges","purpose":"Strip de selos de confiança","needs_image":false},
    {"type":"text","label":"Texto","purpose":"Texto explicando \"em coleta\" + ETA (IA preenche com tom da marca)","needs_image":false},
    {"type":"products","label":"Produtos","purpose":"Sugestões de produtos complementares","needs_image":false},
    {"type":"footer","label":"Rodapé padrão","purpose":"Rodapé padrão","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET objective = EXCLUDED.objective,
    messaging = EXCLUDED.messaging,
    subject_hint = EXCLUDED.subject_hint,
    blocks = EXCLUDED.blocks,
    updated_at = NOW();

-- E4 — Atraso na Entrega (1 bloco — aviso operacional)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'shipping_stages', 4,
  'Aviso de atraso na entrega. Tom de transparência e empatia — só comunicação operacional.',
  'Email textual minimalista — apenas a comunicação do atraso + próximos passos. Sem produtos, sem upsell.',
  'Aviso importante sobre seu pedido',
  '[
    {"type":"text","label":"Texto","purpose":"Texto único explicando o atraso + nova previsão de entrega + canais de suporte. Pode incluir variáveis Omnisend tipo {{order.number}}, {{order.tracking_url}}, {{order.new_eta}}. IA preenche tom + estrutura editorial; placeholders Omnisend ficam inline no texto.","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET objective = EXCLUDED.objective,
    messaging = EXCLUDED.messaging,
    subject_hint = EXCLUDED.subject_hint,
    blocks = EXCLUDED.blocks,
    updated_at = NOW();

-- E5 — Pedido Enviado (9 blocos)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'shipping_stages', 5,
  'Pedido enviado com código de rastreio. Tom de comemoração — produto a caminho.',
  'Hero "shipped" + CTA pra rastreio + order details (Omnisend) + produtos + totais (Omnisend) + trust badges + texto + sugestões.',
  'Seu pedido foi enviado 🚚',
  '[
    {"type":"hero","label":"Hero","purpose":"Hero indicando \"SHIPPED\" / pedido a caminho","needs_image":true},
    {"type":"cta","label":"CTA","purpose":"CTA \"TRACK ORDER\" linkando pra rastreamento (link usa {{order.tracking_url}})","needs_image":false},
    {"type":"text","label":"Order Details","purpose":"Placeholder Omnisend — bloco transacional. Variáveis {{order.number}}, {{order.tracking_code}}, {{order.tracking_url}}, {{order.estimated_delivery}}. IA NÃO gera conteúdo aqui.","needs_image":false},
    {"type":"products","label":"Produtos","purpose":"Lista de produtos do pedido (preenchido pelo Omnisend com {{order.items}})","needs_image":false},
    {"type":"text","label":"Totais","purpose":"Placeholder Omnisend — totais do pedido. Variáveis {{order.subtotal}}, {{order.shipping_cost}}, {{order.discount}}, {{order.total}}. IA NÃO gera conteúdo aqui.","needs_image":false},
    {"type":"features","label":"Trust Badges","purpose":"Strip de selos de confiança","needs_image":false},
    {"type":"text","label":"Texto","purpose":"Texto explicando o envio + ETA + dicas pra rastrear (IA preenche com tom da marca)","needs_image":false},
    {"type":"products","label":"Produtos","purpose":"Sugestões de produtos complementares","needs_image":false},
    {"type":"footer","label":"Rodapé padrão","purpose":"Rodapé padrão","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET objective = EXCLUDED.objective,
    messaging = EXCLUDED.messaging,
    subject_hint = EXCLUDED.subject_hint,
    blocks = EXCLUDED.blocks,
    updated_at = NOW();
