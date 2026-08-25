-- ═══════════════════════════════════════════════════════════════════════
-- FIX RLS ROUND 4 — P1: `TO authenticated USING (true)` vira escopo real
-- ═══════════════════════════════════════════════════════════════════════
--
-- Camada abaixo do round 3: estas tabelas exigem login, mas QUALQUER
-- usuário autenticado — inclusive um cliente do PORTAL (client_portal_users
-- também é `authenticated`) e um membro de OUTRA org — lia e escrevia tudo:
-- conversas do inbox (WhatsApp/Instagram), automações e runs de IA,
-- snapshots de BI, configs e runs da geração de emails, e os
-- blueprints/references POR LOJA (dado criativo por cliente).
--
-- Regra aplicada:
--   - dado por LOJA  → is_admin() OR can_access_store(store_id)
--   - resto interno  → is_admin() OR is_org_member()
-- (helpers de 20250125_05_rls_helpers e sucessoras; padrão do round 2)
--
-- O que continua funcionando, verificado no código (25/08):
--   - APIs: service_role bypassa RLS — intocadas.
--   - Realtime do inbox (use-realtime-inbox: postgres_changes em
--     crm_threads/crm_messages roda com a sessão do USUÁRIO e respeita
--     RLS) → membro da org mantém o SELECT, os eventos seguem chegando.
--   - Páginas RSC admin que usam createClient() com sessão do usuário
--     (ex.: store_briefings em /admin/stores/[id]) → admin/org member passa.
--   - Portal do cliente NÃO lê nenhuma destas tabelas client-side (só via
--     API service-role) → perde apenas o acesso que nunca deveria ter.
--
-- Aplicar no SQL Editor DEPOIS do round 3. Verificação ao fim.

-- ── 1. CRM mensageria (20260508/20260812) — inbox realtime preservado ──

DROP POLICY IF EXISTS "crm_channels_authenticated"           ON crm_channels;
DROP POLICY IF EXISTS "crm_threads_authenticated"            ON crm_threads;
DROP POLICY IF EXISTS "crm_messages_authenticated"           ON crm_messages;
DROP POLICY IF EXISTS "crm_quick_replies_authenticated"      ON crm_quick_replies;
DROP POLICY IF EXISTS "crm_whatsapp_templates_authenticated" ON crm_whatsapp_templates;

CREATE POLICY "crm_channels_org" ON crm_channels
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "crm_threads_org" ON crm_threads
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "crm_messages_org" ON crm_messages
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "crm_quick_replies_org" ON crm_quick_replies
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "crm_whatsapp_templates_org" ON crm_whatsapp_templates
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

-- ── 2. CRM automação/IA/snapshots/import (20260509/10, 20261065) ───────

DROP POLICY IF EXISTS "crm_ai_actions_authenticated"            ON crm_ai_actions;
DROP POLICY IF EXISTS "crm_ai_action_runs_authenticated"        ON crm_ai_action_runs;
DROP POLICY IF EXISTS "crm_automation_runs_authenticated"       ON crm_automation_runs;
DROP POLICY IF EXISTS "crm_history_import_jobs_authenticated"   ON crm_history_import_jobs;
DROP POLICY IF EXISTS "crm_pipeline_snapshots_authenticated"    ON crm_pipeline_snapshots;
DROP POLICY IF EXISTS "crm_org_snapshots_authenticated"         ON crm_org_snapshots;
DROP POLICY IF EXISTS "crm_lead_funnel_snapshots_authenticated" ON crm_lead_funnel_snapshots;

CREATE POLICY "crm_ai_actions_org" ON crm_ai_actions
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "crm_ai_action_runs_org" ON crm_ai_action_runs
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "crm_automation_runs_org" ON crm_automation_runs
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "crm_history_import_jobs_org" ON crm_history_import_jobs
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "crm_pipeline_snapshots_org" ON crm_pipeline_snapshots
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "crm_org_snapshots_org" ON crm_org_snapshots
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "crm_lead_funnel_snapshots_org" ON crm_lead_funnel_snapshots
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

-- ── 3. Dado criativo POR LOJA (20260708/20260601) — can_access_store ───

DROP POLICY IF EXISTS "authenticated_full_access" ON store_email_blueprints;
DROP POLICY IF EXISTS "authenticated_full_access" ON store_email_references;
DROP POLICY IF EXISTS "authenticated_full_access" ON store_image_overrides;

CREATE POLICY "store_email_blueprints_store" ON store_email_blueprints
  FOR ALL TO authenticated
  USING (is_admin() OR can_access_store(store_id))
  WITH CHECK (is_admin() OR can_access_store(store_id));

CREATE POLICY "store_email_references_store" ON store_email_references
  FOR ALL TO authenticated
  USING (is_admin() OR can_access_store(store_id))
  WITH CHECK (is_admin() OR can_access_store(store_id));

CREATE POLICY "store_image_overrides_store" ON store_image_overrides
  FOR ALL TO authenticated
  USING (is_admin() OR can_access_store(store_id))
  WITH CHECK (is_admin() OR can_access_store(store_id));

-- ── 4. Infra da geração de emails (20260530/0621/0708/0727) ────────────
-- Consumida por rotas admin (service role) e pelo Estúdio via API; nenhum
-- caminho client-side direto. Org-interno basta.

DROP POLICY IF EXISTS "authenticated_full_access" ON email_agent_configs;
DROP POLICY IF EXISTS "authenticated_full_access" ON email_generation_settings;
DROP POLICY IF EXISTS "authenticated_full_access" ON email_generation_runs;
DROP POLICY IF EXISTS "authenticated_full_access" ON email_reference_templates;
DROP POLICY IF EXISTS "authenticated_full_access" ON email_blueprints;
DROP POLICY IF EXISTS "authenticated_full_access" ON email_outline_templates;
DROP POLICY IF EXISTS "authenticated_full_access" ON email_component_variants;
DROP POLICY IF EXISTS "authenticated_full_access" ON email_dispatch_jobs;
DROP POLICY IF EXISTS "authenticated_full_access" ON email_generation_queue_signals;
DROP POLICY IF EXISTS "authenticated_full_access" ON email_status_events;

CREATE POLICY "email_agent_configs_org" ON email_agent_configs
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "email_generation_settings_org" ON email_generation_settings
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "email_generation_runs_org" ON email_generation_runs
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "email_reference_templates_org" ON email_reference_templates
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "email_blueprints_org" ON email_blueprints
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "email_outline_templates_org" ON email_outline_templates
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "email_component_variants_org" ON email_component_variants
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "email_dispatch_jobs_org" ON email_dispatch_jobs
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "email_generation_queue_signals_org" ON email_generation_queue_signals
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "email_status_events_org" ON email_status_events
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

-- ── 5. Operacional/legado com USING(true) remanescente ─────────────────

-- wise_reconciliations (financeiro interno)
DROP POLICY IF EXISTS "Users can view wise reconciliations"   ON wise_reconciliations;
DROP POLICY IF EXISTS "Users can update wise reconciliations" ON wise_reconciliations;
DROP POLICY IF EXISTS "Users can delete wise reconciliations" ON wise_reconciliations;
CREATE POLICY "wise_reconciliations_org" ON wise_reconciliations
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

-- commemorative_dates (referência da Central de Campanhas)
DROP POLICY IF EXISTS "commemorative_dates_read" ON commemorative_dates;
CREATE POLICY "commemorative_dates_org" ON commemorative_dates
  FOR SELECT TO authenticated
  USING (is_admin() OR is_org_member());

-- client_briefings / onboarding legado (20250107/20250125)
DROP POLICY IF EXISTS "Users can view all briefings"          ON client_briefings;
DROP POLICY IF EXISTS "Users can update briefings"            ON client_briefings;
DROP POLICY IF EXISTS "Users can delete briefings"            ON client_briefings;
CREATE POLICY "client_briefings_org" ON client_briefings
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

DROP POLICY IF EXISTS "Users can view all onboarding history" ON onboarding_history;
CREATE POLICY "onboarding_history_org" ON onboarding_history
  FOR SELECT TO authenticated
  USING (is_admin() OR is_org_member());

DROP POLICY IF EXISTS "View template steps" ON onboarding_template_steps;
CREATE POLICY "onboarding_template_steps_org" ON onboarding_template_steps
  FOR SELECT TO authenticated
  USING (is_admin() OR is_org_member());

-- Grupo do round 2 que ficou authenticated-wide (agora fecha pra org)
DROP POLICY IF EXISTS "meeting_participants_select_policy" ON meeting_participants;
DROP POLICY IF EXISTS "meeting_participants_update_policy" ON meeting_participants;
DROP POLICY IF EXISTS "meeting_participants_delete_policy" ON meeting_participants;
CREATE POLICY "meeting_participants_org_rw" ON meeting_participants
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

DROP POLICY IF EXISTS "all_onboarding_approvals" ON onboarding_approvals;
CREATE POLICY "onboarding_approvals_org" ON onboarding_approvals
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

DROP POLICY IF EXISTS "all_onboarding_phase_transitions" ON onboarding_phase_transitions;
CREATE POLICY "onboarding_phase_transitions_org" ON onboarding_phase_transitions
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

DROP POLICY IF EXISTS "all_store_alerts" ON store_alerts;
CREATE POLICY "store_alerts_org" ON store_alerts
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

DROP POLICY IF EXISTS "all_store_briefings" ON store_briefings;
CREATE POLICY "store_briefings_org" ON store_briefings
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

DROP POLICY IF EXISTS "Users can view all feedback calls" ON store_feedback_calls;
DROP POLICY IF EXISTS "Users can update feedback calls"   ON store_feedback_calls;
CREATE POLICY "store_feedback_calls_org" ON store_feedback_calls
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

DROP POLICY IF EXISTS "all_store_onboarding_data" ON store_onboarding_data;
CREATE POLICY "store_onboarding_data_org" ON store_onboarding_data
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

-- rate_limits: só as RPCs SECURITY DEFINER a tocam (rodam como owner e
-- ignoram RLS) — nenhum usuário precisa de acesso direto.
DROP POLICY IF EXISTS "System can manage rate limits" ON rate_limits;
CREATE POLICY "rate_limits_admin" ON rate_limits
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ═══ VERIFICAÇÃO ═══════════════════════════════════════════════════════
-- (a) Sobrou USING(true) autenticado nas tabelas deste round?
--   SELECT tablename, policyname FROM pg_policies
--   WHERE schemaname='public' AND qual='true'
--     AND (tablename LIKE 'crm_%' OR tablename LIKE 'email_%'
--          OR tablename LIKE 'store_%' OR tablename LIKE 'onboarding_%')
--   ORDER BY tablename;
--   → esperado: nenhuma linha destas tabelas (tracking_lookups INSERT anon
--     é deliberado e fica).
--
-- (b) Fumaça como MEMBRO da org: inbox (mensagem nova chega em tempo real),
--     automações, reports do CRM, Estúdio de Agentes, aba Componentes.
-- (c) Como usuário do PORTAL:
--   curl "$SUPABASE_URL/rest/v1/crm_threads?select=id&limit=1" \
--     -H "apikey: $ANON" -H "Authorization: Bearer <jwt-do-portal>"
--   → esperado: [].
