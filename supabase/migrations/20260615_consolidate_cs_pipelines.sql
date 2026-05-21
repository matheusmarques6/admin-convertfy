-- ============================================================
-- Consolida Acompanhamento + Calls Mensais + Cadencias em pipelines CS
-- ============================================================
-- As 3 telas (Acompanhamento Semanal, Calls Mensais, Cadencias) eram
-- kanbans/listas standalone com sua propria infra (weekly_pipeline_states,
-- store_feedback_calls como view derivada, store_cadence_overrides).
--
-- Agora viram pipelines CS regulares, ganham deal_drawer, automacoes,
-- filtros, deal_detail (5 abas) etc. Tabelas legadas continuam pra
-- historico e compat com endpoints da ficha de loja.
--
-- 3 pipelines criados (idempotente):
--   1. Acompanhamento Semanal (kanban, 4 stages, reset domingo 22h)
--   2. Calls Mensais (kanban, 6 stages derivados de dates)
--   3. Cadencias CS (state-board, 4 stages = frequencias)
--
-- Backfill: cria deals a partir de:
--   - weekly_pipeline_states (apenas is_active=true)
--   - store_feedback_calls (apenas conducted_at>=now-60d ou next_call_date futuro)
--   - client_stores ativos x store_cadence_overrides

DO $$
DECLARE
  v_admin_id UUID;
  v_acomp_id UUID;
  v_calls_id UUID;
  v_cad_id UUID;
  v_stage_id UUID;
  v_exists BOOLEAN;
  -- Stage IDs para backfill rapido
  v_acomp_stage_1 UUID;
  v_acomp_stage_2 UUID;
  v_acomp_stage_3 UUID;
  v_acomp_stage_4 UUID;
  v_calls_a_marcar UUID;
  v_calls_aguardando UUID;
  v_calls_agendadas UUID;
  v_calls_hoje UUID;
  v_calls_pos UUID;
  v_calls_final UUID;
  v_cad_weekly UUID;
  v_cad_biweekly UUID;
  v_cad_monthly UUID;
  v_cad_paused UUID;
BEGIN

SELECT id INTO v_admin_id FROM profiles WHERE role = 'admin' LIMIT 1;

-- ─────────────────────────────────────────────────────────────
-- 1. Acompanhamento Semanal
-- ─────────────────────────────────────────────────────────────
SELECT id INTO v_acomp_id FROM pipelines
WHERE name = 'Acompanhamento Semanal' AND scope = 'cs' LIMIT 1;

IF v_acomp_id IS NULL THEN
  INSERT INTO pipelines (name, description, scope, color, category, is_default, layout, created_by)
  VALUES (
    'Acompanhamento Semanal',
    'Loop semanal do CS — IA flagga lojas em risco na sexta, time otimiza ate quinta, Ryan envia feedback. Reseta automaticamente domingo 22h UTC.',
    'cs', '#2137B6', 'Acompanhamento', false, 'kanban', v_admin_id
  )
  RETURNING id INTO v_acomp_id;

  INSERT INTO pipeline_stages (pipeline_id, name, color, "order", stage_type, sla_hours, exit_criteria) VALUES
    (v_acomp_id, 'Precisa atencao',     '#2137B6', 1, 'open', 24,
      'IA sinalizou — discutir no Ritual de Sexta e aprovar acoes.'),
    (v_acomp_id, 'Em otimizacao',       '#92400E', 2, 'open', 168,
      'Acoes aprovadas — Designer + Ops executando ao longo da semana.'),
    (v_acomp_id, 'Pronta pra feedback', '#065F46', 3, 'open', 48,
      'Tasks concluidas + mensagem IA gerada. Ryan envia WhatsApp.'),
    (v_acomp_id, 'Feedback enviado',    '#6B7280', 4, 'won',  NULL,
      'Ryan enviou. Loop fecha. Reset automatico domingo 22h.');
END IF;

-- Pega stage IDs pro backfill
SELECT id INTO v_acomp_stage_1 FROM pipeline_stages WHERE pipeline_id = v_acomp_id AND "order" = 1;
SELECT id INTO v_acomp_stage_2 FROM pipeline_stages WHERE pipeline_id = v_acomp_id AND "order" = 2;
SELECT id INTO v_acomp_stage_3 FROM pipeline_stages WHERE pipeline_id = v_acomp_id AND "order" = 3;
SELECT id INTO v_acomp_stage_4 FROM pipeline_stages WHERE pipeline_id = v_acomp_id AND "order" = 4;

-- ─────────────────────────────────────────────────────────────
-- 2. Calls Mensais
-- ─────────────────────────────────────────────────────────────
SELECT id INTO v_calls_id FROM pipelines
WHERE name = 'Calls Mensais' AND scope = 'cs' LIMIT 1;

IF v_calls_id IS NULL THEN
  INSERT INTO pipelines (name, description, scope, color, category, is_default, layout, created_by)
  VALUES (
    'Calls Mensais',
    'Pipeline de calls de feedback recorrentes. Cada loja gera 1 deal/call que percorre A marcar -> Agendada -> Realizada -> Finalizada.',
    'cs', '#7C3AED', 'Calls', false, 'kanban', v_admin_id
  )
  RETURNING id INTO v_calls_id;

  INSERT INTO pipeline_stages (pipeline_id, name, color, "order", stage_type, sla_hours, exit_criteria) VALUES
    (v_calls_id, 'A marcar',          '#991B1B', 1, 'open',  72,
      'Loja ha 30d+ sem call agendada. Acionar cliente pra marcar.'),
    (v_calls_id, 'Aguardando',        '#92400E', 2, 'open', 168,
      'Convite enviado, cliente confirmou. Aguarda a data.'),
    (v_calls_id, 'Agendada',          '#2137B6', 3, 'open',  72,
      'Call nos proximos 3 dias. Preparar dados pra reuniao.'),
    (v_calls_id, 'Hoje',              '#7C3AED', 4, 'open',  24,
      'Call acontece hoje. Fazer briefing e estar online.'),
    (v_calls_id, 'Pos-call pendente', '#B45309', 5, 'open',  48,
      'Call realizada — falta subir notas e action items.'),
    (v_calls_id, 'Finalizada',        '#065F46', 6, 'won',  NULL,
      'Notas registradas + proxima call agendada. Loop reinicia em 30d.');
END IF;

SELECT id INTO v_calls_a_marcar    FROM pipeline_stages WHERE pipeline_id = v_calls_id AND "order" = 1;
SELECT id INTO v_calls_aguardando  FROM pipeline_stages WHERE pipeline_id = v_calls_id AND "order" = 2;
SELECT id INTO v_calls_agendadas   FROM pipeline_stages WHERE pipeline_id = v_calls_id AND "order" = 3;
SELECT id INTO v_calls_hoje        FROM pipeline_stages WHERE pipeline_id = v_calls_id AND "order" = 4;
SELECT id INTO v_calls_pos         FROM pipeline_stages WHERE pipeline_id = v_calls_id AND "order" = 5;
SELECT id INTO v_calls_final       FROM pipeline_stages WHERE pipeline_id = v_calls_id AND "order" = 6;

-- ─────────────────────────────────────────────────────────────
-- 3. Cadencias CS (state-board)
-- ─────────────────────────────────────────────────────────────
SELECT id INTO v_cad_id FROM pipelines
WHERE name = 'Cadencias CS' AND scope = 'cs' LIMIT 1;

IF v_cad_id IS NULL THEN
  INSERT INTO pipelines (name, description, scope, color, category, is_default, layout, created_by)
  VALUES (
    'Cadencias CS',
    'State-board com a frequencia de call de cada loja. Arrastar entre colunas troca a cadencia. Configuracao, nao workflow.',
    'cs', '#0EA5E9', 'Configuracao', false, 'state', v_admin_id
  )
  RETURNING id INTO v_cad_id;

  INSERT INTO pipeline_stages (pipeline_id, name, color, "order", stage_type, sla_hours, exit_criteria) VALUES
    (v_cad_id, 'Semanal',    '#991B1B', 1, 'open', NULL,
      'Loja em risco / onboarding / cliente premium. 4 calls/mes.'),
    (v_cad_id, 'Quinzenal',  '#92400E', 2, 'open', NULL,
      'Cliente requer atencao redobrada. 2 calls/mes.'),
    (v_cad_id, 'Mensal',     '#065F46', 3, 'open', NULL,
      'Cadencia padrao da Convertfy. 1 call/mes.'),
    (v_cad_id, 'Pausada',    '#6B7280', 4, 'archived', NULL,
      'Cliente pausou calls (ferias, mudanca interna, churn em analise).');
END IF;

SELECT id INTO v_cad_weekly   FROM pipeline_stages WHERE pipeline_id = v_cad_id AND "order" = 1;
SELECT id INTO v_cad_biweekly FROM pipeline_stages WHERE pipeline_id = v_cad_id AND "order" = 2;
SELECT id INTO v_cad_monthly  FROM pipeline_stages WHERE pipeline_id = v_cad_id AND "order" = 3;
SELECT id INTO v_cad_paused   FROM pipeline_stages WHERE pipeline_id = v_cad_id AND "order" = 4;

-- ═════════════════════════════════════════════════════════════
-- BACKFILL DE DEALS A PARTIR DOS DADOS LEGADOS
-- ═════════════════════════════════════════════════════════════

-- ─── Acompanhamento: 1 deal por weekly_pipeline_states ativo ───
INSERT INTO deals (
  pipeline_id, stage_id, title, status, source, position,
  store_id, client_id, owner_id, currency, value, custom_fields
)
SELECT
  v_acomp_id,
  CASE wps.current_stage
    WHEN 1 THEN v_acomp_stage_1
    WHEN 2 THEN v_acomp_stage_2
    WHEN 3 THEN v_acomp_stage_3
    ELSE v_acomp_stage_4
  END,
  cs.store_name,
  (CASE WHEN wps.current_stage = 4 THEN 'won' ELSE 'open' END)::deal_status,
  COALESCE(wps.flagged_by, 'system'),
  ROW_NUMBER() OVER (PARTITION BY wps.current_stage ORDER BY wps.flagged_at) * 10,
  wps.store_id,
  cs.client_id,
  c.owner_id,
  'BRL',
  COALESCE(cs.mrr_cents, 0) / 100.0,
  jsonb_build_object(
    'health_state', wps.health_state,
    'health_score', wps.health_score,
    'flag_reason', wps.flag_reason,
    'ai_message', wps.ai_message,
    'feedback_sent_at', wps.feedback_sent_at,
    'feedback_method', wps.feedback_method,
    'week_start', wps.week_start,
    'legacy_weekly_state_id', wps.id
  )
FROM weekly_pipeline_states wps
JOIN client_stores cs ON cs.id = wps.store_id
LEFT JOIN clients c ON c.id = cs.client_id
WHERE wps.is_active = true
  -- Evita duplicar se ja foi rodado (idempotente)
  AND NOT EXISTS (
    SELECT 1 FROM deals d
    WHERE d.pipeline_id = v_acomp_id
      AND d.store_id = wps.store_id
      AND d.custom_fields->>'legacy_weekly_state_id' = wps.id::text
  );

-- ─── Calls Mensais: 1 deal por call recente ou call futura ───
INSERT INTO deals (
  pipeline_id, stage_id, title, status, source, position,
  store_id, client_id, owner_id, currency, value, custom_fields
)
SELECT
  v_calls_id,
  CASE
    WHEN sfc.conducted_at IS NULL AND sfc.next_call_date IS NOT NULL THEN
      CASE
        WHEN sfc.next_call_date::date = CURRENT_DATE THEN v_calls_hoje
        WHEN sfc.next_call_date::date - CURRENT_DATE BETWEEN 1 AND 3 THEN v_calls_agendadas
        ELSE v_calls_aguardando
      END
    WHEN sfc.conducted_at IS NOT NULL AND (sfc.notes IS NULL OR sfc.notes = '') THEN v_calls_pos
    WHEN sfc.conducted_at IS NOT NULL THEN v_calls_final
    ELSE v_calls_a_marcar
  END,
  COALESCE(cs.store_name, '(loja removida)') || ' — Call ' ||
    COALESCE(TO_CHAR(sfc.conducted_at, 'DD/MM/YYYY'), TO_CHAR(sfc.next_call_date, 'DD/MM/YYYY'), 'a marcar'),
  (CASE
    WHEN sfc.conducted_at IS NOT NULL AND sfc.notes IS NOT NULL AND sfc.notes <> '' THEN 'won'
    ELSE 'open'
  END)::deal_status,
  'feedback_call',
  ROW_NUMBER() OVER (
    PARTITION BY (CASE
      WHEN sfc.conducted_at IS NULL AND sfc.next_call_date IS NOT NULL THEN
        CASE
          WHEN sfc.next_call_date::date = CURRENT_DATE THEN 'hoje'
          WHEN sfc.next_call_date::date - CURRENT_DATE BETWEEN 1 AND 3 THEN 'agendadas'
          ELSE 'aguardando'
        END
      WHEN sfc.conducted_at IS NOT NULL AND (sfc.notes IS NULL OR sfc.notes = '') THEN 'pos'
      WHEN sfc.conducted_at IS NOT NULL THEN 'final'
      ELSE 'amarcar'
    END)
    ORDER BY COALESCE(sfc.conducted_at, sfc.next_call_date) DESC
  ) * 10,
  sfc.store_id,
  sfc.client_id,
  sfc.conducted_by,
  'BRL',
  0,
  jsonb_build_object(
    'conducted_at', sfc.conducted_at,
    'next_call_date', sfc.next_call_date,
    'duration_minutes', sfc.duration_minutes,
    'notes', sfc.notes,
    'action_items', sfc.action_items,
    'result_percentage', sfc.result_percentage,
    'legacy_call_id', sfc.id
  )
FROM store_feedback_calls sfc
LEFT JOIN client_stores cs ON cs.id = sfc.store_id
WHERE (
  -- Last 60d ou future
  sfc.conducted_at >= NOW() - INTERVAL '60 days'
  OR sfc.next_call_date >= CURRENT_DATE - INTERVAL '7 days'
)
  AND NOT EXISTS (
    SELECT 1 FROM deals d
    WHERE d.pipeline_id = v_calls_id
      AND d.custom_fields->>'legacy_call_id' = sfc.id::text
  );

-- ─── Cadencias: 1 deal por loja ativa (state-board) ───
INSERT INTO deals (
  pipeline_id, stage_id, title, status, source, position,
  store_id, client_id, owner_id, currency, value, custom_fields
)
SELECT
  v_cad_id,
  CASE COALESCE(sco.frequency, 'monthly')
    WHEN 'weekly'   THEN v_cad_weekly
    WHEN 'biweekly' THEN v_cad_biweekly
    WHEN 'paused'   THEN v_cad_paused
    ELSE v_cad_monthly
  END,
  cs.store_name,
  'open'::deal_status,
  'cadence_config',
  ROW_NUMBER() OVER (
    PARTITION BY COALESCE(sco.frequency, 'monthly')
    ORDER BY cs.mrr_cents DESC NULLS LAST, cs.store_name
  ) * 10,
  cs.id,
  cs.client_id,
  c.owner_id,
  'BRL',
  COALESCE(cs.mrr_cents, 0) / 100.0,
  jsonb_build_object(
    'frequency', COALESCE(sco.frequency, 'monthly'),
    'is_default', sco.id IS NULL,
    'reason', sco.reason,
    'configured_by', sco.configured_by,
    'configured_at', sco.configured_at,
    'legacy_override_id', sco.id
  )
FROM client_stores cs
LEFT JOIN store_cadence_overrides sco
  ON sco.store_id = cs.id
  AND (sco.expires_at IS NULL OR sco.expires_at > NOW())
LEFT JOIN clients c ON c.id = cs.client_id
WHERE cs.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM deals d
    WHERE d.pipeline_id = v_cad_id
      AND d.store_id = cs.id
  );

RAISE NOTICE 'CS pipelines consolidados: Acompanhamento=% Calls=% Cadencias=%',
  v_acomp_id, v_calls_id, v_cad_id;

END $$;
