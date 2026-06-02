-- ============================================================
-- Welcome blueprints — composição padrão universal (welcome 1-8)
--
-- Define a estrutura `blocks` JSONB de cada um dos 8 emails do flow
-- welcome como template default que toda loja nova herda via
-- `seedBlocksFromBlueprint`. Não é específico de nenhuma loja —
-- representa a receita genérica de welcome series do produto.
--
-- Os blocks usam os 9 tipos novos adicionados em
-- `20260627_block_types_expansion.sql` (header, headline, features,
-- social_proof, testimonials, urgency, comparison, story, letter) +
-- tipos clássicos.
--
-- UPSERT (`ON CONFLICT DO UPDATE`) só toca os campos relevantes
-- (`objective`, `messaging`, `subject_hint`, `blocks`, `updated_at`) —
-- preserva `image_brief`, `image_aspect`, `image_mode` e
-- `image_overlay_reserve_bottom` setados em `20260623`.
--
-- Idempotente em ambiente novo (CI/db reset) e prod.
-- ============================================================

-- E1 — Welcome (10 blocos): boas-vindas + hero + cupom + produtos + social proof
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'welcome', 1,
  'Boas-vindas + apresentação da marca. Cria pertencimento e desejo no primeiro contato.',
  'Tom aspiracional, foco no universo do público. Apresenta marca + produto-herói + cupom + produtos top.',
  'Bem-vindo(a) à <brand>!',
  '[
    {"type":"header","label":"Header","purpose":"Cabeçalho com logo da loja","needs_image":false},
    {"type":"hero","label":"Hero","purpose":"Banner aspiracional com produto-herói + headline + CTA","needs_image":true},
    {"type":"text","label":"See the World Differently","purpose":"Seção de copy explicando a tese da marca","needs_image":false},
    {"type":"coupon","label":"Coupon","purpose":"Cupom de boas-vindas (ex: 10% OFF primeira compra)","needs_image":false},
    {"type":"cta","label":"Main CTA","purpose":"CTA principal logo após o cupom","needs_image":false},
    {"type":"features","label":"Features Icon Strip","purpose":"Faixa horizontal com 3-4 features (frete, troca, parcelamento)","needs_image":false},
    {"type":"products","label":"Product Grid 2x2","purpose":"4 produtos top da loja em grade 2x2","needs_image":false},
    {"type":"cta","label":"Main Shop CTA","purpose":"CTA pra explorar a loja completa","needs_image":false},
    {"type":"social_proof","label":"Social Proof","purpose":"Número de clientes felizes ou rating médio","needs_image":false},
    {"type":"footer","label":"Footer","purpose":"Rodapé padrão com links e copyright","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET
  objective = EXCLUDED.objective,
  messaging = EXCLUDED.messaging,
  subject_hint = EXCLUDED.subject_hint,
  blocks = EXCLUDED.blocks,
  updated_at = NOW();

-- E2 — Why Choose (10 blocos): razões objetivas + manchete + produtos
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'welcome', 2,
  'Prova social e razões de escolha. Reforça diferenciais com manchete forte e cupom destacado.',
  'Foco em razões objetivas: por que escolher esta marca. Termina em CTA pra produtos.',
  'Por que escolher a <brand>',
  '[
    {"type":"header","label":"Header","purpose":"Cabeçalho com logo","needs_image":false},
    {"type":"hero","label":"Hero","purpose":"Banner com produto destaque + CTA interno","needs_image":true},
    {"type":"headline","label":"Headline Block","purpose":"Manchete grandona destacada (ex: \"Why Choose <brand>\")","needs_image":false},
    {"type":"text","label":"5 Reasons","purpose":"Seção com 5 razões pra escolher (numeradas)","needs_image":false},
    {"type":"coupon","label":"10% OFF Coupon","purpose":"Cupom de 10% OFF","needs_image":false},
    {"type":"cta","label":"CTA","purpose":"CTA logo após o cupom","needs_image":false},
    {"type":"headline","label":"Section Title","purpose":"Título da seção de produtos","needs_image":false},
    {"type":"products","label":"Product Grid 2x2","purpose":"4 produtos em grade 2x2","needs_image":false},
    {"type":"cta","label":"Main CTA","purpose":"CTA final pra loja","needs_image":false},
    {"type":"footer","label":"Footer","purpose":"Rodapé padrão","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET
  objective = EXCLUDED.objective,
  messaging = EXCLUDED.messaging,
  subject_hint = EXCLUDED.subject_hint,
  blocks = EXCLUDED.blocks,
  updated_at = NOW();

-- E3 — Brand Story (9 blocos)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'welcome', 3,
  'Storytelling de fundação da marca. Constrói confiança e humaniza a relação com o cliente.',
  'História da marca em formato card + diferenciais. Tom mais íntimo, narrativo.',
  'A história por trás da <brand>',
  '[
    {"type":"header","label":"Header","purpose":"Cabeçalho com logo","needs_image":false},
    {"type":"story","label":"Brand Story Card","purpose":"Card com fundação, missão e valores da marca + CTA interno","needs_image":false},
    {"type":"text","label":"What Makes Different","purpose":"Seção destacando diferenciais únicos","needs_image":false},
    {"type":"coupon","label":"Coupon","purpose":"Cupom de boas-vindas","needs_image":false},
    {"type":"cta","label":"CTA","purpose":"CTA após o cupom","needs_image":false},
    {"type":"headline","label":"Section Title","purpose":"Título da seção de produtos","needs_image":false},
    {"type":"products","label":"Product Grid 2x2","purpose":"4 produtos em grade","needs_image":false},
    {"type":"cta","label":"Main CTA","purpose":"CTA final","needs_image":false},
    {"type":"footer","label":"Footer","purpose":"Rodapé padrão","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET
  objective = EXCLUDED.objective,
  messaging = EXCLUDED.messaging,
  subject_hint = EXCLUDED.subject_hint,
  blocks = EXCLUDED.blocks,
  updated_at = NOW();

-- E4 — Testimonials (10 blocos)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'welcome', 4,
  'Prova social via depoimentos reais. Hero com cupom em destaque, cards de depoimento, badge de avaliação.',
  'Foco em testimonials autênticos + selo de avaliação. Tom de confiança.',
  'Veja o que estão falando da <brand>',
  '[
    {"type":"header","label":"Header","purpose":"Cabeçalho com logo","needs_image":false},
    {"type":"hero","label":"Hero","purpose":"Hero com fundo destacado","needs_image":true},
    {"type":"coupon","label":"Coupon over Hero","purpose":"Cupom destacado em cima do hero","needs_image":false},
    {"type":"cta","label":"Top CTA orange","purpose":"CTA laranja logo após o cupom","needs_image":false},
    {"type":"features","label":"Features Icon Strip","purpose":"Strip de features com ícones","needs_image":false},
    {"type":"headline","label":"Testimonials Headline","purpose":"Título da seção de depoimentos","needs_image":false},
    {"type":"testimonials","label":"Testimonial Cards","purpose":"2-3 cards com quotes de clientes (autor + texto + rating)","needs_image":false},
    {"type":"social_proof","label":"Review Badge","purpose":"Selo de avaliação (4.8/5 stars com X avaliações)","needs_image":false},
    {"type":"cta","label":"Final CTA","purpose":"CTA final pra explorar a loja","needs_image":false},
    {"type":"footer","label":"Footer","purpose":"Rodapé padrão","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET
  objective = EXCLUDED.objective,
  messaging = EXCLUDED.messaging,
  subject_hint = EXCLUDED.subject_hint,
  blocks = EXCLUDED.blocks,
  updated_at = NOW();

-- E5 — Comparison (9 blocos)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'welcome', 5,
  'Diferenciação via comparação direta com concorrentes. Mostra superioridade de forma objetiva.',
  'Tabela comparativa <brand> vs outras lojas. Tom direto, factual.',
  '<brand> vs outras lojas — você decide',
  '[
    {"type":"header","label":"Header","purpose":"Cabeçalho com logo","needs_image":false},
    {"type":"headline","label":"Headline Block","purpose":"Manchete principal da comparação","needs_image":false},
    {"type":"headline","label":"OZORIC Label","purpose":"Label de marca destacado","needs_image":false},
    {"type":"comparison","label":"Comparison Section","purpose":"Tabela com 4-6 linhas comparando atributos (preço, prazo, qualidade)","needs_image":false},
    {"type":"coupon","label":"Coupon","purpose":"Cupom de boas-vindas","needs_image":false},
    {"type":"cta","label":"CTA","purpose":"CTA após cupom","needs_image":false},
    {"type":"products","label":"Product Grid 2x2","purpose":"4 produtos em grade","needs_image":false},
    {"type":"cta","label":"Main CTA","purpose":"CTA final","needs_image":false},
    {"type":"footer","label":"Footer","purpose":"Rodapé padrão","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET
  objective = EXCLUDED.objective,
  messaging = EXCLUDED.messaging,
  subject_hint = EXCLUDED.subject_hint,
  blocks = EXCLUDED.blocks,
  updated_at = NOW();

-- E6 — Urgency 12 Hours (11 blocos)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'welcome', 6,
  'Última chamada com urgência forte: prazo de 12h. Combina prova social + escassez + cupom.',
  'Tom de urgência leve mas firme. Mostra clientes recentes, escassez, tempo restante.',
  'Últimas 12 horas: seu cupom está expirando',
  '[
    {"type":"header","label":"Header","purpose":"Cabeçalho com logo","needs_image":false},
    {"type":"hero","label":"Hero","purpose":"Hero com produto destaque","needs_image":true},
    {"type":"social_proof","label":"412 Customers Block","purpose":"Bloco mostrando número de clientes recentes (ex: \"412 compraram esta semana\")","needs_image":false},
    {"type":"urgency","label":"Scarcity Line","purpose":"Linha curta de escassez (ex: \"Apenas X unidades restantes\")","needs_image":false},
    {"type":"coupon","label":"Coupon","purpose":"Cupom com prazo de expiração","needs_image":false},
    {"type":"cta","label":"CTA","purpose":"CTA após o cupom","needs_image":false},
    {"type":"testimonials","label":"Testimonial Cards","purpose":"Cards de depoimentos pra reforçar confiança","needs_image":false},
    {"type":"urgency","label":"Expiration Urgency Block","purpose":"Bloco de urgência destacado (ex: countdown ou \"Expira em 12h\")","needs_image":false},
    {"type":"cta","label":"CTA","purpose":"CTA final urgente","needs_image":false},
    {"type":"features","label":"Features Icon Strip","purpose":"Features pra reforçar valor","needs_image":false},
    {"type":"footer","label":"Footer","purpose":"Rodapé padrão","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET
  objective = EXCLUDED.objective,
  messaging = EXCLUDED.messaging,
  subject_hint = EXCLUDED.subject_hint,
  blocks = EXCLUDED.blocks,
  updated_at = NOW();

-- E7 — Last Chance (4 blocos)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'welcome', 7,
  'Última chance — formato curto e direto. Foco total no cupom expirando.',
  'Email enxuto: só cupom + CTA. Tom de urgência máxima.',
  'Última chance — seu cupom expira hoje',
  '[
    {"type":"header","label":"Header","purpose":"Cabeçalho com logo","needs_image":false},
    {"type":"coupon","label":"Coupon","purpose":"Cupom com prazo expirando","needs_image":false},
    {"type":"cta","label":"CTA","purpose":"CTA urgente pra resgatar","needs_image":false},
    {"type":"footer","label":"Footer","purpose":"Rodapé padrão","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET
  objective = EXCLUDED.objective,
  messaging = EXCLUDED.messaging,
  subject_hint = EXCLUDED.subject_hint,
  blocks = EXCLUDED.blocks,
  updated_at = NOW();

-- E8 — Personal Letter (2 blocos)
INSERT INTO email_blueprints (
  flow_type, email_number, objective, messaging, subject_hint, blocks
)
VALUES (
  'welcome', 8,
  'Carta pessoal do fundador. Quebra padrão visual com formato puramente textual.',
  'Tom íntimo, formato carta. Sem CTAs comerciais — só conexão humana.',
  'Uma mensagem pessoal pra você',
  '[
    {"type":"letter","label":"Letter Card","purpose":"Carta pessoal do fundador (greeting + body longo + assinatura)","needs_image":false},
    {"type":"footer","label":"Plain Footer Line","purpose":"Footer simples, sem links, só copyright minimalista","needs_image":false}
  ]'::jsonb
)
ON CONFLICT (flow_type, email_number) DO UPDATE
SET
  objective = EXCLUDED.objective,
  messaging = EXCLUDED.messaging,
  subject_hint = EXCLUDED.subject_hint,
  blocks = EXCLUDED.blocks,
  updated_at = NOW();
