-- ============================================================
-- RLS round 5B — tirar o PORTAL do banco interno
-- ============================================================
-- APLICADA EM PRODUÇÃO EM 08/09, com medição antes/depois. Registrada aqui
-- para o histórico e para reaplicar em outro ambiente.
--
-- Depois do 5A não sobrou nada aberto ao anon, mas restavam 53 tabelas com
-- `TO authenticated USING (true)`. Authenticated inclui os usuários que NÃO
-- são membros da org (os do portal do cliente): eles alcançavam o CRM, o
-- Estúdio de e-mail, os onboardings e as tarefas inteiras.
--
-- A troca é `true` → `is_org_member()`, mantendo o MESMO comando de cada
-- policy. Duas propriedades tornam isso seguro:
--
--   1. NUNCA AFROUXA. A policy que sai é mais permissiva que a que entra
--      (`true` ⊇ `is_org_member()`), então nenhum controle fino existente é
--      anulado. (`clients`, que tem "Access clients by permission", não está
--      nesta lista — não possui policy frouxa.)
--   2. NUNCA RESTRINGE PARA MEMBRO. Quem é membro passa em `is_org_member()`,
--      então enxerga exatamente o mesmo de antes. Há UMA org e ninguém
--      pertence a duas.
--
-- ORDEM: cria a nova ANTES de dropar a antiga. Policies permissivas são OR,
-- então entre os dois passos a cobertura só AUMENTA — não existe instante em
-- que a tabela fique sem acesso. Dropar primeiro abriria essa janela.
--
-- Cobre também as policies de INSERT, cujo `true` mora em WITH CHECK e não em
-- USING: filtrar só por `qual` deixaria a porta de escrita aberta.
--
-- PROVA (medida, não suposta): as contagens que um membro enxerga em cada uma
-- das 54 tabelas foram capturadas ANTES e DEPOIS e são IDÊNTICAS, item a item.
-- Escrita (INSERT/UPDATE/DELETE) testada em tags, crm_quick_replies,
-- store_feedback_calls e email_generation_settings. Portal e anon: zero.
--
-- Idempotente.
-- ============================================================

DO $$
DECLARE
  r        RECORD;
  v_nome   TEXT;
  n_novas  INT := 0;
  n_velhas INT := 0;
BEGIN
  -- ── Passo 1: criar a policy de org equivalente ────────────────────────
  FOR r IN
    SELECT tablename, policyname, cmd
    FROM pg_policies
    WHERE schemaname = 'public'
      AND roles = '{authenticated}'
      AND (qual = 'true' OR (qual IS NULL AND with_check = 'true'))
  LOOP
    v_nome := left(r.tablename || '_orgm_' || lower(r.cmd), 63);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_nome, r.tablename);

    IF r.cmd = 'SELECT' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (is_org_member())',
        v_nome, r.tablename);
    ELSIF r.cmd = 'INSERT' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (is_org_member())',
        v_nome, r.tablename);
    ELSIF r.cmd = 'DELETE' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (is_org_member())',
        v_nome, r.tablename);
    ELSIF r.cmd = 'UPDATE' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (is_org_member()) WITH CHECK (is_org_member())',
        v_nome, r.tablename);
    ELSE -- ALL
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (is_org_member()) WITH CHECK (is_org_member())',
        v_nome, r.tablename);
    END IF;

    n_novas := n_novas + 1;
  END LOOP;

  -- ── Passo 2: só agora remover as frouxas ──────────────────────────────
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND roles = '{authenticated}'
      AND (qual = 'true' OR (qual IS NULL AND with_check = 'true'))
      AND policyname NOT LIKE '%\_orgm\_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    n_velhas := n_velhas + 1;
  END LOOP;

  RAISE NOTICE 'round5b: % policies de org criadas, % frouxas removidas.', n_novas, n_velhas;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── VERIFICAÇÃO — os quatro têm de voltar 0 ────────────────────────────────
SELECT
  (SELECT count(*) FROM pg_policies
     WHERE schemaname='public' AND roles='{public}' AND qual='true')                AS anon_aberto,
  (SELECT count(*) FROM pg_policies
     WHERE schemaname='public' AND roles='{authenticated}'
       AND (qual='true' OR (qual IS NULL AND with_check='true')))                   AS authenticated_true,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity)           AS sem_rls,
  (SELECT count(*) FROM pg_policies
     WHERE schemaname='public'
       AND tablename IN ('crm_forms','crm_form_fields','crm_form_submissions')
       AND roles='{public}') - 3                                                    AS form_publico_perdeu;

-- Fumaça obrigatória DEPOIS de aplicar:
--   (a) como MEMBRO: inbox, funil, financeiro, carteira, Estúdio, tarefas.
--   (b) como usuário do PORTAL: o portal do cliente continua abrindo.
--   (c) formulário público: enviar um lead de teste.
