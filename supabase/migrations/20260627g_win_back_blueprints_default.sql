-- ============================================================
-- Win-back blueprints — composição padrão universal (1-3)
--
-- Define a estrutura `blocks` JSONB de cada um dos 3 emails do flow
-- win_back como template default que toda loja nova herda via
-- `seedBlocksFromBlueprint`. Não é específico de nenhuma loja —
-- representa a receita genérica de reativação de cliente inativo.
--
-- E1 — We've Missed You (11 blocos)
-- E2 — We Miss You — 15% OFF (10 blocos)
-- E3 — Personal Letter (1 bloco)
--
-- Decisões de mapeamento (alinhadas com user):
--   - "Hero CTA" virou bloco cta separado (Opção A — 2 blocos adjacentes)
--   - "Customers Who Didn't Wait Section" → testimonials (cards de clientes)
--   - "Closing Urgency", "48h Remaining Block" → urgency
--   - "What's New Block" → text (título + conteúdo de novidades)
--   - "Section Title" → headline
--
-- UPSERT (ON CONFLICT DO UPDATE) só toca os campos relevantes
-- (objective, messaging, subject_hint, blocks, updated_at) — preserva
-- image_brief, image_aspect, image_mode e image_overlay_reserve_bottom
-- se já tiverem sido setados em migrations anteriores.
--
-- Idempotente em ambiente novo (CI/db reset) e prod.
-- ============================================================

-- E1 — We've Missed You (11 blocos)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'win_back', 1,
  'Reativar cliente inativo com tom emocional + novidades. Sem cupom — foco em saudade e curiosidade.',
  'Hero emocional + novidades da loja + produtos + prova social via testimonials + urgência de fechamento.',
  'Sentimos sua falta',
  '[
    {"type":"header","label":"Header","purpose":"Cabeçalho com logo da loja","needs_image":false},
    {"type":"hero","label":"Hero Section","purpose":"Hero emocional com tom de \"sentimos sua falta\"","needs_image":true},
    {"type":"cta","label":"Hero CTA","purpose":"CTA principal logo após o hero","needs_image":false},
    {"type":"text","label":"What''s New Block","purpose":"Seção de novidades da loja desde a última visita do cliente","needs_image":false},
    {"type":"cta","label":"Shop New Arrivals CTA","purpose":"CTA pra explorar as novidades","needs_image":false},
    {"type":"products","label":"Product Grid 2 Produtos","purpose":"Grade com 2 produtos destaque (novidades ou best-sellers)","needs_image":false},
    {"type":"testimonials","label":"Customers Who Didn''t Wait Section","purpose":"Cards de testimonials de clientes que voltaram e compraram (autor + quote + rating)","needs_image":false},
    {"type":"urgency","label":"Closing Urgency","purpose":"Bloco de urgência de fechamento (última chamada)","needs_image":false},
    {"type":"cta","label":"CTA","purpose":"CTA após urgência","needs_image":false},
    {"type":"features","label":"Features Icon Strip","purpose":"Strip de features (frete, garantia, troca)","needs_image":false},
    {"type":"footer","label":"Footer","purpose":"Rodapé padrão","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET objective = EXCLUDED.objective,
    messaging = EXCLUDED.messaging,
    subject_hint = EXCLUDED.subject_hint,
    blocks = EXCLUDED.blocks,
    updated_at = NOW();

-- E2 — We Miss You — 15% OFF (10 blocos)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'win_back', 2,
  'Segundo toque com cupom de 15% + countdown de 48h. Tom de oferta exclusiva pra retorno.',
  'Hero + cupom 15% + CTA hero + urgência 48h + benefícios + título + produtos + CTA final.',
  'Sentimos sua falta — 15% OFF',
  '[
    {"type":"header","label":"Header","purpose":"Cabeçalho com logo","needs_image":false},
    {"type":"hero","label":"Hero Section","purpose":"Hero com tom de retorno + 15% OFF destacado","needs_image":true},
    {"type":"coupon","label":"Coupon Block","purpose":"Cupom de 15% OFF","needs_image":false},
    {"type":"cta","label":"Hero CTA","purpose":"CTA principal do hero","needs_image":false},
    {"type":"urgency","label":"48h Remaining Block","purpose":"Bloco destacado com countdown de 48 horas","needs_image":false},
    {"type":"features","label":"Features Icon Strip","purpose":"Strip de features (frete, garantia, troca)","needs_image":false},
    {"type":"headline","label":"Section Title","purpose":"Título da seção de produtos","needs_image":false},
    {"type":"products","label":"Product Grid 2x2","purpose":"4 produtos em grade 2x2","needs_image":false},
    {"type":"cta","label":"CTA Final","purpose":"CTA final urgente pra resgatar antes do prazo","needs_image":false},
    {"type":"footer","label":"Footer","purpose":"Rodapé padrão","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET objective = EXCLUDED.objective,
    messaging = EXCLUDED.messaging,
    subject_hint = EXCLUDED.subject_hint,
    blocks = EXCLUDED.blocks,
    updated_at = NOW();

-- E3 — Personal Letter (1 bloco)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'win_back', 3,
  'Carta pessoal de fechamento. Quebra padrão comercial pra reconectar emocionalmente após 2 tentativas comerciais.',
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
