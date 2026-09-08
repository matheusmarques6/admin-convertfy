-- ============================================================================
-- RLS round 5A — fechar o acesso ANÔNIMO (crítico)
-- ============================================================================
-- MEDIDO EM PRODUÇÃO em 08/09/2026, não suposto:
--
--   17 tabelas com  FOR ALL TO PUBLIC USING(true) WITH CHECK(true).
--   TO PUBLIC inclui o papel `anon`, e a anon key está no JS do browser por
--   design. Ou seja: LEITURA E ESCRITA abertas, sem login, em
--   client_charges, client_subscriptions, crm_leads (301 linhas),
--   crm_contacts, crm_ad_accounts e todo o resto do CRM, via
--   GET/POST $SUPABASE_URL/rest/v1/<tabela>.
--
-- POR QUE ESTE ARQUIVO EXISTE, e não o round4:
--   O round4 citava `wise_reconciliations`, tabela que NÃO existe neste banco.
--   O SQL Editor roda tudo em UMA transação, então o 42P01 abortava o script
--   inteiro e NADA era aplicado — é por isso que as policies continuaram
--   USING(true) meses depois de o round4 ter sido escrito. Aqui o script parte
--   do que EXISTE (pg_policies) e o passo 3 conta o resultado.
--
-- ESCOPO DELIBERADO: só as 17 abertas ao anon. As policies
-- `TO authenticated USING(true)` (61 delas, que deixam os 3 usuários do PORTAL
-- lerem o banco interno) ficam para o round 5B, porque lá cada tabela precisa
-- ser avaliada uma a uma — várias têm controle fino (`clients` tem "Access
-- clients by permission") que uma policy ampla afrouxaria. Fechar o anon é o
-- que não pode esperar.
--
-- FORMA: `TO authenticated USING (is_org_member())` — is_org_member() é STABLE
-- SECURITY DEFINER e testa org_members ativo, o que exclui anon E portal.
-- NÃO escopa por org (`org_id = current_org_id()`) de propósito: há UMA org,
-- ninguém pertence a duas, e 16 leads estão com org_id NULL — o escopo os
-- faria sumir da tela em silêncio. Isso entra quando existir a segunda org,
-- junto com o backfill.
--
-- DUAS TABELAS NÃO GANHAM POLICY NOVA, e é intencional:
--   client_charges e client_subscriptions já têm `ALL TO authenticated`. Nelas
--   a policy TO PUBLIC é lixo legado ("Allow all operations on ..."): basta
--   removê-la. Criar outra por cima só duplicaria a avaliação — e a policy
--   "Portal users can view own client_charges" continua de pé, que é o certo:
--   o cliente vê as PRÓPRIAS faturas no portal.
--
-- O QUE ESTE SCRIPT NÃO QUEBRA (verificado no código, não assumido):
--   - Formulário público (crm_forms/_fields/_submissions) e tracking_lookups
--     dependem de anon e NÃO estão entre as 17 — nada aqui os toca.
--   - O portal só lê `client_portal_users` direto do browser; o resto passa
--     por /api/portal/* com service role, que bypassa RLS.
--   - O realtime do browser (client_charges, crm_deal_activities, deals...)
--     roda com o JWT do usuário logado, que é membro: passa em is_org_member().
--   - As rotas do admin usam createAdminClient (service role) e não são
--     afetadas por RLS de forma alguma.
--
-- IDEMPOTENTE: pode rodar duas vezes.
-- ============================================================================

-- ── 0. Pré-checagem ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.is_org_member()') IS NULL THEN
    RAISE EXCEPTION 'is_org_member() não existe neste banco. Aplique os helpers de escopo antes.';
  END IF;
END $$;

-- ── 1. As 15 do CRM: trocam a policy aberta por uma de org ──────────────────
DROP POLICY IF EXISTS crm_ad_accounts_all      ON public.crm_ad_accounts;
DROP POLICY IF EXISTS crm_ad_insights_all      ON public.crm_ad_insights;
DROP POLICY IF EXISTS crm_ad_spend_all         ON public.crm_ad_spend;
DROP POLICY IF EXISTS crm_contacts_all         ON public.crm_contacts;
DROP POLICY IF EXISTS crm_deal_activities_all  ON public.crm_deal_activities;
DROP POLICY IF EXISTS crm_deal_history_all     ON public.crm_deal_history;
DROP POLICY IF EXISTS crm_deal_products_all    ON public.crm_deal_products;
DROP POLICY IF EXISTS crm_deal_tags_all        ON public.crm_deal_tags;
DROP POLICY IF EXISTS crm_health_history_all   ON public.crm_health_history;
DROP POLICY IF EXISTS crm_leads_all            ON public.crm_leads;
DROP POLICY IF EXISTS crm_lost_reasons_all     ON public.crm_lost_reasons;
DROP POLICY IF EXISTS crm_partners_all         ON public.crm_partners;
DROP POLICY IF EXISTS crm_products_all         ON public.crm_products;
DROP POLICY IF EXISTS crm_sales_goals_all      ON public.crm_sales_goals;
DROP POLICY IF EXISTS crm_saved_views_all      ON public.crm_saved_views;

-- Criadas em laço para o nome sair sempre igual e nenhuma tabela ficar de
-- fora por erro de digitação — foi um nome errado que matou o round4.
DO $$
DECLARE
  t     text;
  alvos text[] := ARRAY[
    'crm_ad_accounts','crm_ad_insights','crm_ad_spend','crm_contacts',
    'crm_deal_activities','crm_deal_history','crm_deal_products','crm_deal_tags',
    'crm_health_history','crm_leads','crm_lost_reasons','crm_partners',
    'crm_products','crm_sales_goals','crm_saved_views'
  ];
BEGIN
  FOREACH t IN ARRAY alvos LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'round5a: tabela % não existe neste banco, pulando.', t;
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_rw', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING (is_org_member()) WITH CHECK (is_org_member())',
      t || '_org_rw', t
    );
  END LOOP;
END $$;

-- ── 2. Financeiro: só remover o legado (a cobertura boa já existe) ──────────
DROP POLICY IF EXISTS "Allow all operations on client_charges"      ON public.client_charges;
DROP POLICY IF EXISTS "Allow all operations on client_subscriptions" ON public.client_subscriptions;

-- ── 2b. Tabelas SEM RLS: pior que policy frouxa ─────────────────────────────
-- RLS desligada em tabela exposta ao PostgREST = acesso TOTAL, inclusive anon,
-- sem nem precisar de uma policy permissiva. São 8, e duas doem:
-- `auth_events` (log de autenticação) e `client_monthly_reports` (relatório do
-- cliente). Verificado no código antes de fechar: as páginas que leem
-- client_monthly_reports (/admin/stores/relatorios e a pública /print) usam
-- createAdminClient (service role), que bypassa RLS — ligar aqui não as quebra,
-- e o controle de quem vê o relatório continua sendo o canAccessReport do app.
DO $$
DECLARE
  t         text;
  -- de negócio: RLS + policy de org
  negocio   text[] := ARRAY['auth_events','client_competitors','client_monthly_reports',
                            'cs_events','store_activity'];
  -- backups: RLS sem policy nenhuma = só service role enxerga. Podem ser
  -- DROPADOS quando alguém confirmar que não servem mais; fechar já resolve
  -- o vazamento sem destruir nada.
  backups   text[] := ARRAY['email_blueprints_bkp_20260829',
                            'email_component_variants_backup_20260708',
                            'email_outline_templates_bkp_20260829'];
BEGIN
  FOREACH t IN ARRAY negocio LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_rw', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING (is_org_member()) WITH CHECK (is_org_member())',
      t || '_org_rw', t
    );
  END LOOP;

  FOREACH t IN ARRAY backups LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── 3. VERIFICAÇÃO — rode junto e leia os números ───────────────────────────
-- Esperado:  anon_aberto = 0
--            tabelas_sem_rls = 0
--            crm_sem_cobertura = 0   (nenhuma tabela do CRM ficou inacessível)
--            financeiro_ok = 2       (as duas mantêm ALL para membro logado)
SELECT
  (SELECT count(*) FROM pg_policies
     WHERE schemaname='public' AND roles='{public}' AND qual='true') AS anon_aberto,
  (SELECT count(*) FROM unnest(ARRAY[
      'crm_ad_accounts','crm_ad_insights','crm_ad_spend','crm_contacts',
      'crm_deal_activities','crm_deal_history','crm_deal_products','crm_deal_tags',
      'crm_health_history','crm_leads','crm_lost_reasons','crm_partners',
      'crm_products','crm_sales_goals','crm_saved_views']) AS t(nome)
    WHERE to_regclass('public.'||t.nome) IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM pg_policies p
                      WHERE p.schemaname='public' AND p.tablename=t.nome
                        AND p.roles='{authenticated}')) AS crm_sem_cobertura,
  (SELECT count(DISTINCT tablename) FROM pg_policies
     WHERE schemaname='public' AND tablename IN ('client_charges','client_subscriptions')
       AND roles='{authenticated}' AND cmd='ALL') AS financeiro_ok,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity) AS tabelas_sem_rls;

-- ── 4. Fumaça obrigatória DEPOIS de aplicar ─────────────────────────────────
-- (a) Como MEMBRO logado: funil comercial, leads, negócios (arrastar um card),
--     produtos, metas, financeiro e a carteira do CS.
-- (b) Como ANÔNIMO — tem de voltar [] (antes voltava as 301 linhas):
--       curl "$SUPABASE_URL/rest/v1/crm_leads?select=id&limit=1" -H "apikey: $ANON_KEY"
-- (c) Formulário público: enviar um lead de teste; tem de continuar entrando.
