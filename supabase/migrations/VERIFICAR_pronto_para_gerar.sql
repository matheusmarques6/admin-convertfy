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
SELECT 23, 'cor de fundo no prompt de imagem (20261062)',
       CASE WHEN to_regclass('public.email_agent_configs') IS NULL THEN 'AUSENTE'
            WHEN COALESCE((xpath('//r/text()', query_to_xml(
                   $q$SELECT COUNT(*) AS r FROM public.email_agent_configs
                        WHERE agent_type='image' AND is_active = true
                          AND user_template LIKE '%CFY_BG_COLOR%'$q$,
                   false, true, '')))[1]::text::int, 0) > 0 THEN 'ok' ELSE 'AUSENTE' END,
       'sem ela a foto não funde com o fundo da seção'

-- ── 3. Agentes ativos ────────────────────────────────────────────────
UNION ALL
SELECT 30, 'configs ativas dos agentes da cadeia',
       CASE WHEN to_regclass('public.email_agent_configs') IS NULL THEN 'AUSENTE'
            WHEN COALESCE((xpath('//r/text()', query_to_xml(
                   $q$SELECT COUNT(DISTINCT agent_type) AS r
                        FROM public.email_agent_configs
                       WHERE is_active = true
                         AND agent_type IN ('assembler_chooser','assembler','blueprint',
                                            'hero_section','image','image_format',
                                            'color_format','qa')$q$,
                   false, true, '')))[1]::text::int, 0) = 8
              THEN 'ok' ELSE 'INCOMPLETO' END,
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

ORDER BY ordem;
