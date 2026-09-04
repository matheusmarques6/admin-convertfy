-- ============================================================
-- "Está tudo pronto para gerar?" — relatório de UM statement só.
--
-- Cobre as três coisas que quebram uma geração hoje:
--   1. COLUNAS que o código passou a selecionar (falta = query falha);
--   2. PROMPTS do banco (o default in-code não alcança os que têm texto);
--   3. DADOS mínimos da biblioteca (variante sem placeholder é
--      impreenchível; sem design system o agente não tem especificação).
--
-- Não escreve nada. Nunca falha por tabela ausente: presença vai por
-- `to_regclass` e leitura de dados por `query_to_xml` dentro de um CASE,
-- que faz short-circuit.
--
-- Leitura: estado 'ok' = pronto. 'AUSENTE'/'PENDENTE' = falta rodar.
-- 'informativo' = número para você julgar, não é erro.
-- ============================================================

-- ── 1. Colunas e objetos ─────────────────────────────────────────────
SELECT 10 AS ordem, 'coluna design_system (20261059)' AS item,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='email_component_variants'
                AND column_name='design_system') THEN 'ok' ELSE 'AUSENTE' END AS estado,
       'sem ela o select da variante da hero falha' AS detalhe
UNION ALL
SELECT 11, 'coluna photo_direction (20261060)',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='email_component_variants'
                AND column_name='photo_direction') THEN 'ok' ELSE 'AUSENTE' END,
       'sem ela a direção fotográfica não chega ao agente de imagem'
UNION ALL
SELECT 12, 'coluna rendered_html_source_sha (20261056)',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='email_component_variants'
                AND column_name='rendered_html_source_sha') THEN 'ok' ELSE 'AUSENTE' END,
       'hash de origem do exemplo renderizado (CM-6)'
UNION ALL
SELECT 13, 'coluna hero_vision_model (20261058)',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='email_generation_settings'
                AND column_name='hero_vision_model') THEN 'ok' ELSE 'AUSENTE' END,
       'opcional — sem ela o default in-code assume'
UNION ALL
SELECT 15, 'colunas variant_id + fields em email_blocks (20261065)',
       CASE WHEN (SELECT count(*) FROM information_schema.columns
              WHERE table_schema='public' AND table_name='email_blocks'
                AND column_name IN ('variant_id','fields')) = 2
            THEN 'ok' ELSE 'AUSENTE' END,
       'sem elas o dispatch quebra — o bloco é o schema'
UNION ALL
SELECT 16, 'blocos já com contrato de copy gravado',
       'informativo',
       CASE WHEN (SELECT count(*) FROM information_schema.columns
              WHERE table_schema='public' AND table_name='email_blocks'
                AND column_name='fields') = 0 THEN 'coluna ainda não existe'
       ELSE COALESCE((xpath('//r/text()', query_to_xml(
         $q$SELECT COUNT(*) FILTER (
                     WHERE jsonb_array_length(COALESCE(fields,'[]'::jsonb)) > 0)
                   || ' de ' || COUNT(*) || ' blocos' AS r
              FROM public.email_blocks$q$,
         false, true, '')))[1]::text, 'sem dados') END
UNION ALL
SELECT 14, 'view v_email_generation_logs com sinais de curadoria (20261055)',
       CASE WHEN (SELECT count(*) FROM information_schema.columns
              WHERE table_schema='public' AND table_name='v_email_generation_logs'
                AND column_name IN ('curation_skipped_blocks','curation_excluded_untagged',
                                    'curation_rank_deviations','curation_rendered_stale')) = 4
            THEN 'ok' ELSE 'AUSENTE' END,
       'sem as 4 colunas a página de logs dá 500'

-- ── 2. Prompts do banco ──────────────────────────────────────────────
UNION ALL
SELECT 20, 'prompts do Curador/Montador/Hero zerados (20261052-54)',
       CASE
         WHEN to_regclass('public.email_agent_configs') IS NULL THEN 'AUSENTE'
         WHEN COALESCE((xpath('//r/text()', query_to_xml(
                $q$SELECT COALESCE(SUM(length(system_prompt) + length(user_template)), -1) AS r
                     FROM public.email_agent_configs
                    WHERE is_active = true
                      AND agent_type IN ('assembler_chooser','assembler','hero_section')$q$,
                false, true, '')))[1]::text::int, -1) = 0
           THEN 'ok' ELSE 'PENDENTE' END,
       'qualquer coisa > 0 = prompt antigo do banco mandando; o Curador morre em catalogo_ausente'
UNION ALL
SELECT 21, 'regra "sem texto na imagem" (20261057)',
       CASE WHEN to_regclass('public.email_agent_configs') IS NULL THEN 'AUSENTE'
            WHEN COALESCE((xpath('//r/text()', query_to_xml(
                   $q$SELECT COUNT(*) AS r FROM public.email_agent_configs
                        WHERE agent_type='image' AND is_active = true
                          AND system_prompt LIKE '%CFY_NO_TEXT_RULE%'$q$,
                   false, true, '')))[1]::text::int, 0) > 0 THEN 'ok' ELSE 'AUSENTE' END,
       'sem ela a headline volta a sair queimada no PNG'
UNION ALL
SELECT 22, 'direção fotográfica no prompt de imagem (20261061)',
       CASE WHEN to_regclass('public.email_agent_configs') IS NULL THEN 'AUSENTE'
            WHEN COALESCE((xpath('//r/text()', query_to_xml(
                   $q$SELECT COUNT(*) AS r FROM public.email_agent_configs
                        WHERE agent_type='image' AND is_active = true
                          AND user_template LIKE '%CFY_PHOTO_DIRECTION%'$q$,
                   false, true, '')))[1]::text::int, 0) > 0 THEN 'ok' ELSE 'AUSENTE' END,
       'sem ela o campo photo_direction não tem efeito nenhum'
UNION ALL
SELECT 23, 'fundo pela paleta + enquadramento (20261063)',
       CASE WHEN to_regclass('public.email_agent_configs') IS NULL THEN 'AUSENTE'
            WHEN COALESCE((xpath('//r/text()', query_to_xml(
                   $q$SELECT COUNT(*) AS r FROM public.email_agent_configs
                        WHERE agent_type='image' AND is_active = true
                          AND user_template LIKE '%CFY_BACKDROP_V2%'$q$,
                   false, true, '')))[1]::text::int, 0) > 0 THEN 'ok' ELSE 'AUSENTE' END,
       'sem ela a foto escolhe um neutro fora da marca e corta a cabeça do modelo'
UNION ALL
SELECT 24, 'prompt do Taguedor zerado (20261064)',
       CASE WHEN to_regclass('public.email_agent_configs') IS NULL THEN 'AUSENTE'
            WHEN COALESCE((xpath('//r/text()', query_to_xml(
                   $q$SELECT COALESCE(SUM(length(system_prompt)
                                        + length(user_template)), 0) AS r
                        FROM public.email_agent_configs
                       WHERE agent_type='component_tagger' AND is_active = true$q$,
                   false, true, '')))[1]::text::int, 0) = 0
              THEN 'ok' ELSE 'PENDENTE' END,
       'qualquer coisa > 0 = prompt velho mandando; o Taguedor volta a manter tag divergente'

-- ── 3. Agentes ativos ────────────────────────────────────────────────
UNION ALL
-- Config AUSENTE não desativa o step: `resolveAgentSwitch(null)` devolve
-- `disabled: false` e o step roda com os defaults in-code e o
-- FMT_DEFAULT_MODEL. Para image_format/color_format/qa isso é o estado
-- DESEJADO — as migrations 20261044-46 zeraram esses prompts justamente
-- para os defaults assumirem. Só `assembler_chooser`, `assembler` e
-- `hero_section` precisam da linha, porque as 20261052-54 gravam nelas.
SELECT 30, 'configs dos agentes (ausente = roda com default in-code)',
       CASE WHEN to_regclass('public.email_agent_configs') IS NULL THEN 'AUSENTE'
            WHEN COALESCE((xpath('//r/text()', query_to_xml(
                   $q$SELECT COUNT(DISTINCT agent_type) AS r
                        FROM public.email_agent_configs
                       WHERE is_active = true
                         AND agent_type IN ('assembler_chooser','assembler',
                                            'hero_section')$q$,
                   false, true, '')))[1]::text::int, 0) = 3
              THEN 'ok' ELSE 'PENDENTE' END,
       CASE WHEN to_regclass('public.email_agent_configs') IS NULL
              THEN 'tabela email_agent_configs não existe'
       ELSE COALESCE((xpath('//r/text()', query_to_xml(
         $q$SELECT string_agg(agent_type, ', ' ORDER BY agent_type) AS r
              FROM public.email_agent_configs
             WHERE is_active = true
               AND agent_type IN ('assembler_chooser','assembler','blueprint',
                                  'hero_section','image','image_format',
                                  'color_format','qa')$q$,
         false, true, '')))[1]::text, 'nenhuma config ativa') END

-- ── 4. Biblioteca de componentes ─────────────────────────────────────
UNION ALL
SELECT 40, 'variantes ativas preenchíveis (com {{PLACEHOLDER}})',
       CASE WHEN to_regclass('public.email_component_variants') IS NULL THEN 'AUSENTE'
            WHEN COALESCE((xpath('//r/text()', query_to_xml(
                   $q$SELECT COUNT(*) AS r FROM public.email_component_variants
                        WHERE is_active = true
                          AND (html LIKE '%{{%' OR COALESCE(html_tagged,'') LIKE '%{{%')$q$,
                   false, true, '')))[1]::text::int, 0) > 0
              THEN 'ok' ELSE 'PENDENTE' END,
       CASE WHEN to_regclass('public.email_component_variants') IS NULL
              THEN 'tabela email_component_variants não existe'
       ELSE COALESCE((xpath('//r/text()', query_to_xml(
         $q$SELECT COUNT(*) || ' ativas · ' ||
                   COUNT(*) FILTER (WHERE html LIKE '%{{%' OR COALESCE(html_tagged,'') LIKE '%{{%')
                   || ' com placeholder · ' ||
                   COUNT(*) FILTER (WHERE tagging_status = 'approved') || ' com tag aprovada' AS r
              FROM public.email_component_variants WHERE is_active = true$q$,
         false, true, '')))[1]::text, 'sem dados') END
UNION ALL
SELECT 41, 'cobertura do design system',
       'informativo',
       CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='email_component_variants'
                AND column_name='design_system') THEN 'coluna ainda não existe'
       ELSE COALESCE((xpath('//r/text()', query_to_xml(
         $q$SELECT COUNT(*) FILTER (WHERE COALESCE(design_system,'') <> '') || ' de ' ||
                   COUNT(*) || ' variantes ativas' AS r
              FROM public.email_component_variants WHERE is_active = true$q$,
         false, true, '')))[1]::text, 'sem dados') END
UNION ALL
SELECT 42, 'cobertura da direção fotográfica',
       'informativo',
       CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='email_component_variants'
                AND column_name='photo_direction') THEN 'coluna ainda não existe'
       ELSE COALESCE((xpath('//r/text()', query_to_xml(
         $q$SELECT COUNT(*) FILTER (WHERE COALESCE(photo_direction,'') <> '') || ' de ' ||
                   COUNT(*) || ' variantes ativas' AS r
              FROM public.email_component_variants WHERE is_active = true$q$,
         false, true, '')))[1]::text, 'sem dados') END

UNION ALL
-- O schema é a base: cada campo endereça {{MAIÚSCULA_DA_KEY}}. Variante em
-- que isso não bate gera copy sem onde entrar. Detalhe por variante (com a
-- proposta de rename) está em DIAGNOSTICO_schema_x_tags.sql.
SELECT 43, 'variantes com schema desalinhado do HTML',
       CASE WHEN to_regclass('public.email_component_variants') IS NULL THEN 'AUSENTE'
            WHEN COALESCE((xpath('//r/text()', query_to_xml(
                   $q$WITH v AS (
                        SELECT id,
                               CASE WHEN tagging_status='approved'
                                     AND COALESCE(html_tagged,'') <> ''
                                    THEN html_tagged ELSE COALESCE(html,'') END AS h,
                               COALESCE(output_schema,'[]'::jsonb) AS s
                          FROM public.email_component_variants WHERE is_active = true)
                      SELECT COUNT(*) AS r FROM v
                       WHERE EXISTS (
                         SELECT 1 FROM jsonb_array_elements(v.s) f
                          WHERE COALESCE(btrim(f->>'key'),'') <> ''
                            AND COALESCE(f->>'nature',
                                  CASE WHEN f->>'type'='image'
                                       THEN 'imagem_gerada' ELSE 'copy' END) <> 'asset_fixo'
                            AND position('{{' || regexp_replace(upper(btrim(f->>'key')),
                                  '[^A-Z0-9_]+','_','g') || '}}' in v.h) = 0)$q$,
                   false, true, '')))[1]::text::int, 0) = 0
              THEN 'ok' ELSE 'PENDENTE' END,
       CASE WHEN to_regclass('public.email_component_variants') IS NULL
              THEN 'tabela email_component_variants não existe'
       ELSE COALESCE((xpath('//r/text()', query_to_xml(
         $q$WITH v AS (
              SELECT id,
                     CASE WHEN tagging_status='approved'
                           AND COALESCE(html_tagged,'') <> ''
                          THEN html_tagged ELSE COALESCE(html,'') END AS h,
                     COALESCE(output_schema,'[]'::jsonb) AS s
                FROM public.email_component_variants WHERE is_active = true)
            SELECT COUNT(*) FILTER (WHERE EXISTS (
                     SELECT 1 FROM jsonb_array_elements(v.s) f
                      WHERE COALESCE(btrim(f->>'key'),'') <> ''
                        AND COALESCE(f->>'nature',
                              CASE WHEN f->>'type'='image'
                                   THEN 'imagem_gerada' ELSE 'copy' END) <> 'asset_fixo'
                        AND position('{{' || regexp_replace(upper(btrim(f->>'key')),
                              '[^A-Z0-9_]+','_','g') || '}}' in v.h) = 0))
                   || ' de ' || COUNT(*) || ' variantes ativas' AS r
              FROM v$q$,
         false, true, '')))[1]::text, 'sem dados') END

UNION ALL
-- 44. Todo agente com config precisa poder GRAVAR RUN. Faltar no CHECK de
--     email_generation_runs.agent é o buraco mudo que engoliu o `copy_fit`
--     (28/08–01/09) e a `typography` (03/09): o passo roda, custa dinheiro e
--     não deixa rastro — no Estúdio o nó aparece "pulado".
SELECT 44, 'agentes que não conseguem gravar run',
       CASE WHEN to_regclass('public.email_agent_configs') IS NULL
                 OR to_regclass('public.email_generation_runs') IS NULL
              THEN 'PENDENTE'
            WHEN NOT EXISTS (
              SELECT 1 FROM public.email_agent_configs c
               WHERE c.is_active
                 AND NOT EXISTS (
                   SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'public.email_generation_runs'::regclass
                      AND contype = 'c'
                      AND pg_get_constraintdef(oid) ILIKE '%' || c.agent_type || '%'))
              THEN 'ok' ELSE 'PENDENTE' END,
       COALESCE((
         SELECT string_agg(c.agent_type, ', ' ORDER BY c.agent_type)
           FROM public.email_agent_configs c
          WHERE c.is_active
            AND NOT EXISTS (
              SELECT 1 FROM pg_constraint
               WHERE conrelid = 'public.email_generation_runs'::regclass
                 AND contype = 'c'
                 AND pg_get_constraintdef(oid) ILIKE '%' || c.agent_type || '%')
       ), 'todos os agentes ativos estão no CHECK')

ORDER BY ordem;
