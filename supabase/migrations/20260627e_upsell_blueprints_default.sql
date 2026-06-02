-- ============================================================
-- Upsell blueprints — composição padrão universal (1-4)
--
-- Define a estrutura `blocks` JSONB de cada um dos 4 emails do flow
-- upsell como template default que toda loja nova herda via
-- `seedBlocksFromBlueprint`. Não é específico de nenhuma loja —
-- representa a receita genérica de upsell pós-compra do produto.
--
-- E1 — Your Next Pair Is Waiting (16 blocos)
-- E2 — 17% OFF Expires Soon (14 blocos)
-- E3 — Last Chance — Expires Today (10 blocos)
-- E4 — Personal Letter (1 bloco)
--
-- Decisões de mapeamento (alinhadas com user):
--   - "Coupon + CTA" no E1 vira 2 blocos adjacentes (coupon + cta)
--   - "Exclusive Offer Pill" → urgency (pílula colorida com destaque)
--   - "17% OFF Big Visual" → headline (manchete grande com número)
--   - "Stat Block" e "Big Rating Badge" → social_proof
--   - "Reviews Section Header" → headline (título da seção)
--
-- UPSERT (ON CONFLICT DO UPDATE) só toca os campos relevantes
-- (objective, messaging, subject_hint, blocks, updated_at) — preserva
-- image_brief, image_aspect, image_mode e image_overlay_reserve_bottom
-- se já tiverem sido setados em migrations anteriores.
--
-- Idempotente em ambiente novo (CI/db reset) e prod.
-- ============================================================

-- E1 — Your Next Pair Is Waiting (16 blocos)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'upsell', 1,
  'Apresenta a próxima compra como continuação natural. Combina prova social forte + desconto destacado + countdown.',
  'Hero + stats + pílula de oferta + manchete de desconto + cupom + reviews + rating + produtos + countdown + reforço de coupon+cta + urgência de fechamento.',
  'Seu próximo par está esperando',
  '[
    {"type":"header","label":"Header","purpose":"Cabeçalho com logo da loja","needs_image":false},
    {"type":"hero","label":"Hero Section","purpose":"Hero com produto destaque + headline de continuação","needs_image":true},
    {"type":"social_proof","label":"Stat Block","purpose":"Bloco com estatística forte (ex: \"412 clientes recompraram esta semana\")","needs_image":false},
    {"type":"urgency","label":"Exclusive Offer Pill","purpose":"Pílula/label destacada com tom de exclusividade (ex: \"OFERTA EXCLUSIVA\")","needs_image":false},
    {"type":"headline","label":"17% OFF Big Visual","purpose":"Manchete grandona com o desconto destacado (ex: \"17% OFF\")","needs_image":false},
    {"type":"cta","label":"CTA","purpose":"CTA principal logo após o desconto","needs_image":false},
    {"type":"coupon","label":"Coupon Block","purpose":"Cartão de cupom com código","needs_image":false},
    {"type":"headline","label":"Reviews Section Header","purpose":"Título da seção de depoimentos","needs_image":false},
    {"type":"testimonials","label":"4 Testimonial Cards","purpose":"Até 4 cards de depoimento (autor + quote + rating)","needs_image":false},
    {"type":"social_proof","label":"Big Rating Badge","purpose":"Selo de rating grandão (ex: \"4.9/5 com 1.2k avaliações\")","needs_image":false},
    {"type":"products","label":"Product Grid 2x2","purpose":"4 produtos recomendados em grade 2x2","needs_image":false},
    {"type":"urgency","label":"Countdown Block","purpose":"Bloco de countdown com prazo do cupom","needs_image":false},
    {"type":"coupon","label":"Coupon","purpose":"Cupom de reforço próximo do fim","needs_image":false},
    {"type":"cta","label":"CTA","purpose":"CTA logo após o cupom de reforço","needs_image":false},
    {"type":"urgency","label":"Closing Urgency","purpose":"Bloco de urgência de fechamento (última chamada)","needs_image":false},
    {"type":"footer","label":"Footer","purpose":"Rodapé padrão","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET objective = EXCLUDED.objective,
    messaging = EXCLUDED.messaging,
    subject_hint = EXCLUDED.subject_hint,
    blocks = EXCLUDED.blocks,
    updated_at = NOW();

-- E2 — 17% OFF Expires Soon (14 blocos)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'upsell', 2,
  'Reforço do desconto com countdown vivo. Combina cupom + lembrete + benefícios + visual grandão.',
  'Hero + cupom + CTA hero + reminder + countdown + cupom + CTA + benefícios + 17% OFF visual + produtos + CTA + social proof.',
  '17% OFF expira em breve',
  '[
    {"type":"header","label":"Header","purpose":"Cabeçalho com logo","needs_image":false},
    {"type":"hero","label":"Hero Section","purpose":"Hero com produto destaque","needs_image":true},
    {"type":"coupon","label":"Coupon Block","purpose":"Cupom destacado no topo","needs_image":false},
    {"type":"cta","label":"CTA Hero","purpose":"CTA principal do hero","needs_image":false},
    {"type":"text","label":"Reminder Section","purpose":"Seção de lembrete explicando a oferta","needs_image":false},
    {"type":"urgency","label":"Countdown Live","purpose":"Countdown vivo com tempo restante","needs_image":false},
    {"type":"coupon","label":"Coupon","purpose":"Cupom de reforço","needs_image":false},
    {"type":"cta","label":"CTA","purpose":"CTA após cupom","needs_image":false},
    {"type":"features","label":"Benefits","purpose":"Strip de benefícios (frete, garantia, troca)","needs_image":false},
    {"type":"headline","label":"17% OFF Big Visual","purpose":"Manchete grandona com o desconto destacado","needs_image":false},
    {"type":"products","label":"Product Grid 2x2","purpose":"4 produtos em grade 2x2","needs_image":false},
    {"type":"cta","label":"CTA","purpose":"CTA final após produtos","needs_image":false},
    {"type":"social_proof","label":"Social Proof Block","purpose":"Bloco de prova social (contagem ou rating)","needs_image":false},
    {"type":"footer","label":"Footer","purpose":"Rodapé padrão","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET objective = EXCLUDED.objective,
    messaging = EXCLUDED.messaging,
    subject_hint = EXCLUDED.subject_hint,
    blocks = EXCLUDED.blocks,
    updated_at = NOW();

-- E3 — Last Chance — Expires Today (10 blocos)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'upsell', 3,
  'Última chance hoje. Tom de urgência máxima com 2 blocos de \"last chance\" cercando produtos.',
  'Hero + last chance + cupom + CTA + produtos + features + last chance + CTA final.',
  'Última chance — expira hoje',
  '[
    {"type":"header","label":"Header","purpose":"Cabeçalho com logo","needs_image":false},
    {"type":"hero","label":"Hero Section","purpose":"Hero com tom de última chamada","needs_image":true},
    {"type":"urgency","label":"Last Chance Big Block","purpose":"Bloco grandão de última chance (destaque vermelho/laranja)","needs_image":false},
    {"type":"coupon","label":"Coupon Block","purpose":"Cupom expirando hoje","needs_image":false},
    {"type":"cta","label":"CTA","purpose":"CTA após cupom","needs_image":false},
    {"type":"products","label":"Product Grid 2x2","purpose":"4 produtos em grade","needs_image":false},
    {"type":"features","label":"Features Icon Strip","purpose":"Strip de features (selos de confiança)","needs_image":false},
    {"type":"urgency","label":"Last Chance Block","purpose":"Segundo bloco de last chance (reforço)","needs_image":false},
    {"type":"cta","label":"Final CTA","purpose":"CTA final urgente","needs_image":false},
    {"type":"footer","label":"Footer","purpose":"Rodapé padrão","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET objective = EXCLUDED.objective,
    messaging = EXCLUDED.messaging,
    subject_hint = EXCLUDED.subject_hint,
    blocks = EXCLUDED.blocks,
    updated_at = NOW();

-- E4 — Personal Letter (1 bloco)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'upsell', 4,
  'Carta pessoal de fechamento. Quebra padrão comercial pra reconectar emocionalmente.',
  'Letter card único — tom íntimo, sem CTAs comerciais.',
  'Uma mensagem pessoal pra você',
  '[
    {"type":"letter","label":"Letter Card","purpose":"Carta pessoal do fundador (greeting + body longo + assinatura)","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET objective = EXCLUDED.objective,
    messaging = EXCLUDED.messaging,
    subject_hint = EXCLUDED.subject_hint,
    blocks = EXCLUDED.blocks,
    updated_at = NOW();
