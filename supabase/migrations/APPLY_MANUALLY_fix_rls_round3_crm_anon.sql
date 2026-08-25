-- ═══════════════════════════════════════════════════════════════════════
-- FIX RLS ROUND 3 — P0: tabelas expostas à chave ANÔNIMA (ago/2026)
-- ═══════════════════════════════════════════════════════════════════════
--
-- Incidente: policies `FOR ALL USING (true) WITH CHECK (true)` SEM cláusula
-- TO (⇒ TO PUBLIC, que inclui `anon`). A NEXT_PUBLIC_SUPABASE_ANON_KEY vai
-- no bundle do browser — é pública por desenho — então qualquer pessoa com
-- DevTools lia E escrevia estas tabelas via /rest/v1/*: leads (nome, email,
-- telefone), contatos, parceiros (comissão), histórico e valores de
-- negócios, metas, contas de anúncio da Meta (com token criptografado),
-- cobranças e assinaturas de clientes, e a própria tabela `profiles`.
--
-- Mesmo padrão já corrigido 2x (20250215_fix_rls_using_true.sql e
-- 20260320_fix_rls_using_true_round2.sql); o CRM (mai-ago/2026) o
-- reintroduziu. Este é o round 3 — MESMO desenho dos anteriores:
-- `TO authenticated` + is_admin()/is_org_member() (20250125_05_rls_helpers).
--
-- Por que apertar não quebra nada: TODO o acesso do app a estas tabelas é
-- server-side via createAdminClient (service_role, que BYPASSA RLS).
-- Nenhum componente client-side faz .from() nelas (verificado em 25/08); o
-- realtime do inbox usa crm_threads/crm_messages (round 4, não aqui).
--
-- AÇÕES MANUAIS ADICIONAIS (não são SQL):
--   1. Rotacionar a senha do usuário e2e-cliente@convertfy.me (Supabase
--      Auth → Users): a senha real está no HISTÓRICO do git (commit
--      9ff5bfe3, arquivo .env.e2e; a remoção em 94283714 não apaga o blob).
--      Atualizar .env.e2e local/CI depois.
--   2. Regra daqui pra frente: TODA policy nova declara `TO authenticated`
--      (ou role específica) + helper de escopo. "A API valida" não protege
--      o /rest/v1 direto.
--
-- Aplicar no SQL Editor do Supabase. Verificação ao fim do arquivo.

-- ── 1. CRM core (20260507_crm_phase1_core) ─────────────────────────────

DROP POLICY IF EXISTS "crm_leads_all"           ON crm_leads;
DROP POLICY IF EXISTS "crm_contacts_all"        ON crm_contacts;
DROP POLICY IF EXISTS "crm_partners_all"        ON crm_partners;
DROP POLICY IF EXISTS "crm_deal_history_all"    ON crm_deal_history;
DROP POLICY IF EXISTS "crm_deal_activities_all" ON crm_deal_activities;
DROP POLICY IF EXISTS "crm_deal_tags_all"       ON crm_deal_tags;
DROP POLICY IF EXISTS "crm_health_history_all"  ON crm_health_history;

CREATE POLICY "crm_leads_org" ON crm_leads
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "crm_contacts_org" ON crm_contacts
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "crm_partners_org" ON crm_partners
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "crm_deal_history_org" ON crm_deal_history
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "crm_deal_activities_org" ON crm_deal_activities
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "crm_deal_tags_org" ON crm_deal_tags
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "crm_health_history_org" ON crm_health_history
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

-- ── 2. CRM produtos / metas / visões / motivos (20261054-55/67/68) ─────

DROP POLICY IF EXISTS "crm_products_all"      ON crm_products;
DROP POLICY IF EXISTS "crm_deal_products_all" ON crm_deal_products;
DROP POLICY IF EXISTS "crm_lost_reasons_all"  ON crm_lost_reasons;
DROP POLICY IF EXISTS "crm_sales_goals_all"   ON crm_sales_goals;
DROP POLICY IF EXISTS "crm_saved_views_all"   ON crm_saved_views;

CREATE POLICY "crm_products_org" ON crm_products
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "crm_deal_products_org" ON crm_deal_products
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "crm_lost_reasons_org" ON crm_lost_reasons
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "crm_sales_goals_org" ON crm_sales_goals
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "crm_saved_views_org" ON crm_saved_views
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

-- ── 3. Funil / Meta Ads (20261052-53) — inclui tokens criptografados ───

DROP POLICY IF EXISTS "crm_ad_spend_all"    ON crm_ad_spend;
DROP POLICY IF EXISTS "crm_ad_accounts_all" ON crm_ad_accounts;
DROP POLICY IF EXISTS "crm_ad_insights_all" ON crm_ad_insights;

CREATE POLICY "crm_ad_spend_org" ON crm_ad_spend
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "crm_ad_accounts_org" ON crm_ad_accounts
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "crm_ad_insights_org" ON crm_ad_insights
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

-- ── 4. Financeiro (fix_client_creation.sql) ────────────────────────────
-- O portal do cliente lê cobranças via API server-side (service role) —
-- a policy larga nunca foi o caminho legítimo.

DROP POLICY IF EXISTS "Allow all operations on client_charges"       ON client_charges;
DROP POLICY IF EXISTS "Allow all operations on client_subscriptions" ON client_subscriptions;

CREATE POLICY "client_charges_org" ON client_charges
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

CREATE POLICY "client_subscriptions_org" ON client_subscriptions
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_member())
  WITH CHECK (is_admin() OR is_org_member());

-- ── 5. Legado 00001: SELECT público vira SELECT autenticado ────────────
-- Mudança MÍNIMA de propósito: tira só o `anon`, preservando a semântica
-- atual para usuários logados (telas que listam owners/tags dependem do
-- SELECT amplo; endurecer além disso é decisão de produto, fora deste fix).

DROP POLICY IF EXISTS "Users can view all profiles"   ON profiles;
DROP POLICY IF EXISTS "Users can view tags"           ON tags;
DROP POLICY IF EXISTS "Users can view custom_fields"  ON custom_fields;

CREATE POLICY "Users can view all profiles" ON profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can view tags" ON tags
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can view custom_fields" ON custom_fields
  FOR SELECT TO authenticated USING (true);

-- ═══ VERIFICAÇÃO ═══════════════════════════════════════════════════════
-- (a) Nenhuma policy PUBLIC/USING(true) sobrando nas tabelas deste fix:
--   SELECT tablename, policyname, roles, qual
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND (tablename LIKE 'crm_%' OR tablename IN
--          ('client_charges','client_subscriptions','profiles','tags','custom_fields'))
--     AND ('{public}' = roles::text[] OR qual = 'true')
--   ORDER BY tablename;
--   → esperado: só os 3 SELECTs de legado (roles={authenticated}, qual=true).
--
-- (b) Teste anônimo (deve voltar []):
--   curl "$SUPABASE_URL/rest/v1/crm_leads?select=id&limit=1" \
--     -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
--     -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_ANON_KEY"
--
-- (c) Fumaça logado (membro da org): kanban de deals, página de Leads,
--     catálogo de Produtos, funil comercial — tudo segue funcionando
--     (as APIs usam service role e nem passam por RLS).
