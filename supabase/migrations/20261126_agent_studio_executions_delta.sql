-- ═══════════════════════════════════════════════════════════════════════
-- Tempo real na aba Execuções do Estúdio de Agentes (set/2026)
--
-- A aba lia `/api/admin/agents/executions` por SWR a cada 10s: o dado do
-- "agente rodando" já existe no banco em ~0s (o `startGenerationRun` grava
-- a linha com status 'running' ANTES de invocar o modelo), mas a tela só
-- descobria até 10s depois. E baixar o intervalo do SWR era a saída
-- errada: a query da rota filtra com
--
--     .or("generation_batch_id.not.is.null, status.in.(…)")
--
-- e o único índice de `email_flow_emails (updated_at DESC)`
-- (`idx_efe_generated_recent`) é PARCIAL em `generation_batch_id IS NOT
-- NULL` — um OR não é servido por ele. Repetir essa query de 2 em 2
-- segundos, por aba aberta, é exatamente o padrão que custou 372 min de
-- CPU no incidente do inbox (regras 1–3 em CLAUDE.md, seção "Inbox —
-- recuperação de custo no banco").
--
-- Então o SSE não repete a listagem: ele pergunta primeiro "mudou algo?"
-- por esta função, e só quando a resposta é não-vazia é que busca as
-- execuções mexidas. Ociosa, a conexão custa duas varreduras de índice a
-- cada 2s e NÃO manda byte nenhum ao cliente.
--
-- As três pernas são UNION ALL de propósito, uma por índice: um OR único
-- forçaria seq scan em todas.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Índice da perna 2: peça EM VOO, que ainda não tem batch ────────────
--
-- O `generation_batch_id` só é gravado quando a copy volta do n8n, então a
-- geração é invisível para `idx_efe_generated_recent` justamente na janela
-- em que ela pode empacar (fase 1 → dispatch → aguardando callback) — que
-- é a janela que mais interessa ver ao vivo.
--
-- Predicado LITERAL (lista de status escrita à mão, não parâmetro): é o
-- que permite ao plano genérico provar que a query está contida no índice.
-- Com `status = $1` o plano genérico não prova a contenção e cai em seq
-- scan a partir da 6ª execução (regra 2).
--
-- SYNC: a mesma lista vive em `EM_VOO` em
-- `src/lib/services/agent-executions.service.ts`. Divergir não quebra
-- nada em silêncio — o índice deixa de servir e a perna 2 fica lenta.
CREATE INDEX IF NOT EXISTS idx_efe_em_voo_updated
  ON email_flow_emails (updated_at DESC)
  WHERE status IN (
    'pending', 'in_progress', 'copy_generating', 'copy_generating_recovery',
    'copy_ready', 'rendering', 'image_done', 'qa_running'
  );

COMMENT ON INDEX idx_efe_em_voo_updated IS
  'Delta do Estúdio: e-mails em voo por updated_at. Parcial com lista '
  'LITERAL de status (SYNC com EM_VOO em agent-executions.service.ts).';

-- ── A função de delta ──────────────────────────────────────────────────
--
-- Devolve só (email_id, changed_at) — nunca a execução inteira. Quem monta
-- o payload é o serviço, para as duas entradas (REST e SSE) usarem UM
-- montador só e nunca discordarem.
--
-- Sem filtro de loja de propósito: `(p_store_id IS NULL OR …)` é OR
-- parametrizado, o que estraga o plano das três pernas, e a aba não filtra
-- por loja. O recorte de quem pode ver é o gate `canManagePrompts` na
-- rota, igual à listagem REST que já existe.
CREATE OR REPLACE FUNCTION public.agent_studio_executions_delta(
  p_since TIMESTAMPTZ,
  p_limit INT DEFAULT 60
)
RETURNS TABLE (email_id UUID, changed_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT mexidos.id AS email_id, MAX(mexidos.mexido_em) AS changed_at
  FROM (
    -- 1) Status do e-mail mudou, peça que já passou pelo pipeline.
    --    (usa idx_efe_generated_recent)
    -- Sem alias de coluna nas pernas: a lista `AS mexidos(id, mexido_em)`
    -- renomeia por POSIÇÃO. (`at` seria alias arriscado — é keyword do
    -- Postgres, de `AT TIME ZONE`.)
    SELECT e.id, e.updated_at
    FROM email_flow_emails e
    WHERE e.updated_at > p_since
      AND e.generation_batch_id IS NOT NULL

    UNION ALL

    -- 2) Status do e-mail mudou, peça em voo sem batch ainda.
    --    (usa idx_efe_em_voo_updated)
    SELECT e.id, e.updated_at
    FROM email_flow_emails e
    WHERE e.updated_at > p_since
      AND e.status IN (
        'pending', 'in_progress', 'copy_generating',
        'copy_generating_recovery', 'copy_ready', 'rendering',
        'image_done', 'qa_running'
      )

    UNION ALL

    -- 3) Uma run do e-mail mexeu: agente ACIONADO (INSERT com 'running')
    --    ou concluído (UPDATE para success/error/skipped). É esta perna
    --    que acende o nó no canvas no instante em que o agente começa.
    --    (usa idx_gen_runs_updated)
    SELECT r.email_id, r.updated_at
    FROM email_generation_runs r
    WHERE r.updated_at > p_since
      AND r.email_id IS NOT NULL
      AND r.agent <> 'component_test'
  ) AS mexidos(id, mexido_em)
  GROUP BY mexidos.id
  -- ASC de propósito: quem consome tem teto por volta, e cortar pelos
  -- MAIS NOVOS deixaria as mudanças antigas atrás do cursor para sempre.
  -- Do jeito certo, o corte só adia — a volta seguinte pega o resto.
  ORDER BY MAX(mexidos.mexido_em) ASC
  LIMIT p_limit
$$;

COMMENT ON FUNCTION public.agent_studio_executions_delta(TIMESTAMPTZ, INT) IS
  'Estúdio de Agentes: e-mails cuja execução mexeu desde p_since (status '
  'do e-mail ou run de agente). Devolve só ids — o payload é montado por '
  'agent-executions.service.ts. Três pernas UNION ALL, uma por índice.';

-- `security definer` + revoke: o gate é na rota (canManagePrompts), e a
-- função lê e-mails de toda a org. Mesmo desenho de
-- agent_studio_latest_runs (migration 20261073).
REVOKE ALL ON FUNCTION public.agent_studio_executions_delta(TIMESTAMPTZ, INT) FROM public;
REVOKE ALL ON FUNCTION public.agent_studio_executions_delta(TIMESTAMPTZ, INT) FROM anon;
REVOKE ALL ON FUNCTION public.agent_studio_executions_delta(TIMESTAMPTZ, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.agent_studio_executions_delta(TIMESTAMPTZ, INT) TO service_role;
