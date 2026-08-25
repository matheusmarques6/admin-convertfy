-- ═══════════════════════════════════════════════════════════════════════
-- FIX SECURITY ADVISORS — P2: achados do linter de produção (ago/2026)
-- ═══════════════════════════════════════════════════════════════════════
--
-- Complementa os rounds 3 e 4 de RLS com o que o security advisor do
-- Supabase apontou em produção (projeto ppygkfeffknypfncsnlv, 25/08):
--   (1) 6 tabelas em `public` SEM RLS — legíveis/graváveis por qualquer
--       role com grant de tabela (anon e authenticated têm por default);
--   (2) 75 funções SECURITY DEFINER com EXECUTE para `anon` — chamáveis
--       por qualquer pessoa via POST /rest/v1/rpc/<nome> com a anon key
--       (ex.: claim_crm_webhook_event, open_crm_thread_window,
--       rate_limit_clear, log_activity...);
--   (3) 8 views SECURITY DEFINER — leem as tabelas-base como o OWNER,
--       ignorando o RLS de quem consulta.
--
-- Por que apertar não quebra nada: o app acessa tudo isso server-side com
-- o service_role (que tem BYPASSRLS e mantém os grants — nada aqui revoga
-- de service_role). Não existe .rpc() client-side no código (verificado em
-- 25/08); os RPCs de notificação e os helpers de RLS continuam executáveis
-- por `authenticated` (o RLS dos rounds 3/4 depende deles).
--
-- Aplicar no SQL Editor DEPOIS dos rounds 3 e 4. Verificação ao fim.
--
-- Fora do escopo (warnings conhecidos, sem risco direto): 90 funções com
-- search_path mutável e 2 extensões em `public` — dívida de higiene, não
-- superfície de ataque via anon key.

-- ── 1. Tabelas sem RLS ─────────────────────────────────────────────────
-- Todas de uso interno (auditoria/ops), consumidas via service role.

ALTER TABLE auth_events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_monthly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_activity         ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_competitors     ENABLE ROW LEVEL SECURITY;
ALTER TABLE cs_events              ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_events_admin" ON auth_events
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "client_monthly_reports_org" ON client_monthly_reports
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "store_activity_org" ON store_activity
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "client_competitors_org" ON client_competitors
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "cs_events_org" ON cs_events
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

-- Tabela de backup de jul/2026 sem RLS: não há consumidor — dropar fecha a
-- exposição sem inventar policy para dado morto.
DROP TABLE IF EXISTS email_component_variants_backup_20260708;

-- Nota: ai_usage_events, email_component_variants_bkp_retag4,
-- email_generation_choices e exchange_rate_cache aparecem como
-- "RLS habilitado sem policy" — esse estado NEGA tudo para anon/
-- authenticated (deny-by-default) e o service role bypassa. É o estado
-- desejado para tabela service-role-only; nenhuma ação.

-- ── 2. Funções SECURITY DEFINER — fechar o /rest/v1/rpc/* ──────────────
-- Revoga EXECUTE de PUBLIC e anon em TODA função SECURITY DEFINER do
-- schema public (dinâmico: cobre overloads como is_org_owner e funções
-- futuras já criadas com o defeito). De `authenticated`, revoga também —
-- EXCETO os helpers de RLS (as policies dos rounds 3/4 os invocam como o
-- usuário logado) e os RPCs de notificação usados pelo app logado.
-- Funções de TRIGGER executam como owner da tabela — revogar EXECUTE não
-- as afeta. service_role não é tocado.

DO $$
DECLARE
  fn RECORD;
  keep_authenticated CONSTANT text[] := ARRAY[
    -- helpers de RLS (20250125_05_rls_helpers e sucessoras)
    'is_admin', 'is_org_member', 'is_org_owner',
    'can_access_store', 'can_access_client',
    'can_access_onboarding_stage', 'can_access_onboarding_task',
    'can_manage_store_campaigns', 'can_manage_store_onboarding',
    'accessible_client_ids', 'accessible_store_ids',
    'current_org_id', 'current_org_member_id',
    'current_user_has_onboarding_role', 'current_user_onboarding_bypass',
    'has_feature',
    -- RPCs de notificação (chamados com sessão do usuário)
    'get_unread_notification_count', 'mark_notification_read',
    'mark_all_notifications_read'
  ];
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig, p.proname AS name
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn.sig);
    IF NOT (fn.name = ANY (keep_authenticated)) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', fn.sig);
    END IF;
  END LOOP;
END $$;

-- Estanca a reincidência: função nova criada pelo `postgres` (SQL Editor /
-- migrations) deixa de nascer com EXECUTE para anon.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- ── 3. Views SECURITY DEFINER → security_invoker ───────────────────────
-- Todas consumidas apenas server-side (service role, que tem BYPASSRLS e
-- segue lendo tudo). Com invoker=on, um authenticated que as consulte
-- direto passa a responder ao RLS das tabelas-base.

ALTER VIEW ai_usage_unified          SET (security_invoker = on);
ALTER VIEW campaigns_with_approval   SET (security_invoker = on);
ALTER VIEW reports_legacy            SET (security_invoker = on);
ALTER VIEW v_attribution_by_source   SET (security_invoker = on);
ALTER VIEW v_campaigns_by_revenue    SET (security_invoker = on);
ALTER VIEW v_email_generation_logs   SET (security_invoker = on);
ALTER VIEW v_flows_by_revenue        SET (security_invoker = on);
ALTER VIEW v_top_customers_klaviyo   SET (security_invoker = on);

REVOKE ALL ON ai_usage_unified,
              campaigns_with_approval,
              reports_legacy,
              v_attribution_by_source,
              v_campaigns_by_revenue,
              v_email_generation_logs,
              v_flows_by_revenue,
              v_top_customers_klaviyo
  FROM anon;

-- ── 4. Ação de DASHBOARD (não é SQL) ───────────────────────────────────
-- Authentication → Providers → Email → "Leaked password protection": ON.
-- O advisor acusa desligado; é um toggle, sem migration possível.

-- ═══ VERIFICAÇÃO ═══════════════════════════════════════════════════════
-- (a) Nenhuma tabela pública sem RLS:
--   SELECT c.relname FROM pg_class c
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
--   → esperado: 0 linhas.
--
-- (b) Nenhuma função SECURITY DEFINER executável por anon:
--   SELECT p.proname FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.prosecdef
--     AND has_function_privilege('anon', p.oid, 'EXECUTE');
--   → esperado: 0 linhas.
--
-- (c) RPC anônimo negado (deve voltar 401/403, não 200):
--   curl -X POST "$SUPABASE_URL/rest/v1/rpc/is_admin" \
--     -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
--     -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
--     -H "Content-Type: application/json" -d '{}'
--
-- (d) Fumaça logado: sino de notificações (contador + marcar como lida)
--     e qualquer tela do CRM seguem funcionando.
--
-- (e) Re-rodar o security advisor: rls_disabled_in_public,
--     anon_security_definer_function_executable e security_definer_view
--     devem zerar (sobram os warnings de search_path, fora do escopo).
