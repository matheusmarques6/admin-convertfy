-- ============================================================
-- CRM Convertfy — Fase 1: Seed dos 8 pipelines core
--
-- Pipelines criados (todos com is_default=false pra nao conflitar
-- com a "pipeline padrao" historica do projeto):
--
--   COMERCIAL (scope='sales'):
--     1. Funil Inbound        — leads de Ads/Site
--     2. Funil Outbound       — prospeccao ativa
--     3. Indicacoes & Parceiros
--
--   CUSTOMER SUCCESS (scope='cs'):
--     4. Onboarding 30d
--     5. Gestao de Carteira (state-based, layout='state')
--     6. Feedback Mensal de Resultado
--     7. Implementacoes & Campanhas
--     8. Tickets de Cliente
-- ============================================================

DO $$
DECLARE
  v_pipeline_id UUID;
  v_admin_id UUID;
BEGIN

-- Pega um admin pra ser created_by (ou NULL se nao houver).
SELECT id INTO v_admin_id FROM profiles WHERE role = 'admin' LIMIT 1;

-- ─────────────────────────────────────────────────────────────
-- 1. Funil Inbound (sales) — Ads e formulario do site
-- ─────────────────────────────────────────────────────────────
INSERT INTO pipelines (name, description, scope, color, is_default, layout, created_by)
VALUES (
  'Funil Inbound',
  'Negociacoes vindas de Ads (Meta, Google, YouTube) e formulario do site. Velocidade de resposta e o principal preditor de conversao.',
  'sales', '#1F1F1F', false, 'kanban', v_admin_id
)
RETURNING id INTO v_pipeline_id;

INSERT INTO pipeline_stages (pipeline_id, name, color, "order", stage_type, sla_hours, exit_criteria) VALUES
  (v_pipeline_id, 'Lead novo',           '#71717A', 1, 'open', 1,    'Lead criado, ainda nao contactado'),
  (v_pipeline_id, 'Tentativa de contato','#854D0E', 2, 'open', 24,   'Primeira tentativa feita (WhatsApp, ligacao, email)'),
  (v_pipeline_id, 'Conversa iniciada',   '#0284C7', 3, 'open', 48,   'Lead respondeu'),
  (v_pipeline_id, 'Qualificado',         '#1D4ED8', 4, 'open', 72,   'Pessoa de decisao confirmada, fit confirmado'),
  (v_pipeline_id, 'Reuniao agendada',    '#7C3AED', 5, 'open', NULL, 'Booking confirmado (cal.com / agenda)'),
  (v_pipeline_id, 'Reuniao realizada',   '#6D28D9', 6, 'open', 48,   'Reuniao aconteceu (presenca confirmada)'),
  (v_pipeline_id, 'Proposta enviada',    '#EA580C', 7, 'open', 168,  'Documento de proposta entregue'),
  (v_pipeline_id, 'Negociacao',          '#C2410C', 8, 'open', 168,  'Proposta em revisao pelo lead'),
  (v_pipeline_id, 'Ganho',               '#047857', 9, 'won',  NULL, 'Contrato assinado, primeiro pagamento confirmado'),
  (v_pipeline_id, 'Perdido — sem fit',   '#52525B',10, 'lost', NULL, 'Nao e nosso ICP'),
  (v_pipeline_id, 'Perdido — preco',     '#B91C1C',11, 'lost', NULL, 'Lead achou caro'),
  (v_pipeline_id, 'Perdido — timing',    '#B91C1C',12, 'lost', NULL, 'Volta depois — followup 60d'),
  (v_pipeline_id, 'Perdido — concorrente','#991B1B',13,'lost', NULL, 'Concorrente fechou'),
  (v_pipeline_id, 'No-show',             '#991B1B',14, 'lost', NULL, 'Nao apareceu na reuniao 2x');

-- ─────────────────────────────────────────────────────────────
-- 2. Funil Outbound (sales)
-- ─────────────────────────────────────────────────────────────
INSERT INTO pipelines (name, description, scope, color, is_default, layout, created_by)
VALUES (
  'Funil Outbound',
  'Prospeccao ativa: listas curadas de e-commerces. Cadencia de touchpoints estruturada (1, 2, 3) com follow-ups.',
  'sales', '#1F1F1F', false, 'kanban', v_admin_id
)
RETURNING id INTO v_pipeline_id;

INSERT INTO pipeline_stages (pipeline_id, name, color, "order", stage_type, sla_hours, exit_criteria) VALUES
  (v_pipeline_id, 'Lista',              '#71717A', 1, 'open', NULL, 'Lead adicionado a lista'),
  (v_pipeline_id, 'Pesquisa feita',     '#A1A1AA', 2, 'open', 48,   'Investigacao basica (porte, stack, dor)'),
  (v_pipeline_id, 'Touchpoint 1',       '#0284C7', 3, 'open', 24,   'Mensagem inicial enviada'),
  (v_pipeline_id, 'Touchpoint 2',       '#0284C7', 4, 'open', 120,  'Follow-up 1 enviado'),
  (v_pipeline_id, 'Touchpoint 3',       '#1D4ED8', 5, 'open', 120,  'Follow-up 2 enviado'),
  (v_pipeline_id, 'Resposta recebida',  '#10B981', 6, 'open', 24,   'Lead respondeu (positiva/negativa/neutra)'),
  (v_pipeline_id, 'Discovery agendado', '#7C3AED', 7, 'open', NULL, 'Booking de discovery confirmado'),
  (v_pipeline_id, 'Discovery realizado','#6D28D9', 8, 'open', 48,   'Call aconteceu'),
  (v_pipeline_id, 'Proposta enviada',   '#EA580C', 9, 'open', 168,  'Proposta entregue'),
  (v_pipeline_id, 'Negociacao',         '#C2410C',10, 'open', 168,  'Em discussao'),
  (v_pipeline_id, 'Ganho',              '#047857',11, 'won',  NULL, 'Fechado'),
  (v_pipeline_id, 'Cold (sem resposta)','#3F3F46',12, 'lost', NULL, 'Apos 3 touchpoints — revisitar em 6 meses'),
  (v_pipeline_id, 'Perdido — sem fit',  '#52525B',13, 'lost', NULL, NULL),
  (v_pipeline_id, 'Perdido — sem interesse','#B91C1C',14,'lost', NULL, NULL);

-- ─────────────────────────────────────────────────────────────
-- 3. Indicacoes & Parceiros (sales)
-- ─────────────────────────────────────────────────────────────
INSERT INTO pipelines (name, description, scope, color, is_default, layout, created_by)
VALUES (
  'Indicacoes & Parceiros',
  'Referrals de clientes existentes e parceiros. Conversao 10-30x maior que outbound — pipeline separado pra acompanhar performance dos indicadores.',
  'sales', '#047857', false, 'kanban', v_admin_id
)
RETURNING id INTO v_pipeline_id;

INSERT INTO pipeline_stages (pipeline_id, name, color, "order", stage_type, sla_hours, exit_criteria) VALUES
  (v_pipeline_id, 'Indicacao recebida', '#0284C7', 1, 'open', 24,   'Parceiro/cliente passou contato'),
  (v_pipeline_id, 'Contato feito',      '#1D4ED8', 2, 'open', 48,   'Conversa com o lead'),
  (v_pipeline_id, 'Reuniao agendada',   '#7C3AED', 3, 'open', NULL, 'Booking'),
  (v_pipeline_id, 'Reuniao realizada',  '#6D28D9', 4, 'open', 48,   'Aconteceu'),
  (v_pipeline_id, 'Proposta enviada',   '#EA580C', 5, 'open', 120,  'Proposta entregue'),
  (v_pipeline_id, 'Ganho',              '#047857', 6, 'won',  NULL, 'Fechado'),
  (v_pipeline_id, 'Perdido',            '#B91C1C', 7, 'lost', NULL, 'Com motivo registrado');

-- ─────────────────────────────────────────────────────────────
-- 4. Onboarding 30d (cs) — primeiro pipeline pos-venda
-- ─────────────────────────────────────────────────────────────
INSERT INTO pipelines (name, description, scope, color, is_default, layout, created_by)
VALUES (
  'Onboarding 30d',
  'Onboarding obrigatorio dos primeiros 30 dias. 86% dos clientes dizem que onboarding influencia retencao. Cada cliente novo entra aqui automaticamente apos won.',
  'cs', '#0284C7', false, 'kanban', v_admin_id
)
RETURNING id INTO v_pipeline_id;

INSERT INTO pipeline_stages (pipeline_id, name, color, "order", stage_type, sla_hours, exit_criteria) VALUES
  (v_pipeline_id, 'Pre-onboarding',         '#0284C7', 1, 'open', 24,  'Welcome email enviado, kickoff agendado'),
  (v_pipeline_id, 'Kickoff realizado',      '#1D4ED8', 2, 'open', 168, 'Reuniao de kickoff aconteceu, escopo confirmado'),
  (v_pipeline_id, 'Acessos coletados',      '#1E40AF', 3, 'open', 120, 'Logins de Klaviyo/Omnisend, Shopify, GA4, Meta Ads coletados'),
  (v_pipeline_id, 'Integracoes conectadas', '#1E3A8A', 4, 'open', 72,  'Todas integracoes sincronizando no admin'),
  (v_pipeline_id, 'Auditoria entregue',     '#EA580C', 5, 'open', 240, 'Documento de auditoria inicial entregue ao cliente'),
  (v_pipeline_id, 'Estrategia validada',    '#C2410C', 6, 'open', 168, 'Cliente aprovou plano de acao'),
  (v_pipeline_id, 'Primeira entrega aprovada','#10B981', 7, 'open', 720, 'Primeira campanha/automacao live e aprovada'),
  (v_pipeline_id, 'Onboarding concluido',   '#047857', 8, 'won',  NULL,'Cliente em operacao continua → migra para Carteira'),
  (v_pipeline_id, 'Bloqueado',              '#B91C1C', 9, 'lost', 168, 'Algo travando ha mais de 7 dias');

-- ─────────────────────────────────────────────────────────────
-- 5. Gestao de Carteira (cs, state-based)
-- ─────────────────────────────────────────────────────────────
INSERT INTO pipelines (name, description, scope, color, is_default, layout, created_by)
VALUES (
  'Gestao de Carteira',
  'Saude da carteira ativa. Cada cliente vive em UMA etapa = estado da conta (nao funil progressivo). Health score recalculado diariamente.',
  'cs', '#10B981', false, 'state', v_admin_id
)
RETURNING id INTO v_pipeline_id;

INSERT INTO pipeline_stages (pipeline_id, name, color, "order", stage_type, sla_hours, exit_criteria, description) VALUES
  (v_pipeline_id, 'Saudavel',          '#047857', 1, 'open', NULL, 'Score 80-100', 'Pagamento em dia + receita estavel + NPS positivo + integracoes OK'),
  (v_pipeline_id, 'Atencao',           '#854D0E', 2, 'open', 168,  'Score 60-79', 'Queda 15-30%, atraso 1-7 dias, NPS neutro'),
  (v_pipeline_id, 'Risco',             '#B91C1C', 3, 'open', 72,   'Score 30-59', 'Queda > 30%, atraso > 7d, NPS negativo'),
  (v_pipeline_id, 'Em recuperacao',    '#C2410C', 4, 'open', 168,  'Score < 30 com plano ativo', 'CSM iniciou plano formal'),
  (v_pipeline_id, 'Churn iminente',    '#3F3F46', 5, 'open', NULL, 'Cliente avisou cancelamento', 'Reuniao de retencao ou aceitacao'),
  (v_pipeline_id, 'Churn',             '#18181B', 6, 'lost', NULL, 'Cancelou', 'Migra para pipeline Recuperacao');

-- ─────────────────────────────────────────────────────────────
-- 6. Feedback Mensal de Resultado (cs, recorrente)
-- ─────────────────────────────────────────────────────────────
INSERT INTO pipelines (name, description, scope, color, is_default, layout, created_by)
VALUES (
  'Feedback Mensal',
  'Reuniao formal mensal de resultados — principal momento de demonstrar valor. Card recorrente: virou mes, novo card pra cada cliente ativo.',
  'cs', '#7C3AED', false, 'kanban', v_admin_id
)
RETURNING id INTO v_pipeline_id;

INSERT INTO pipeline_stages (pipeline_id, name, color, "order", stage_type, sla_hours, exit_criteria) VALUES
  (v_pipeline_id, 'A iniciar',         '#71717A', 1, 'open', 48,  'Mes fechou, report ainda nao comecou'),
  (v_pipeline_id, 'Coleta de dados',   '#0284C7', 2, 'open', 72,  'Especialistas puxando numeros (Klaviyo, GA4, Meta, Shopify)'),
  (v_pipeline_id, 'Analise feita',     '#1D4ED8', 3, 'open', 48,  'CSM consolidou narrativa'),
  (v_pipeline_id, 'Report finalizado', '#EA580C', 4, 'open', 24,  'Documento pronto pra envio'),
  (v_pipeline_id, 'Reuniao agendada',  '#7C3AED', 5, 'open', 120, 'Cliente confirmou agenda'),
  (v_pipeline_id, 'Reuniao realizada', '#6D28D9', 6, 'open', 24,  'Apresentacao aconteceu'),
  (v_pipeline_id, 'NPS coletado',      '#10B981', 7, 'open', 72,  'Pesquisa enviada e respondida'),
  (v_pipeline_id, 'Concluido',         '#047857', 8, 'won',  NULL,'Tudo registrado');

-- ─────────────────────────────────────────────────────────────
-- 7. Implementacoes & Campanhas (cs)
-- ─────────────────────────────────────────────────────────────
INSERT INTO pipelines (name, description, scope, color, is_default, layout, created_by)
VALUES (
  'Implementacoes & Campanhas',
  'Projetos pontuais: implementar fluxo, preparar campanha sazonal, migrar de Klaviyo pra Omnisend. Cada card e um projeto com escopo definido.',
  'cs', '#EA580C', false, 'kanban', v_admin_id
)
RETURNING id INTO v_pipeline_id;

INSERT INTO pipeline_stages (pipeline_id, name, color, "order", stage_type, sla_hours, exit_criteria) VALUES
  (v_pipeline_id, 'Briefing',           '#71717A', 1, 'open', 48,  'Escopo coletado, alinhado'),
  (v_pipeline_id, 'Em producao',        '#0284C7', 2, 'open', 168, 'Time interno produzindo (criativo, copy, configuracao)'),
  (v_pipeline_id, 'Revisao interna',    '#1D4ED8', 3, 'open', 48,  'Aprovacao da lideranca antes do cliente'),
  (v_pipeline_id, 'Aprovacao cliente',  '#7C3AED', 4, 'open', 72,  'Cliente aprovou'),
  (v_pipeline_id, 'No ar',              '#10B981', 5, 'open', NULL,'Implementacao live'),
  (v_pipeline_id, 'Resultado avaliado', '#EA580C', 6, 'open', 336, 'Pos-mortem em 14 dias'),
  (v_pipeline_id, 'Concluido',          '#047857', 7, 'won',  NULL,'Documentado, fechado'),
  (v_pipeline_id, 'Bloqueado',          '#854D0E', 8, 'open', NULL,'Cliente nao aprova ou problema tecnico'),
  (v_pipeline_id, 'Cancelado',          '#B91C1C', 9, 'lost', NULL,'Cliente cancelou o projeto');

-- ─────────────────────────────────────────────────────────────
-- 8. Tickets de Cliente (cs)
-- ─────────────────────────────────────────────────────────────
INSERT INTO pipelines (name, description, scope, color, is_default, layout, created_by)
VALUES (
  'Tickets de Cliente',
  'Pedidos diarios pequenos do cliente: ajustar copy, criar promocao rapida, etc. Diferente de Implementacoes (projeto formal) — aqui e demanda diaria.',
  'cs', '#A1A1AA', false, 'kanban', v_admin_id
)
RETURNING id INTO v_pipeline_id;

INSERT INTO pipeline_stages (pipeline_id, name, color, "order", stage_type, sla_hours, exit_criteria) VALUES
  (v_pipeline_id, 'Recebido',           '#71717A', 1, 'open', 4,   'Pedido entrou'),
  (v_pipeline_id, 'Avaliado',           '#0284C7', 2, 'open', 8,   'CSM/especialista classificou prioridade e escopo'),
  (v_pipeline_id, 'Em producao',        '#1D4ED8', 3, 'open', 48,  'Time trabalhando'),
  (v_pipeline_id, 'Entregue',           '#10B981', 4, 'open', 24,  'Material/ajuste enviado ao cliente'),
  (v_pipeline_id, 'Aprovado pelo cliente','#047857', 5,'open', 24,  'Cliente confirmou'),
  (v_pipeline_id, 'Concluido',          '#047857', 6, 'won',  NULL,'Fechado'),
  (v_pipeline_id, 'Recusado',           '#854D0E', 7, 'lost', NULL,'Fora do escopo (cobranca extra)'),
  (v_pipeline_id, 'Bloqueado',          '#B91C1C', 8, 'open', NULL,'Aguardando informacao do cliente');

END $$;

-- ── Tags default do CRM ──────────────────────────────────────
INSERT INTO tags (name, color, entity_type) VALUES
  ('Inbound',         '#0284C7', 'deal'),
  ('Outbound',        '#71717A', 'deal'),
  ('Ads Facebook',    '#1877F2', 'deal'),
  ('Ads Google',      '#4285F4', 'deal'),
  ('Ads YouTube',     '#FF0000', 'deal'),
  ('Ads TikTok',      '#000000', 'deal'),
  ('Form site',       '#10B981', 'deal'),
  ('Indicacao',       '#047857', 'deal'),
  ('Demo solicitada', '#7C3AED', 'deal'),
  ('Black Friday',    '#18181B', 'deal'),
  ('Renovacao',       '#10B981', 'deal'),
  ('Upsell',          '#EA580C', 'deal'),
  ('Urgente',         '#B91C1C', 'deal')
ON CONFLICT DO NOTHING;
