-- ============================================================
-- Trocar o MODELO de um agente de geração de e-mail
-- ============================================================
-- Não é migration: é receita para rodar à mão no SQL Editor.
-- Os modelos vivem em `email_agent_configs` e são lidos em runtime
-- por `loadActiveAgentConfig(agent_type)` — trocar aqui vale na
-- PRÓXIMA run, sem deploy.
--
-- TRÊS COISAS QUE QUEBRAM SE FOREM IGNORADAS
--
-- 1. O "/" no slug ESCOLHE O PROVEDOR.
--    `model.includes("/")` (openrouter-invoke.ts:25, llm-invoke.ts:141)
--    roteia para o OpenRouter; sem "/" vai pelo SDK da Anthropic, com a
--    ANTHROPIC_API_KEY. Então `claude-opus-4-7` e
--    `anthropic/claude-opus-4-7` NÃO são o mesmo registro: um cobra numa
--    conta, o outro na outra, e trocar de forma sem querer move a fatura
--    de lugar. Só use nome sem "/" quando for modelo da Anthropic.
--
-- 2. `is_active = true` no WHERE é obrigatório.
--    Há versões inativas guardadas (o agente `copy` tem 4). Sem o filtro,
--    o UPDATE reescreve o histórico e não muda o que roda.
--
-- 3. `max_tokens` NÃO acompanha a troca.
--    `text_format` pede 65536 e `component_tagger` 32768. Modelo com teto
--    menor recusa a chamada inteira — confira o limite do destino antes,
--    e baixe o valor NA MESMA statement quando precisar.
--
-- A tabela não tem `updated_at`: não tente carimbar.
-- ============================================================

-- UM CASO QUE NÃO SEGUE A REGRA, E UM QUE PARECIA NÃO SEGUIR
--
-- `campaign_architect` — o modelo é `gpt-5-1`, SEM barra: nome de modelo
--   da OpenAI roteando para o SDK da Anthropic (ver ponto 1). Não há
--   NENHUMA run deste agente na telemetria, então o registro nunca foi
--   exercitado — mas é a assinatura de configuração inválida, e vale
--   corrigir a forma (`openai/gpt-5.1`) antes de ligar o agente.
--
-- `image` — a divergência entre a config e a telemetria é TEMPORAL, não
--   um modelo fixo em código. A linha ativa diz `openai/gpt-5.4-image-2`
--   e as 46 runs desde 03/09 dizem `google/gemini-3.1-flash-image`
--   porque a migration 20261126 faz UPDATE IN-PLACE do `model` (sem
--   bumpar `version` nem `created_at`): as runs registram o valor que a
--   config tinha NA HORA, e a última rodou antes da migration. A config
--   É lida — `ctx.imageConfig?.model` chega na chain
--   (phase2-runner.service.ts) — e o default in-code
--   `IMAGE_MODEL_PRIMARIO` também é o gpt-5.4-image-2, não o gemini (o
--   comentário em image.chain.ts:65 é prosa velha da 20261072).
--
--   O que este agente TEM de especial é o fallback de PROVEDOR
--   (`agents/image/model-policy.ts`): falha do gpt cai no gemini na
--   mesma chamada. A run agora grava quem REALMENTE gerou
--   (`imgMeta.modelUsed`) — antes gravava o modelo pedido, então uma
--   imagem feita pelo fallback aparecia como se o primário tivesse
--   funcionado. Numa peça gerada AGORA, a consulta 8 diz a verdade.
-- ============================================================


-- ─────────────────────────────────────────────
-- 1. O que está rodando agora (rode ANTES)
-- ─────────────────────────────────────────────
SELECT agent_type,
       model,
       CASE WHEN model LIKE '%/%' THEN 'OpenRouter' ELSE 'Anthropic (SDK direto)' END AS provedor,
       temperature,
       max_tokens,
       version
  FROM email_agent_configs
 WHERE is_active = true
 ORDER BY agent_type;


-- ─────────────────────────────────────────────
-- 2. Trocar UM agente  ← o caso comum
-- ─────────────────────────────────────────────
-- Troque os dois valores e rode. O RETURNING confirma o que mudou;
-- 0 linhas = nome do agente errado (confira na consulta 1).
UPDATE email_agent_configs
   SET model = 'anthropic/claude-sonnet-4.6'   -- ← modelo NOVO
 WHERE agent_type = 'qa'                        -- ← agente
   AND is_active = true
RETURNING agent_type, model, temperature, max_tokens;


-- Variante: trocar modelo E teto de tokens juntos (quando o destino
-- não aceita o teto atual).
-- UPDATE email_agent_configs
--    SET model = 'anthropic/claude-sonnet-4.6',
--        max_tokens = 16384
--  WHERE agent_type = 'text_format' AND is_active = true
-- RETURNING agent_type, model, max_tokens;


-- ─────────────────────────────────────────────
-- 3. Trocar VÁRIOS de uma vez
-- ─────────────────────────────────────────────
-- Cada par (agente, modelo) numa linha do VALUES.
UPDATE email_agent_configs AS c
   SET model = novo.model
  FROM (VALUES
          ('qa',           'anthropic/claude-sonnet-4.6'),
          ('image_format', 'moonshotai/kimi-k3'),
          ('color_format', 'moonshotai/kimi-k3')
       ) AS novo(agent_type, model)
 WHERE c.agent_type = novo.agent_type
   AND c.is_active = true
RETURNING c.agent_type, c.model;


-- ─────────────────────────────────────────────
-- 4. Aposentar um modelo (todos que o usam)
-- ─────────────────────────────────────────────
-- Confira o alcance ANTES de rodar o UPDATE:
SELECT agent_type, model FROM email_agent_configs
 WHERE is_active = true AND model = 'moonshotai/kimi-k3'
 ORDER BY agent_type;

-- UPDATE email_agent_configs
--    SET model = 'anthropic/claude-sonnet-4.6'
--  WHERE is_active = true AND model = 'moonshotai/kimi-k3'
-- RETURNING agent_type, model;


-- ═════════════════════════════════════════════════════════════
-- 5. Menu: uma linha por agente, com o modelo VIGENTE ao lado
-- ═════════════════════════════════════════════════════════════
-- Medido em produção em 08/09. Descomente a linha do agente, troque o
-- modelo e rode. A ordem é a do pipeline.
--
-- Fase 1 do Architect (roda por e-mail, antes da copy):
--
-- seletor              hoje anthropic/claude-sonnet-4.6
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'seletor'             AND is_active = true RETURNING agent_type, model;
-- estruturador         hoje anthropic/claude-sonnet-4.6
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'estruturador'        AND is_active = true RETURNING agent_type, model;
-- assembler_chooser    hoje moonshotai/kimi-k3        (Curador — legado E do vault)
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'assembler_chooser'   AND is_active = true RETURNING agent_type, model;
-- assembler            hoje moonshotai/kimi-k3        (Montador — DESLIGADO por montador_mode='off')
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'assembler'           AND is_active = true RETURNING agent_type, model;
-- blueprint            hoje moonshotai/kimi-k3        (só a rota B, o fallback LLM)
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'blueprint'           AND is_active = true RETURNING agent_type, model;
-- subject              hoje anthropic/claude-sonnet-4.6  (assunto da rota determinística)
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'subject'             AND is_active = true RETURNING agent_type, model;
-- catalogador          hoje anthropic/claude-sonnet-4.6  (1× por PESQUISA, não por e-mail)
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'catalogador'         AND is_active = true RETURNING agent_type, model;
--
-- Fase 2 (imagem, cadeia de HTML, QA). `copy_merge` não tem linha: é
-- determinístico, em código, custo zero.
--
-- image                hoje openai/gpt-5.4-image-2    (fallback → gemini, em código)
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'image'               AND is_active = true RETURNING agent_type, model;
-- merge_verifier       hoje moonshotai/kimi-k3
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'merge_verifier'      AND is_active = true RETURNING agent_type, model;
-- copy_fit             hoje openai/gpt-5.4-mini
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'copy_fit'            AND is_active = true RETURNING agent_type, model;
-- hero_section         hoje anthropic/claude-sonnet-4.6  (step 7a)
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'hero_section'        AND is_active = true RETURNING agent_type, model;
-- text_format          hoje moonshotai/kimi-k3        (step 7b — max_tokens 65536, ver ponto 3)
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'text_format'         AND is_active = true RETURNING agent_type, model;
-- image_format         hoje moonshotai/kimi-k3        (step 7c)
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'image_format'        AND is_active = true RETURNING agent_type, model;
-- typography           hoje moonshotai/kimi-k3        (step 3.5)
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'typography'          AND is_active = true RETURNING agent_type, model;
-- color_format         hoje moonshotai/kimi-k3        (step 7d, fail-open)
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'color_format'        AND is_active = true RETURNING agent_type, model;
-- qa                   hoje moonshotai/kimi-k3
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'qa'                  AND is_active = true RETURNING agent_type, model;
--
-- Fora do pipeline de flow:
--
-- component_tagger     hoje moonshotai/kimi-k3        (Taguedor — 1× por variante, max_tokens 32768)
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'component_tagger'    AND is_active = true RETURNING agent_type, model;
-- component_test       hoje moonshotai/kimi-k3        (teste ad-hoc de variante)
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'component_test'      AND is_active = true RETURNING agent_type, model;
-- copy                 hoje claude-opus-4-7           (LEGADO: a copy de produção vem do n8n)
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'copy'                AND is_active = true RETURNING agent_type, model;
-- campaign_image       hoje openai/gpt-5.4-image-2    (campanhas Single Day, daqui pra baixo)
-- campaign_copy_master hoje moonshotai/kimi-k3
-- campaign_suggestion  hoje moonshotai/kimi-k3
-- campaign_trends      hoje moonshotai/kimi-k3
-- campaign_architect   hoje gpt-5-1  ← forma inválida, ver nota do topo
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'campaign_architect'  AND is_active = true RETURNING agent_type, model;

-- ─────────────────────────────────────────────
-- 6. Trocar todo o FLOW DE GERAÇÃO DE E-MAIL
-- ─────────────────────────────────────────────
-- A lista é EXPLÍCITA (whitelist), não um "todos menos". Assim agente
-- novo criado depois não entra numa troca em massa sem alguém decidir.
--
-- OS 16 DO FLOW, na ordem em que rodam:
--   fase 1  seletor · estruturador · assembler_chooser (Curador) ·
--           assembler (Montador) · blueprint · subject
--   fase 2  copy · copy_fit · merge_verifier · hero_section ·
--           text_format · image_format · typography · color_format · qa
--   apoio   catalogador (1× por pesquisa, alimenta o Seletor)
--
-- FORA, e cada um por um motivo diferente:
--   `image`  — é o único do flow que chama modelo de GERAÇÃO DE IMAGEM.
--              Apontá-lo para um LLM de texto não degrada: para de gerar
--              imagem. Trocar esse exige escolher outro modelo de imagem,
--              e vale a nota do topo sobre o fallback de provedor.
--   `campaign_*` (5) — módulo de campanhas, outro produto.
--   `component_tagger`, `component_test` — biblioteca de componentes,
--              rodam no cadastro da variante, não na geração.

-- 6a. PRÉVIA — o de/para, sem gravar. Rode e leia antes do UPDATE.
WITH destino AS (SELECT 'anthropic/claude-sonnet-4.6'::text AS model)   -- ← EDITE AQUI
SELECT c.agent_type,
       c.model AS de,
       d.model AS para,
       c.max_tokens,
       CASE WHEN c.max_tokens > 16384 THEN 'CONFIRA o teto do destino' END AS atencao
  FROM email_agent_configs c CROSS JOIN destino d
 WHERE c.is_active = true
   AND c.agent_type IN ('seletor','estruturador','assembler_chooser','assembler',
                        'blueprint','subject','copy','copy_fit','merge_verifier',
                        'hero_section','text_format','image_format','typography',
                        'color_format','qa','catalogador')
 ORDER BY c.max_tokens DESC;

-- 6b. O UPDATE. Mesma lista da prévia — o que apareceu ali é o que muda.
-- WITH destino AS (SELECT 'anthropic/claude-sonnet-4.6'::text AS model)  -- ← EDITE AQUI
-- UPDATE email_agent_configs c
--    SET model = d.model
--   FROM destino d
--  WHERE c.is_active = true
--    AND c.agent_type IN ('seletor','estruturador','assembler_chooser','assembler',
--                         'blueprint','subject','copy','copy_fit','merge_verifier',
--                         'hero_section','text_format','image_format','typography',
--                         'color_format','qa','catalogador')
-- RETURNING c.agent_type, c.model, c.max_tokens;

-- 6c. Se o destino tiver teto de saída MENOR que o pedido atual, baixe
-- junto: modelo que não aceita o teto recusa a chamada inteira, e a
-- geração morre no step. Passam de 16k hoje: text_format (65536),
-- copy (20480). Troque 16384 pelo teto real do modelo escolhido.
-- WITH destino AS (SELECT 'anthropic/claude-sonnet-4.6'::text AS model, 16384 AS teto)
-- UPDATE email_agent_configs c
--    SET model = d.model,
--        max_tokens = LEAST(c.max_tokens, d.teto)
--   FROM destino d
--  WHERE c.is_active = true
--    AND c.agent_type IN ('seletor','estruturador','assembler_chooser','assembler',
--                         'blueprint','subject','copy','copy_fit','merge_verifier',
--                         'hero_section','text_format','image_format','typography',
--                         'color_format','qa','catalogador')
-- RETURNING c.agent_type, c.model, c.max_tokens;



-- ═════════════════════════════════════════════════════════════
-- 7. Atalhos por SUB-grupo
-- ═════════════════════════════════════════════════════════════

-- Toda a cadeia de formatação de uma vez (7a–7d + tipografia). CONFIRA o
-- teto de tokens do destino: text_format pede 65536.
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO'
--  WHERE is_active = true
--    AND agent_type IN ('hero_section','text_format','image_format','typography','color_format')
-- RETURNING agent_type, model, max_tokens;

-- Toda a fase 1 (sem tocar em imagem nem formatação).
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO'
--  WHERE is_active = true
--    AND agent_type IN ('seletor','estruturador','assembler_chooser','assembler','blueprint','subject')
-- RETURNING agent_type, model;

-- Para o flow INTEIRO de uma vez, use a seção 6 (whitelist + prévia).
-- E nunca inclua `image`/`campaign_image` num atalho junto de agentes de
-- texto: modelo sem saída de imagem faz o bloco sair sem foto, e o
-- agente de hero remove a linha do slot vazio.
-- ─────────────────────────────────────────────
-- 8. Depois de trocar: a run diz a verdade
-- ─────────────────────────────────────────────
-- `email_generation_runs.model` guarda o que foi REALMENTE usado.
-- Se aqui aparecer o modelo antigo, a config não foi lida (agente
-- errado, linha inativa, ou o chain tem modelo fixo em código).
--
-- DOIS AGENTES IGNORAVAM ESTA TABELA — corrigido em 08/09, e vale saber
-- por que eles apareciam em Sonnet depois de uma troca em massa:
--
--   `assembler_chooser` — o Curador do VAULT lia uma constante
--     (`CURADOR_SHADOW_MODEL`) e o Curador LEGADO lia a config. Mesmo
--     agent_type, dois modelos, e a telemetria mostrava os dois. Agora a
--     precedência é env `CURADOR_SHADOW_MODEL` > esta tabela > constante.
--     Só o MODELO vem daqui: o prompt do vault é outro contrato.
--
--   `hero_section` — quando o exemplo da variante é mockup-IMAGEM, a hero
--     anexa o screenshot ao prompt, e isso exige visão. Ela trocava para
--     `HERO_VISION_MODEL` SEMPRE nesse caso, mesmo com o configurado
--     enxergando. Agora só troca quando precisa: modelo cego (kimi, glm) ou
--     sem "/" (o SDK da Anthropic lança ao receber anexo).
--
-- UM MODELO NOVO PODE EXIGIR TETO MAIOR. Raciocínio obrigatório (Fable,
-- Mythos) consome `max_tokens` ANTES de escrever a resposta: com teto
-- apertado o conteúdo volta vazio e o parse estoura com "Unexpected end of
-- JSON input", sem erro do provedor. Foi o que derrubou o `subject` em
-- 08/09, com os 400 tokens que sobravam para o Sonnet. Confira na consulta
-- 1 quem está abaixo de ~4000 antes de trocar.
SELECT agent, model, status, created_at
  FROM email_generation_runs
 WHERE created_at > now() - interval '2 hours'
 ORDER BY created_at DESC
 LIMIT 20;


-- ═════════════════════════════════════════════════════════════
-- 9. Tetos: raciocínio obrigatório paga do MESMO max_tokens
-- ═════════════════════════════════════════════════════════════
-- Modelo que pensa por padrão consome teto ANTES de escrever. Teto
-- dimensionado para um modelo que não pensa devolve conteúdo VAZIO, e o
-- caller estoura em `JSON.parse("")` — nenhum erro vem do provedor.
--
-- Medido em 30 dias (08/09), saída máxima do MESMO agente por família:
--
--   agente         Sonnet    Fable    fator
--   copy_fit        1.427    3.686     2,6x
--   estruturador    7.498    7.700     2,1x   (por tentativa; a run somou 2)
--   seletor         2.385    3.625     1,5x
--
-- Regra prática: teto >= 3x a saída ÚTIL observada. Os tetos abaixo foram
-- ajustados em 08/09 por essa régua.
--
--   agente          de       para    o que motivou
--   subject           400    4.000   QUEBROU: saída útil 213, sem folga
--   seletor         4.096    8.192   Fable já usava 89% do teto
--   estruturador    8.192   16.384   ~94% por tentativa, com retry
--   catalogador     8.192   12.288   64% já no Sonnet
--   merge_verifier  2.048    6.000   85% já no Sonnet
--   copy_fit        6.000    8.000   61% no Fable
--   qa              1.500    4.000   sem histórico, 2º menor teto
--   assembler       2.048    4.000   desligado hoje, apertado se ligar
--
-- ROLLBACK dos tetos (estado anterior ao ajuste de 08/09):
-- UPDATE email_agent_configs AS c SET max_tokens = v.teto
--   FROM (VALUES ('subject',400),('seletor',4096),('estruturador',8192),
--                ('catalogador',8192),('merge_verifier',2048),
--                ('copy_fit',6000),('qa',1500),('assembler',2048))
--        AS v(agent_type, teto)
--  WHERE c.agent_type = v.agent_type AND c.is_active = true
-- RETURNING c.agent_type, c.max_tokens;
--
-- SUBIR TETO CUSTA RESERVA, não gasto. O OpenRouter reserva
-- (prompt + max_tokens) no preço do modelo enquanto a chamada está em voo,
-- e é isso que produz `402 ... would exceed your available credits given
-- your current in-flight requests` sem a conta ter acabado.
--
-- Com Fable ($50/1M de saída), `text_format` é o extremo: teto 65.536
-- reserva ~US$ 3,28 por chamada e a saída máxima medida é 872 tokens.
-- NÃO foi mexido — ele existe para reescrever o documento inteiro, e o
-- histórico atual é do modo em que quase sempre é pulado. Se os 402
-- voltarem com crédito na conta, é o primeiro lugar para olhar.

-- Quem está apertado agora (rode depois de trocar de modelo):
SELECT c.agent_type, c.model, c.max_tokens,
       max(r.tokens_output) AS saida_max_30d,
       round(100.0 * max(r.tokens_output) / c.max_tokens) AS pct_do_teto
  FROM email_agent_configs c
  LEFT JOIN email_generation_runs r
    ON r.agent = c.agent_type AND r.status = 'success'
   AND r.created_at > now() - interval '30 days'
 WHERE c.is_active = true
 GROUP BY c.agent_type, c.model, c.max_tokens
HAVING max(r.tokens_output) > 0.6 * c.max_tokens
 ORDER BY pct_do_teto DESC;


-- ─────────────────────────────────────────────
-- Rollback
-- ─────────────────────────────────────────────
-- Não há histórico de troca de modelo: a coluna é sobrescrita e a
-- consulta 1 é o único registro do estado anterior. GUARDE a saída dela
-- antes de mexer — é o seu rollback.
