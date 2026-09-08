-- ============================================================
-- pipeline_members: policy que consulta a PRÓPRIA tabela = recursão
-- ============================================================
-- APLICADA EM PRODUÇÃO EM 08/09. Registrada aqui para o histórico.
--
-- `pm_select` fazia EXISTS (SELECT 1 FROM pipeline_members ...) DENTRO da
-- policy de pipeline_members: a subconsulta reaplica a policy, que reaplica
-- a subconsulta. Qualquer leitura por `authenticated` estourava com
--   42P17: infinite recursion detected in policy for relation
-- e levava junto `pipelines` e `pipeline_stages`, cujas policies fazem
-- EXISTS nesta tabela.
--
-- LATENTE, não ativo: todas as leituras no código (/admin/pipeline,
-- /api/pipeline, /api/pipeline/members) usam createAdminClient (service
-- role), que bypassa RLS — por isso ninguém tropeçou nisso em produção.
-- Foi descoberto porque bloqueava a VERIFICAÇÃO do round 5B: não dava para
-- medir o que um membro enxerga se a consulta estoura.
--
-- Conserto pelo padrão da casa (is_admin, is_org_member e can_access_store
-- já são assim): função SECURITY DEFINER, que roda como o owner e portanto
-- NÃO reaplica a policy na subconsulta. `search_path` fixo porque SECURITY
-- DEFINER sem ele é escalada de privilégio via schema no caminho.
--
-- A SEMÂNTICA É A MESMA: quem é membro do pipeline vê os membros dele; quem
-- é owner do pipeline (ou admin) edita e remove.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_pipeline_member(p_pipeline_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM pipeline_members
     WHERE pipeline_id = p_pipeline_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_pipeline_owner(p_pipeline_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM pipeline_members
     WHERE pipeline_id = p_pipeline_id AND user_id = auth.uid()
       AND role = 'owner'::pipeline_member_role
  );
$$;

COMMENT ON FUNCTION public.is_pipeline_member(UUID) IS
  'SECURITY DEFINER para quebrar a recursão de RLS em pipeline_members: a subconsulta roda como owner e não reaplica a policy.';

DROP POLICY IF EXISTS pm_select ON public.pipeline_members;
CREATE POLICY pm_select ON public.pipeline_members
  FOR SELECT TO authenticated USING (is_pipeline_member(pipeline_id) OR is_admin());

DROP POLICY IF EXISTS pm_update ON public.pipeline_members;
CREATE POLICY pm_update ON public.pipeline_members
  FOR UPDATE TO authenticated USING (is_pipeline_owner(pipeline_id) OR is_admin());

DROP POLICY IF EXISTS pm_delete ON public.pipeline_members;
CREATE POLICY pm_delete ON public.pipeline_members
  FOR DELETE TO authenticated USING (is_pipeline_owner(pipeline_id) OR is_admin());

NOTIFY pgrst, 'reload schema';

-- Verificação: como membro NÃO-admin, as três tabelas têm de responder.
--   SET LOCAL ROLE authenticated;
--   SET LOCAL request.jwt.claims = '{"sub":"<profile_id>","role":"authenticated"}';
--   SELECT count(*) FROM pipeline_members;  -- antes: 42P17
