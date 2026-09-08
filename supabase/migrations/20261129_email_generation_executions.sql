-- ═══════════════════════════════════════════════════════════════════════
-- A execução como entidade, e os overrides por execução (set/2026)
--
-- Camadas B e C de `docs/email-generation/plano-execucoes-estilo-n8n.md`.
--
-- ── Por que a tabela existe ───────────────────────────────────────────
--
-- Até aqui "execução" era a linha de `email_flow_emails`, e as runs vinham
-- de `agent_studio_latest_runs` = a run MAIS RECENTE por (e-mail, agente),
-- **sem filtrar batch**. Abrir uma execução podia mostrar o Curador de um
-- batch e o Cores de outro: uma colagem, não uma execução. E não havia
-- onde guardar "nesta execução, o Curador está pinado e pare depois da
-- Tipografia" — que é o pedido inteiro.
--
-- ── A linha dura manual × produção ────────────────────────────────────
--
-- `mode` não é rótulo: é o que impede um pin esquecido de mandar ao cliente
-- um e-mail com a copy congelada de outro. Quem decide é `gateFor` em
-- `agents/execucao/overrides.ts`, que devolve gate NEUTRO em produção
-- sempre — mas o CHECK aqui garante que o valor existe e é um dos dois.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS email_generation_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  flow_id UUID REFERENCES email_flows(id) ON DELETE SET NULL,
  email_id UUID NOT NULL REFERENCES email_flow_emails(id) ON DELETE CASCADE,
  -- O batch da copy, quando houver. Fica NULL na fase 1 (o
  -- `generation_batch_id` só nasce quando a copy volta do n8n) — e é
  -- justamente por isso que a execução não podia ser identificada por ele.
  batch_id UUID,
  mode TEXT NOT NULL CHECK (mode IN ('manual', 'producao')),
  triggered_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- O que o operador pediu: {disabled:[], pinned:{}, stop_after, start_from}.
  -- Contrato e validação em `agents/execucao/overrides.ts`.
  overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- O que estava valendo quando começou (modos da aba Configurações +
  -- agent_config_id por agente). É o "snapshot do workflow" do n8n, e é o
  -- que permite dizer que a saída de uma run não representa mais o prompt
  -- em vigor — o "dirty node" deles.
  config_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'paused', 'success', 'error', 'cancelled')),
  -- Onde parou, quando o `stop_after` pegou. Sem isto "pausada" não diz
  -- de onde retomar.
  stopped_at_node TEXT,
  failure_reason TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE email_generation_executions IS
  'Uma execução do pipeline de geração. mode=manual aceita overrides '
  '(desativar/pinar/parar); mode=producao os ignora por construção.';

CREATE INDEX IF NOT EXISTS idx_ege_email
  ON email_generation_executions (email_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_ege_store
  ON email_generation_executions (store_id, started_at DESC);

-- Uma execução manual VIVA por e-mail. É a decisão "uma execução manual
-- por e-mail por vez" virada invariante do banco: duas pessoas testando o
-- mesmo e-mail com overrides diferentes produziriam um HTML que não
-- corresponde a nenhuma das duas, e o segundo disparo tem de tomar 409 em
-- vez de embaralhar.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ege_manual_viva
  ON email_generation_executions (email_id)
  WHERE mode = 'manual' AND status IN ('running', 'paused');

CREATE OR REPLACE FUNCTION fn_touch_email_generation_executions()
RETURNS TRIGGER AS $$
BEGIN
  -- clock_timestamp(), não now(): `now()` é o início da TRANSAÇÃO e não
  -- anda dentro dela (mesma lição do trigger do módulo Conteúdo).
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ege_touch_updated_at ON email_generation_executions;
CREATE TRIGGER trg_ege_touch_updated_at
  BEFORE UPDATE ON email_generation_executions
  FOR EACH ROW
  EXECUTE FUNCTION fn_touch_email_generation_executions();

-- ── O vínculo run → execução ───────────────────────────────────────────
--
-- NULLABLE de propósito: as ~40 mil runs anteriores a esta migration não
-- têm execução, e inventar uma para elas seria fabricar histórico. A aba
-- segue agrupando por e-mail para o que é antigo.
ALTER TABLE email_generation_runs
  ADD COLUMN IF NOT EXISTS execution_id UUID
  REFERENCES email_generation_executions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_gen_runs_execution
  ON email_generation_runs (execution_id)
  WHERE execution_id IS NOT NULL;

-- ── A execução manual viva de um e-mail ────────────────────────────────
--
-- O runner pergunta isto para saber se está sob overrides. Predicados
-- LITERAIS (`mode='manual'`, lista de status) para o índice parcial acima
-- servir a query — com `status = $1` o plano genérico não prova a
-- contenção e cai em seq scan a partir da 6ª execução (regra 2 do
-- CLAUDE.md).
CREATE OR REPLACE FUNCTION public.email_execution_manual_viva(p_email_id UUID)
RETURNS TABLE (
  id UUID,
  mode TEXT,
  status TEXT,
  overrides JSONB,
  stopped_at_node TEXT,
  batch_id UUID,
  started_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.mode, e.status, e.overrides, e.stopped_at_node,
         e.batch_id, e.started_at
  FROM email_generation_executions e
  WHERE e.email_id = p_email_id
    AND e.mode = 'manual'
    AND e.status IN ('running', 'paused')
  ORDER BY e.started_at DESC
  LIMIT 1
$$;

COMMENT ON FUNCTION public.email_execution_manual_viva(UUID) IS
  'A execução manual viva (running|paused) de um e-mail, ou nada. O runner '
  'consulta para saber se está sob overrides.';

REVOKE ALL ON FUNCTION public.email_execution_manual_viva(UUID) FROM public;
REVOKE ALL ON FUNCTION public.email_execution_manual_viva(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.email_execution_manual_viva(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.email_execution_manual_viva(UUID) TO service_role;

-- ── RLS ────────────────────────────────────────────────────────────────
--
-- `TO authenticated` + escopo por ORG, nunca `FOR ALL USING (true)` sem
-- `TO` (regra obrigatória do CLAUDE.md desde o incidente de ago/2026: sem
-- `TO` a policy vale para `anon` — leitura e escrita com a chave pública do
-- browser). Escrita é só pelo service role, que bypassa RLS.
--
-- As tabelas irmãs (`email_generation_runs`, `store_email_references`)
-- ainda estão em `TO authenticated USING (true)` — são parte das 61 linhas
-- que o round 5B do RLS vai fechar. A nova nasce fechada em vez de nascer
-- com o débito: `org_members.profile_id` (não `user_id` — o nome da coluna
-- neste schema) contra `client_stores.org_id`.
--
-- `(select auth.uid())` e não `auth.uid()`: a subquery é avaliada UMA vez
-- por statement em vez de por linha (é a otimização que o round de RLS
-- prevê para todas as policies).
ALTER TABLE email_generation_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members read generation executions"
  ON email_generation_executions;
CREATE POLICY "Org members read generation executions"
  ON email_generation_executions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM client_stores s
      JOIN org_members m ON m.org_id = s.org_id
      WHERE s.id = email_generation_executions.store_id
        AND m.profile_id = (SELECT auth.uid())
        AND m.is_active
    )
  );
