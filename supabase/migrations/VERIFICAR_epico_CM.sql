-- ============================================================
-- ÉPICO CM — verificador de UM statement só.
--
-- Por que existe: o SQL Editor do Supabase mostra o resultado de UM
-- statement. Um script com `DO ... $$; SELECT ...;` volta como
-- "Success. No rows returned" — o DO rodou, mas o relatório não aparece.
-- Este arquivo é um único SELECT: cole, rode, leia.
--
-- Não escreve nada. Nunca falha por tabela ausente: tudo passa por
-- `to_regclass` antes, e a leitura de dados vai por `query_to_xml` dentro
-- de um CASE (que faz short-circuit) — a query só é montada quando a
-- relação existe.
--
-- Leitura do resultado:
--   estado 'ok'      → aplicado
--   estado 'AUSENTE' → falta aplicar (ou o banco é outro)
--   estado 'PENDENTE'→ a migration não rodou, o valor antigo continua lá
-- ============================================================

WITH
-- Onde cada relação vive de fato (ajuda a distinguir "não existe" de
-- "existe em outro schema", que produzem o mesmo 42P01).
loc AS (
  SELECT t.nome,
         (SELECT n.nspname
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE c.relname = t.nome
             AND n.nspname NOT IN ('pg_catalog', 'information_schema')
           ORDER BY (n.nspname = 'public') DESC
           LIMIT 1) AS schema
    FROM (VALUES
      ('email_agent_configs'), ('email_component_variants'),
      ('email_generation_runs'), ('email_flow_emails'),
      ('email_flows'), ('client_stores'), ('v_email_generation_logs')
    ) AS t(nome)
)

-- 1. As relações de que o épico depende.
SELECT 10 AS ordem,
       'relação ' || nome AS item,
       CASE
         WHEN to_regclass('public.' || nome) IS NOT NULL THEN 'ok'
         WHEN schema IS NOT NULL                         THEN 'EM OUTRO SCHEMA'
         ELSE 'AUSENTE'
       END AS estado,
       COALESCE('schema: ' || schema, 'não existe em nenhum schema') AS detalhe
  FROM loc

UNION ALL

-- 2. 20261056 — a coluna do hash de origem. Bloqueante para a hero: o
--    select da variante inclui esta coluna.
SELECT 20,
       '20261056 · coluna rendered_html_source_sha',
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name   = 'email_component_variants'
            AND column_name  = 'rendered_html_source_sha'
       ) THEN 'ok' ELSE 'AUSENTE' END,
       CASE WHEN EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name   = 'email_component_variants'
            AND column_name  = 'rendered_html_source_sha'
       ) THEN 'presente'
         ELSE 'sem ela o carregamento da variante da hero falha' END

UNION ALL

-- 3. 20261055 — as 4 colunas derivadas que a listagem de logs seleciona.
SELECT 30,
       '20261055 · colunas de curadoria na view de logs',
       CASE WHEN (
         SELECT count(*) FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name   = 'v_email_generation_logs'
            AND column_name IN ('curation_skipped_blocks',
                                'curation_excluded_untagged',
                                'curation_rank_deviations',
                                'curation_rendered_stale')
       ) = 4 THEN 'ok' ELSE 'AUSENTE' END,
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name   = 'v_email_generation_logs'
           AND column_name IN ('curation_skipped_blocks',
                               'curation_excluded_untagged',
                               'curation_rank_deviations',
                               'curation_rendered_stale')) || ' de 4 presentes'

UNION ALL

-- 4. 20261052/53/54 — os prompts zerados. `system_prompt` com 0 chars é o
--    sinal de que o corte seco entrou e os defaults novos in-code assumem.
--    Qualquer coisa > 0 é o prompt ANTIGO gravado no banco ainda mandando.
SELECT 40,
       '20261052/53/54 · prompts das configs ativas',
       CASE
         WHEN to_regclass('public.email_agent_configs') IS NULL THEN 'AUSENTE'
         WHEN COALESCE((xpath('//r/text()', query_to_xml(
                $q$SELECT COALESCE(SUM(length(system_prompt) + length(user_template)), -1) AS r
                     FROM public.email_agent_configs
                    WHERE is_active = true
                      AND agent_type IN ('assembler_chooser','assembler','hero_section')$q$,
                false, true, '')))[1]::text::int, -1) = 0
           THEN 'ok'
         ELSE 'PENDENTE'
       END,
       CASE
         WHEN to_regclass('public.email_agent_configs') IS NULL
           THEN 'tabela email_agent_configs não existe neste banco'
         ELSE COALESCE((xpath('//r/text()', query_to_xml(
                $q$SELECT COALESCE(string_agg(
                       agent_type || ': system=' || length(system_prompt) ||
                       'ch, user=' || length(user_template) ||
                       'ch, max_tokens=' || max_tokens,
                       ' | ' ORDER BY agent_type), 'nenhuma config ativa') AS r
                     FROM public.email_agent_configs
                    WHERE is_active = true
                      AND agent_type IN ('assembler_chooser','assembler','hero_section')$q$,
                false, true, '')))[1]::text, 'nenhuma config ativa')
       END

UNION ALL

-- 5. Fila de recadastro do exemplo renderizado (CM-6). Não é aplicação de
--    migration, é medida de curadoria: a diferença entre "com exemplo" e
--    "com hash" é o que ainda precisa ser regravado.
SELECT 50,
       'CM-6 · fila de recadastro do renderizado',
       'informativo',
       CASE
         WHEN to_regclass('public.email_component_variants') IS NULL
           THEN 'tabela email_component_variants não existe neste banco'
         WHEN NOT EXISTS (
           SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name   = 'email_component_variants'
              AND column_name  = 'rendered_html_source_sha')
           THEN 'coluna do hash ainda não existe — rode a 20261056'
         ELSE COALESCE((xpath('//r/text()', query_to_xml(
                $q$SELECT COUNT(*) || ' ativas, ' ||
                          COUNT(*) FILTER (WHERE COALESCE(rendered_html, '') <> '') ||
                          ' com exemplo, ' ||
                          COUNT(*) FILTER (WHERE rendered_html_source_sha IS NOT NULL) ||
                          ' com hash' AS r
                     FROM public.email_component_variants
                    WHERE is_active = true$q$,
                false, true, '')))[1]::text, 'sem dados')
       END

ORDER BY ordem, item;
