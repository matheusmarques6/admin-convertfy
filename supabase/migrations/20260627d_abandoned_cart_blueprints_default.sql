-- ============================================================
-- Abandoned cart blueprints — composição padrão universal (1-8)
--
-- Define a estrutura `blocks` JSONB de cada um dos 8 emails do flow
-- abandoned_cart como template default que toda loja nova herda via
-- `seedBlocksFromBlueprint`. Não é específico de nenhuma loja —
-- representa a receita genérica de cart abandonment do produto.
--
-- E1 — Golden Gift (6 blocos)
-- E2 — Everything All Good? (1 bloco — check-in textual)
-- E3 — We're Packing Your Order (7 blocos)
-- E4 — Free Shipping Worldwide (8 blocos)
-- E5 — Last Chance 10% Off (8 blocos)
-- E6 — Last 12 Hours (8 blocos)
-- E7 — Final Notice 12% (7 blocos)
-- E8 — Last Reminder + Code (1 bloco — texto curto)
--
-- Usa os 9 tipos novos adicionados em 20260627_block_types_expansion
-- (testimonials, features, social_proof) + tipos clássicos.
--
-- UPSERT (ON CONFLICT DO UPDATE) só toca os campos relevantes
-- (objective, messaging, subject_hint, blocks, updated_at) — preserva
-- image_brief, image_aspect, image_mode e image_overlay_reserve_bottom
-- se já tiverem sido setados em migrations anteriores.
--
-- Idempotente em ambiente novo (CI/db reset) e prod.
-- ============================================================

-- E1 — Golden Gift (6 blocos)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'abandoned_cart', 1,
  'Primeiro lembrete amigável do carrinho com brinde/incentivo. Tom acolhedor, sem pressão.',
  'Hero do produto abandonado + produtos + cupom-brinde + review pra confiança + fechamento textual.',
  'Você esqueceu algo no carrinho 🎁',
  '[
    {"type":"hero","label":"Hero","purpose":"Hero com produto abandonado em destaque","needs_image":true},
    {"type":"products","label":"Produtos","purpose":"Produtos do carrinho abandonado","needs_image":false},
    {"type":"coupon","label":"Cupom","purpose":"Cupom-brinde (\"golden gift\") pra fechar a compra","needs_image":false},
    {"type":"testimonials","label":"Review","purpose":"Cards de review/depoimento pra reforçar confiança","needs_image":false},
    {"type":"text","label":"Texto","purpose":"Texto de fechamento amigável","needs_image":false},
    {"type":"footer","label":"Rodapé padrão","purpose":"Rodapé padrão","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET objective = EXCLUDED.objective,
    messaging = EXCLUDED.messaging,
    subject_hint = EXCLUDED.subject_hint,
    blocks = EXCLUDED.blocks,
    updated_at = NOW();

-- E2 — Everything All Good? (1 bloco — check-in textual)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'abandoned_cart', 2,
  'Check-in pessoal e curto. Pergunta se ficou alguma dúvida — formato conversa, sem CTAs.',
  'Email textual minimalista. Tom de atendimento humano, oferta de ajuda.',
  'Tudo certo por aí?',
  '[
    {"type":"text","label":"Texto","purpose":"Texto único de check-in (pergunta amigável: \"posso ajudar com algo?\"). Sem CTAs comerciais.","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET objective = EXCLUDED.objective,
    messaging = EXCLUDED.messaging,
    subject_hint = EXCLUDED.subject_hint,
    blocks = EXCLUDED.blocks,
    updated_at = NOW();

-- E3 — We're Packing Your Order (7 blocos)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'abandoned_cart', 3,
  'Cria sensação de "pedido prestes a sair" pra acelerar decisão. Tom de antecipação positiva.',
  'Hero com energia + produtos do carrinho + cupom + produtos extras + trust badges.',
  'Estamos preparando seu pedido...',
  '[
    {"type":"hero","label":"Hero","purpose":"Hero com energia de envio (caixa, embalagem, prep)","needs_image":true},
    {"type":"products","label":"Produtos","purpose":"Produtos do carrinho abandonado","needs_image":false},
    {"type":"coupon","label":"Cupom","purpose":"Cupom pra fechar a compra antes do prazo","needs_image":false},
    {"type":"text","label":"Texto","purpose":"Texto explicativo sobre o pedido / prazo","needs_image":false},
    {"type":"products","label":"Produtos","purpose":"Sugestões complementares pra adicionar ao pedido","needs_image":false},
    {"type":"features","label":"Trust Badges","purpose":"Selos de confiança (frete, troca, pagamento seguro)","needs_image":false},
    {"type":"footer","label":"Rodapé padrão","purpose":"Rodapé padrão","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET objective = EXCLUDED.objective,
    messaging = EXCLUDED.messaging,
    subject_hint = EXCLUDED.subject_hint,
    blocks = EXCLUDED.blocks,
    updated_at = NOW();

-- E4 — Free Shipping Worldwide (8 blocos)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'abandoned_cart', 4,
  'Frete grátis como gatilho principal. Combina hero + produtos + prova social + review.',
  'Hero destacando frete grátis + produtos + CTA + trust badges + social proof + texto + review.',
  'Frete grátis pra você — só hoje',
  '[
    {"type":"hero","label":"Hero","purpose":"Hero destacando frete grátis","needs_image":true},
    {"type":"products","label":"Produtos","purpose":"Produtos do carrinho","needs_image":false},
    {"type":"cta","label":"CTA","purpose":"CTA pra resgatar frete grátis","needs_image":false},
    {"type":"features","label":"Trust Badges","purpose":"Selos de confiança","needs_image":false},
    {"type":"social_proof","label":"Social Proof","purpose":"Contagem de clientes ou rating médio","needs_image":false},
    {"type":"text","label":"Texto","purpose":"Texto curto reforçando o benefício de frete grátis","needs_image":false},
    {"type":"testimonials","label":"Review","purpose":"Cards de review de clientes","needs_image":false},
    {"type":"footer","label":"Rodapé padrão","purpose":"Rodapé padrão","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET objective = EXCLUDED.objective,
    messaging = EXCLUDED.messaging,
    subject_hint = EXCLUDED.subject_hint,
    blocks = EXCLUDED.blocks,
    updated_at = NOW();

-- E5 — Last Chance 10% Off (8 blocos)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'abandoned_cart', 5,
  'Cupom de 10% como última chance antes de subir desconto. Inclui produtos do carrinho + similares.',
  'Hero + texto introdutório + cupom 10% + produtos do carrinho + produtos similares + reforço + trust badges.',
  'Última chance — 10% OFF no seu carrinho',
  '[
    {"type":"hero","label":"Hero","purpose":"Hero com produto e tom de urgência leve","needs_image":true},
    {"type":"text","label":"Texto","purpose":"Texto introdutório explicando a oferta de 10%","needs_image":false},
    {"type":"coupon","label":"Cupom","purpose":"Cupom de 10% OFF","needs_image":false},
    {"type":"products","label":"Produtos","purpose":"Produtos do carrinho abandonado","needs_image":false},
    {"type":"products","label":"Produtos","purpose":"Produtos similares ou complementares","needs_image":false},
    {"type":"text","label":"Texto","purpose":"Texto reforçando urgência / prazo do cupom","needs_image":false},
    {"type":"features","label":"Trust Badges","purpose":"Selos de confiança","needs_image":false},
    {"type":"footer","label":"Rodapé padrão","purpose":"Rodapé padrão","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET objective = EXCLUDED.objective,
    messaging = EXCLUDED.messaging,
    subject_hint = EXCLUDED.subject_hint,
    blocks = EXCLUDED.blocks,
    updated_at = NOW();

-- E6 — Last 12 Hours (8 blocos)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'abandoned_cart', 6,
  'Urgência forte com janela de 12 horas. Foco em fechar antes do cupom expirar.',
  'Hero + texto urgência + produtos + cupom + trust + reforço + sugestões extras.',
  'Últimas 12 horas pro seu carrinho',
  '[
    {"type":"hero","label":"Hero","purpose":"Hero com tom de urgência (12 horas)","needs_image":true},
    {"type":"text","label":"Texto","purpose":"Texto curto destacando o prazo de 12h","needs_image":false},
    {"type":"products","label":"Produtos","purpose":"Produtos do carrinho","needs_image":false},
    {"type":"coupon","label":"Cupom","purpose":"Cupom com expiração em 12h","needs_image":false},
    {"type":"features","label":"Trust Badges","purpose":"Selos de confiança","needs_image":false},
    {"type":"text","label":"Texto","purpose":"Texto reforçando escassez/urgência","needs_image":false},
    {"type":"products","label":"Produtos","purpose":"Produtos complementares pra adicionar","needs_image":false},
    {"type":"footer","label":"Rodapé padrão","purpose":"Rodapé padrão","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET objective = EXCLUDED.objective,
    messaging = EXCLUDED.messaging,
    subject_hint = EXCLUDED.subject_hint,
    blocks = EXCLUDED.blocks,
    updated_at = NOW();

-- E7 — Final Notice 12% (7 blocos)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'abandoned_cart', 7,
  'Aviso final com cupom de 12% (último escalonamento de desconto). Foco em prova social pra desfazer dúvida.',
  'Hero + produtos + cupom 12% + social proof + review + sugestões complementares.',
  'Aviso final — 12% OFF',
  '[
    {"type":"hero","label":"Hero","purpose":"Hero com tom de aviso final","needs_image":true},
    {"type":"products","label":"Produtos","purpose":"Produtos do carrinho","needs_image":false},
    {"type":"coupon","label":"Cupom","purpose":"Cupom de 12% OFF (último escalonamento)","needs_image":false},
    {"type":"social_proof","label":"Social Proof","purpose":"Contagem de clientes ou rating","needs_image":false},
    {"type":"testimonials","label":"Review","purpose":"Cards de review pra desfazer dúvida","needs_image":false},
    {"type":"products","label":"Produtos","purpose":"Produtos complementares","needs_image":false},
    {"type":"footer","label":"Rodapé padrão","purpose":"Rodapé padrão","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET objective = EXCLUDED.objective,
    messaging = EXCLUDED.messaging,
    subject_hint = EXCLUDED.subject_hint,
    blocks = EXCLUDED.blocks,
    updated_at = NOW();

-- E8 — Last Reminder + Code (2 blocos — texto + cupom)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'abandoned_cart', 8,
  'Último lembrete em formato textual curto + cupom destacado. Tom enxuto — só o essencial pra resgatar.',
  'Texto curto de despedida amigável + cupom destacado como código final. Sem hero, sem produtos.',
  'Último aviso — seu código',
  '[
    {"type":"text","label":"Texto","purpose":"Texto curto de lembrete final amigável (\"última oportunidade pra usar seu desconto\")","needs_image":false},
    {"type":"coupon","label":"Cupom","purpose":"Cupom final destacado com código (ex: BACK15) e validade","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET objective = EXCLUDED.objective,
    messaging = EXCLUDED.messaging,
    subject_hint = EXCLUDED.subject_hint,
    blocks = EXCLUDED.blocks,
    updated_at = NOW();
