-- ============================================================
-- Seed: pipelines CS de Renovacao e Win-back
-- ============================================================
-- Complementa o seed CRM Fase 1 (20260507_crm_phase1_seed.sql) que ja
-- criou Onboarding 30d, Gestao de Carteira, Feedback Mensal,
-- Implementacoes & Campanhas, Tickets de Cliente.
--
-- Adiciona 2 pipelines CS especificos:
--   1. Renovacao de Contrato — 60d antes do contract_end_date
--   2. Win-back — clientes cancelados (recuperacao em ate 90d)
--
-- Idempotente: so cria se nao existe pipeline com mesmo (name, scope).
-- ============================================================

DO $$
DECLARE
  v_pipeline_id UUID;
  v_admin_id UUID;
  v_exists BOOLEAN;
BEGIN

-- Admin pra created_by (pode ser NULL se nao houver)
SELECT id INTO v_admin_id FROM profiles WHERE role = 'admin' LIMIT 1;

-- ─────────────────────────────────────────────────────────────
-- 1. Renovacao de Contrato (cs)
-- ─────────────────────────────────────────────────────────────
SELECT EXISTS (
  SELECT 1 FROM pipelines WHERE name = 'Renovacao de Contrato' AND scope = 'cs'
) INTO v_exists;

IF NOT v_exists THEN
  INSERT INTO pipelines (name, description, scope, color, category, is_default, layout, created_by)
  VALUES (
    'Renovacao de Contrato',
    'Clientes com contract_end_date a vencer em ate 60 dias. Foco em garantir continuidade, expandir escopo e evitar churn.',
    'cs', '#7C3AED', 'Renovacao', false, 'kanban', v_admin_id
  )
  RETURNING id INTO v_pipeline_id;

  INSERT INTO pipeline_stages (pipeline_id, name, color, "order", stage_type, sla_hours, exit_criteria) VALUES
    (v_pipeline_id, 'Renovacao iniciada',     '#8B5CF6',  1, 'open',  48,
      'Loja entrou na janela de 60d antes do vencimento. CSM faz primeiro contato preventivo.'),
    (v_pipeline_id, 'Diagnostico de resultado','#7C3AED',  2, 'open', 168,
      'Reuniao de balanco — apresentar resultados do ciclo + propor proximas iniciativas.'),
    (v_pipeline_id, 'Proposta de renovacao',  '#6D28D9',  3, 'open', 168,
      'Proposta enviada (mesmo valor, upgrade ou downgrade) com novo escopo.'),
    (v_pipeline_id, 'Em negociacao',          '#5B21B6',  4, 'open', 168,
      'Cliente em revisao da proposta. CSM/Sales em followup ativo.'),
    (v_pipeline_id, 'Aguardando assinatura',  '#4C1D95',  5, 'open',  72,
      'Contrato enviado, aguardando assinatura formal.'),
    (v_pipeline_id, 'Renovado',               '#047857',  6, 'won',  NULL,
      'Contrato renovado. Cliente segue ativo na carteira.'),
    (v_pipeline_id, 'Renovado com expansao', '#059669',  7, 'won',  NULL,
      'Renovacao + upsell (novo modulo, mais lojas, plano superior).'),
    (v_pipeline_id, 'Renovado com reducao',  '#B45309',  8, 'won',  NULL,
      'Renovacao mas downgrade — recuperar valor exige acao no proximo ciclo.'),
    (v_pipeline_id, 'Cancelado — preco',     '#B91C1C',  9, 'lost', NULL,
      'Cliente nao renovou por questoes de preco.'),
    (v_pipeline_id, 'Cancelado — resultado', '#991B1B', 10, 'lost', NULL,
      'Cliente nao renovou por nao ver resultado suficiente.'),
    (v_pipeline_id, 'Cancelado — operacional','#7F1D1D',11, 'lost', NULL,
      'Cliente nao renovou por problemas operacionais (suporte, integracao, time).');
END IF;

-- ─────────────────────────────────────────────────────────────
-- 2. Win-back (cs)
-- ─────────────────────────────────────────────────────────────
SELECT EXISTS (
  SELECT 1 FROM pipelines WHERE name = 'Win-back' AND scope = 'cs'
) INTO v_exists;

IF NOT v_exists THEN
  INSERT INTO pipelines (name, description, scope, color, category, is_default, layout, created_by)
  VALUES (
    'Win-back',
    'Recuperacao de clientes que cancelaram nos ultimos 90 dias. Janela curta de re-engajamento antes da memoria emocional do churn esfriar.',
    'cs', '#F59E0B', 'Renovacao', false, 'kanban', v_admin_id
  )
  RETURNING id INTO v_pipeline_id;

  INSERT INTO pipeline_stages (pipeline_id, name, color, "order", stage_type, sla_hours, exit_criteria) VALUES
    (v_pipeline_id, 'Pos-cancelamento',      '#F59E0B', 1, 'open',  72,
      'Cliente cancelou nos ultimos 30d. CSM faz call de exit interview (entender o por que real).'),
    (v_pipeline_id, 'Diagnostico do churn',  '#D97706', 2, 'open', 168,
      'Causa raiz mapeada (preco / resultado / operacional / mudanca interna do cliente).'),
    (v_pipeline_id, 'Em recuperacao',        '#B45309', 3, 'open', 336,
      'Conversas ativas — proposta de retorno (geralmente com condicao especial: desconto, escopo reduzido, trial).'),
    (v_pipeline_id, 'Proposta de retorno',   '#92400E', 4, 'open', 168,
      'Proposta enviada (retorno com plano A, B ou C). Cliente em decisao.'),
    (v_pipeline_id, 'Negociacao final',      '#78350F', 5, 'open', 168,
      'Cliente perto de assinar — ajustes finos de escopo e preco.'),
    (v_pipeline_id, 'Recuperado',            '#047857', 6, 'won',  NULL,
      'Cliente reativado. Contrato novo criado. Sai do win-back, volta pra carteira ativa.'),
    (v_pipeline_id, 'Perdido — sem fit',     '#52525B', 7, 'lost', NULL,
      'Cliente decidiu seguir caminho diferente. Possivel followup em 180d.'),
    (v_pipeline_id, 'Perdido — fechou loja', '#71717A', 8, 'lost', NULL,
      'Cliente fechou a loja / mudou de negocio.'),
    (v_pipeline_id, 'Followup em 180d',      '#9CA3AF', 9, 'archived', NULL,
      'Cliente nao retorna agora, mas mantemos relacionamento. Re-contato apos 6 meses.');
END IF;

END $$;
