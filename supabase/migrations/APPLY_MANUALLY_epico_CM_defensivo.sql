-- ============================================================
-- ÉPICO CM — versão DEFENSIVA do consolidado (2026-07-30)
--
-- Substitui `CONSOLIDATED_apply_epico_CM.sql` quando ele falha com
--   ERROR: 42P01: relation "email_agent_configs" does not exist
--
-- Diferenças em relação ao consolidado:
--   1. Todos os objetos são qualificados com `public.` e o `search_path` é
--      fixado. Se a tabela existir mas o search_path da sessão não incluir
--      `public`, isto SOZINHO resolve o 42P01.
--   2. Cada bloco só roda se as tabelas de que depende existirem. O que
--      falta é PULADO com aviso, em vez de abortar o script inteiro — as
--      partes aplicáveis entram.
--   3. Termina com um relatório: o que foi aplicado, o que foi pulado e por
--      quê. É o resultado que aparece no SQL Editor.
--
-- LEIA ANTES DE RODAR
-- Se o relatório disser que `email_agent_configs` está AUSENTE, o problema
-- não é este script: essa tabela nasce em `20260621_email_generation_infra.sql`
-- e TODO o pipeline de geração depende dela. Um banco sem ela é um banco sem
-- as migrations do produto — quase sempre o projeto Supabase errado (staging
-- vs produção) ou uma base recriada do zero. Aplicar só o épico CM ali não
-- resolve nada; o caminho é rodar as migrations do repositório na ordem.
--
-- Idempotente: rodar de novo não causa erro.
-- ============================================================

SET search_path = public, pg_temp;

DO $do$
DECLARE
  v_cfg    regclass := to_regclass('public.email_agent_configs');
  v_var    regclass := to_regclass('public.email_component_variants');
  v_runs   regclass := to_regclass('public.email_generation_runs');
  v_stores regclass := to_regclass('public.client_stores');
  v_emails regclass := to_regclass('public.email_flow_emails');
  v_flows  regclass := to_regclass('public.email_flows');
  v_n      integer;
  v_view   text;
BEGIN
  -- Sobra de uma execução anterior na mesma sessão (o SQL Editor reaproveita
  -- conexão). `IF EXISTS` direto emitiria um NOTICE quando o schema temp
  -- ainda nem existe — ruído no meio do relatório.
  IF to_regclass('pg_temp._cm_relatorio') IS NOT NULL THEN
    EXECUTE 'DROP TABLE pg_temp._cm_relatorio';
  END IF;

  CREATE TEMP TABLE _cm_relatorio (
    ordem   int,
    etapa   text,
    estado  text,
    detalhe text
  );

  -- ── 20261052 / 20261053 / 20261054 — prompts dos agentes ────────────
  -- Corte seco: zerar os prompts da config ativa faz os defaults novos
  -- in-code assumirem. Sem o 20261052 o Curador carrega o prompt gravado
  -- pela 20261004, não encontra {{catalogo}} e falha com `catalogo_ausente`
  -- ANTES de invocar o modelo — toda geração morre na fase 1.
  IF v_cfg IS NULL THEN
    INSERT INTO _cm_relatorio VALUES
      (10, '20261052 Curador (prompt + max_tokens 8192)', 'PULADO',
       'tabela public.email_agent_configs não existe'),
      (11, '20261053 Montador (prompt + max_tokens 2048)', 'PULADO',
       'tabela public.email_agent_configs não existe'),
      (12, '20261054 Hero (prompt)', 'PULADO',
       'tabela public.email_agent_configs não existe');
    RAISE NOTICE '[CM] email_agent_configs ausente — 3 etapas de prompt puladas';
  ELSE
    UPDATE public.email_agent_configs
       SET system_prompt = '', user_template = '', max_tokens = 8192
     WHERE agent_type = 'assembler_chooser' AND is_active = true;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    INSERT INTO _cm_relatorio VALUES
      (10, '20261052 Curador (prompt + max_tokens 8192)',
       CASE WHEN v_n > 0 THEN 'aplicado' ELSE 'SEM EFEITO' END,
       v_n || ' linha(s); 0 = não há config ativa para assembler_chooser');

    UPDATE public.email_agent_configs
       SET system_prompt = '', user_template = '', max_tokens = 2048
     WHERE agent_type = 'assembler' AND is_active = true;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    INSERT INTO _cm_relatorio VALUES
      (11, '20261053 Montador (prompt + max_tokens 2048)',
       CASE WHEN v_n > 0 THEN 'aplicado' ELSE 'SEM EFEITO' END,
       v_n || ' linha(s); 0 = não há config ativa para assembler');

    UPDATE public.email_agent_configs
       SET system_prompt = '', user_template = ''
     WHERE agent_type = 'hero_section' AND is_active = true;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    INSERT INTO _cm_relatorio VALUES
      (12, '20261054 Hero (prompt)',
       CASE WHEN v_n > 0 THEN 'aplicado' ELSE 'sem efeito (ok)' END,
       v_n || ' linha(s); já estava vazio desde a 20261049');
  END IF;

  -- ── 20261056 — hash de origem do renderizado ────────────────────────
  -- BLOQUEANTE para a hero: o select da variante inclui esta coluna.
  IF v_var IS NULL THEN
    INSERT INTO _cm_relatorio VALUES
      (20, '20261056 coluna rendered_html_source_sha', 'PULADO',
       'tabela public.email_component_variants não existe');
  ELSE
    EXECUTE 'ALTER TABLE public.email_component_variants
               ADD COLUMN IF NOT EXISTS rendered_html_source_sha TEXT';
    EXECUTE $c$COMMENT ON COLUMN public.email_component_variants.rendered_html_source_sha IS
      'sha256 do `html` no momento em que `rendered_html` foi salvo (story CM-6). Hash diferente do html atual = exemplo desatualizado (ressalva, não bloqueio). NULL = cadastrado antes do hash existir (validade desconhecida).'$c$;
    INSERT INTO _cm_relatorio VALUES
      (20, '20261056 coluna rendered_html_source_sha', 'aplicado',
       'ADD COLUMN IF NOT EXISTS + COMMENT');
  END IF;

  -- ── 20261055 — sinais de curadoria na view de logs ──────────────────
  -- BLOQUEANTE para a página de logs: a API pede as colunas derivadas aqui.
  IF v_runs IS NULL OR v_stores IS NULL OR v_emails IS NULL OR v_flows IS NULL THEN
    INSERT INTO _cm_relatorio VALUES
      (30, '20261055 view v_email_generation_logs', 'PULADO',
       'faltam tabelas base: ' ||
       concat_ws(', ',
         CASE WHEN v_runs   IS NULL THEN 'email_generation_runs' END,
         CASE WHEN v_stores IS NULL THEN 'client_stores'         END,
         CASE WHEN v_emails IS NULL THEN 'email_flow_emails'     END,
         CASE WHEN v_flows  IS NULL THEN 'email_flows'           END));
  ELSE
    v_view := $v$
      CREATE OR REPLACE VIEW public.v_email_generation_logs AS
      SELECT
        r.id, r.created_at, r.batch_id, r.agent, r.model, r.status,
        r.tokens_input, r.tokens_output, r.cost_cents, r.duration_ms,
        r.retry_count, r.error_message, r.input_vars, r.parsed_output,
        r.store_id, s.store_name,
        r.email_id, e.name AS email_name, e.number AS email_position,
        r.flow_id, f.flow_type,
        (r.agent = 'qa' AND COALESCE((r.parsed_output->>'vision_ran')::boolean, false))
          AS is_qa_vision,
        CASE
          WHEN jsonb_typeof(r.parsed_output->'blocks_skipped') = 'array'
            THEN jsonb_array_length(r.parsed_output->'blocks_skipped')
          WHEN jsonb_typeof(r.parsed_output->'empty_blocks') = 'array'
            THEN jsonb_array_length(r.parsed_output->'empty_blocks')
          ELSE 0
        END AS curation_skipped_blocks,
        CASE
          WHEN jsonb_typeof(r.parsed_output->'candidates_excluded_untagged') = 'object'
            THEN (
              SELECT COALESCE(SUM(
                CASE WHEN jsonb_typeof(v.value) = 'array'
                  THEN jsonb_array_length(v.value) ELSE 0 END
              ), 0)
              FROM jsonb_each(r.parsed_output->'candidates_excluded_untagged') AS v
            )
          ELSE 0
        END AS curation_excluded_untagged,
        CASE
          WHEN jsonb_typeof(r.parsed_output->'desvios') = 'number'
            THEN (r.parsed_output->>'desvios')::int
          ELSE 0
        END AS curation_rank_deviations,
        COALESCE((r.parsed_output->'rendered_reference'->>'stale')::boolean, false)
          AS curation_rendered_stale
      FROM public.email_generation_runs r
      LEFT JOIN public.client_stores     s ON s.id = r.store_id
      LEFT JOIN public.email_flow_emails e ON e.id = r.email_id
      LEFT JOIN public.email_flows       f ON f.id = r.flow_id
    $v$;

    BEGIN
      EXECUTE v_view;
      INSERT INTO _cm_relatorio VALUES
        (30, '20261055 view v_email_generation_logs', 'aplicado',
         'CREATE OR REPLACE');
    EXCEPTION WHEN OTHERS THEN
      -- CREATE OR REPLACE só aceita ACRESCENTAR colunas no fim. Se a view
      -- existente for de uma geração anterior (sem is_qa_vision, por
      -- exemplo), a única saída é recriar. Nada no produto depende dela por
      -- FK ou GRANT específico — é lida via service role.
      EXECUTE 'DROP VIEW IF EXISTS public.v_email_generation_logs CASCADE';
      EXECUTE v_view;
      INSERT INTO _cm_relatorio VALUES
        (30, '20261055 view v_email_generation_logs', 'aplicado (recriada)',
         'CREATE OR REPLACE falhou (colunas incompatíveis): ' || SQLERRM);
    END;
  END IF;

  -- ── Diagnóstico dos objetos ─────────────────────────────────────────
  -- Distingue os três casos que produzem o mesmo 42P01 no consolidado:
  -- objeto no lugar certo, objeto em OUTRO schema (o script fala com
  -- `public.`, então continuaria falhando) e objeto que não existe.
  INSERT INTO _cm_relatorio
  SELECT 40 + row_number() OVER (ORDER BY t.nome),
         'objeto ' || t.nome,
         CASE
           WHEN to_regclass('public.' || t.nome) IS NOT NULL THEN 'presente'
           WHEN loc.nspname IS NOT NULL                      THEN 'EM OUTRO SCHEMA'
           ELSE 'AUSENTE'
         END,
         COALESCE('schema: ' || loc.nspname, 'não existe em nenhum schema')
    FROM (VALUES
      ('email_agent_configs'), ('email_component_variants'),
      ('email_generation_runs'), ('email_flow_emails'),
      ('email_flows'), ('client_stores'), ('v_email_generation_logs')
    ) AS t(nome)
    LEFT JOIN LATERAL (
      SELECT n.nspname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relname = t.nome
         AND n.nspname NOT IN ('pg_catalog', 'information_schema')
       ORDER BY (n.nspname = 'public') DESC
       LIMIT 1
    ) loc ON true;

  -- ── Estado das configs (só se a tabela existir) ─────────────────────
  IF v_cfg IS NOT NULL THEN
    INSERT INTO _cm_relatorio
    SELECT 60, 'config ativa ' || agent_type, 'ok',
           'system=' || length(system_prompt) || ' chars, user=' ||
           length(user_template) || ' chars, max_tokens=' || max_tokens ||
           ', model=' || model
      FROM public.email_agent_configs
     WHERE is_active = true
       AND agent_type IN ('assembler_chooser', 'assembler', 'hero_section');
  END IF;

  -- ── Fila de recadastro do renderizado ───────────────────────────────
  IF v_var IS NOT NULL THEN
    EXECUTE $q$
      INSERT INTO _cm_relatorio
      SELECT 70, 'variantes ativas', 'ok',
             COUNT(*) || ' ativas, ' ||
             COUNT(*) FILTER (WHERE COALESCE(rendered_html, '') <> '') ||
             ' com exemplo renderizado, ' ||
             COUNT(*) FILTER (WHERE rendered_html_source_sha IS NOT NULL) ||
             ' com hash (a diferença é a fila de recadastro)'
        FROM public.email_component_variants
       WHERE is_active = true
    $q$;
  END IF;
END
$do$;

-- Relatório final: o que entrou, o que ficou de fora e por quê.
SELECT ordem, etapa, estado, detalhe
  FROM pg_temp._cm_relatorio
 ORDER BY ordem, etapa;
