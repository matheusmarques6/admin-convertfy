-- ============================================================
-- Browse abandonment blueprints — composição padrão universal (1-5)
--
-- Define a estrutura `blocks` JSONB de cada um dos 5 emails do flow
-- browse_abandonment como template default que toda loja nova herda
-- via `seedBlocksFromBlueprint`. Não é específico de nenhuma loja —
-- representa a receita genérica de browse abandonment do produto.
--
-- E1 — Something Caught Your Eye (7 blocos)
-- E2 — Still Thinking About Those Frames? (8 blocos)
-- E3 — Your Frame Is Waiting For You (10 blocos)
-- E4 — Surprise (5 blocos)
-- E5 — Last Chance (5 blocos)
--
-- Usa os 9 tipos novos adicionados em 20260627_block_types_expansion
-- (header, urgency, testimonials, features) + tipos clássicos.
--
-- UPSERT (ON CONFLICT DO UPDATE) só toca os campos relevantes
-- (objective, messaging, subject_hint, blocks, updated_at) — preserva
-- image_brief, image_aspect, image_mode e image_overlay_reserve_bottom
-- se já tiverem sido setados em migrations anteriores.
--
-- Idempotente em ambiente novo (CI/db reset) e prod.
-- ============================================================

-- E1 — Something Caught Your Eye (7 blocos)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'browse_abandonment', 1,
  'Reengajar visitante que navegou produtos sem comprar. Tom amigável, sem pressão.',
  'Lembrete suave do produto visto. Hero com produto + cupom + CTA pra voltar.',
  'Algo chamou sua atenção?',
  '[
    {"type":"header","label":"Header / Logo","purpose":"Cabeçalho com logo da loja","needs_image":false},
    {"type":"hero","label":"Hero","purpose":"Hero com produto que o visitante navegou + headline + CTA interno","needs_image":true},
    {"type":"coupon","label":"Cupom","purpose":"Cupom incentivo pra fechar a compra","needs_image":false},
    {"type":"cta","label":"CTA","purpose":"CTA logo após o cupom","needs_image":false},
    {"type":"products","label":"Produtos","purpose":"Produtos navegados + similares","needs_image":false},
    {"type":"cta","label":"CTA","purpose":"CTA final pra explorar produtos","needs_image":false},
    {"type":"footer","label":"Footer","purpose":"Rodapé padrão","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET objective = EXCLUDED.objective,
    messaging = EXCLUDED.messaging,
    subject_hint = EXCLUDED.subject_hint,
    blocks = EXCLUDED.blocks,
    updated_at = NOW();

-- E2 — Still Thinking About Those Frames? (8 blocos)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'browse_abandonment', 2,
  'Segundo toque com razões objetivas pra decidir. Foca em desfazer dúvidas.',
  'Hero + produtos + cupom + 3 razões pra escolher + urgência leve.',
  'Ainda pensando naqueles produtos?',
  '[
    {"type":"hero","label":"Hero","purpose":"Hero com produto navegado em destaque","needs_image":true},
    {"type":"products","label":"Produtos","purpose":"Produtos navegados ou recomendados","needs_image":false},
    {"type":"coupon","label":"Cupom","purpose":"Cupom de incentivo","needs_image":false},
    {"type":"cta","label":"CTA","purpose":"CTA após cupom","needs_image":false},
    {"type":"text","label":"3 Reasons","purpose":"Seção com 3 razões objetivas pra escolher (qualidade, garantia, prazo)","needs_image":false},
    {"type":"urgency","label":"Box Urgência","purpose":"Bloco destacado de urgência (ex: \"Estoque limitado\" ou \"Cupom expira em X dias\")","needs_image":false},
    {"type":"cta","label":"CTA","purpose":"CTA final urgente","needs_image":false},
    {"type":"footer","label":"Footer","purpose":"Rodapé padrão","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET objective = EXCLUDED.objective,
    messaging = EXCLUDED.messaging,
    subject_hint = EXCLUDED.subject_hint,
    blocks = EXCLUDED.blocks,
    updated_at = NOW();

-- E3 — Your Frame Is Waiting For You (10 blocos)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'browse_abandonment', 3,
  'Terceiro toque com urgência maior + prova social. Reward + review + fechamento emocional.',
  'Barra de urgência + recompensa + cupom + cards de review + texto de fechamento.',
  'Seu produto está esperando por você',
  '[
    {"type":"hero","label":"Hero","purpose":"Hero com produto em destaque","needs_image":true},
    {"type":"urgency","label":"Barra de Urgência","purpose":"Barra fina de urgência no topo (ex: \"Últimas unidades\" ou countdown)","needs_image":false},
    {"type":"text","label":"Reward","purpose":"Bloco de recompensa/bônus pra incentivar a compra (frete grátis, brinde, etc.)","needs_image":false},
    {"type":"coupon","label":"Cupom","purpose":"Cupom de desconto com código","needs_image":false},
    {"type":"cta","label":"CTA","purpose":"CTA após cupom","needs_image":false},
    {"type":"products","label":"Produtos","purpose":"Produtos navegados ou similares","needs_image":false},
    {"type":"testimonials","label":"Review","purpose":"Cards de review/depoimento de clientes que compraram","needs_image":false},
    {"type":"text","label":"Fechamento","purpose":"Texto curto de fechamento emocional pra reforçar urgência","needs_image":false},
    {"type":"cta","label":"CTA","purpose":"CTA final","needs_image":false},
    {"type":"footer","label":"Footer","purpose":"Rodapé padrão","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET objective = EXCLUDED.objective,
    messaging = EXCLUDED.messaging,
    subject_hint = EXCLUDED.subject_hint,
    blocks = EXCLUDED.blocks,
    updated_at = NOW();

-- E4 — Surprise (5 blocos)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'browse_abandonment', 4,
  'Surpresa positiva pra reativar lead frio. Tom leve, foco em produto + trust badges.',
  'Formato curto: hero + produtos + selos de confiança. Sem cupom — só lembrança visual.',
  'Surpresa pra você',
  '[
    {"type":"header","label":"Header / Logo","purpose":"Cabeçalho com logo","needs_image":false},
    {"type":"hero","label":"Hero","purpose":"Hero com produto novo ou destaque surpresa","needs_image":true},
    {"type":"products","label":"Produtos","purpose":"Produtos navegados ou novidades","needs_image":false},
    {"type":"features","label":"Trust Badges","purpose":"Strip de selos de confiança (frete grátis, troca grátis, pagamento seguro)","needs_image":false},
    {"type":"footer","label":"Footer","purpose":"Rodapé padrão","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET objective = EXCLUDED.objective,
    messaging = EXCLUDED.messaging,
    subject_hint = EXCLUDED.subject_hint,
    blocks = EXCLUDED.blocks,
    updated_at = NOW();

-- E5 — Last Chance (5 blocos)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'browse_abandonment', 5,
  'Última tentativa de reengajamento. Foco em produto + trust badges, sem cupom.',
  'Mesmo formato do E4 (hero + produtos + trust badges) mas com tom de última chamada.',
  'Última chance — não perca essa oportunidade',
  '[
    {"type":"header","label":"Header / Logo","purpose":"Cabeçalho com logo","needs_image":false},
    {"type":"hero","label":"Hero","purpose":"Hero com produto em destaque (tom de última chance)","needs_image":true},
    {"type":"products","label":"Produtos","purpose":"Produtos navegados ou recomendados","needs_image":false},
    {"type":"features","label":"Trust Badges","purpose":"Strip de selos de confiança","needs_image":false},
    {"type":"footer","label":"Footer","purpose":"Rodapé padrão","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET objective = EXCLUDED.objective,
    messaging = EXCLUDED.messaging,
    subject_hint = EXCLUDED.subject_hint,
    blocks = EXCLUDED.blocks,
    updated_at = NOW();
