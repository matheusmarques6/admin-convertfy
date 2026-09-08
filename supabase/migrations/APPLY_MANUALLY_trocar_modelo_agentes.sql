-- ═══════════════════════════════════════════════════════════════════════
-- Trocar o MODELO de cada agente de e-mail
-- ═══════════════════════════════════════════════════════════════════════
--
-- NÃO é migration: é um menu operacional. Nada aqui roda sozinho —
-- descomente a linha do agente que você quer trocar e ponha o modelo novo.
--
-- Regras que valem para TODAS as linhas abaixo:
--
--  1. Sempre `AND is_active = true`. A tabela guarda versões históricas
--     (há 8 linhas inativas hoje, entre elas o `html` e o `refiner`
--     desligados no split da cadeia 7a–7d). Sem o filtro você reescreve
--     o histórico e não muda o que roda.
--
--  2. A CONFIG DO BANCO VENCE a constante do código. Trocar aqui tem
--     efeito na próxima geração, sem deploy — e é também por isso que
--     mudar o código sem mudar o banco não muda nada.
--
--  3. Id COM barra ("vendor/modelo") roteia pelo OpenRouter; id SEM barra
--     vai pelo SDK da Anthropic direto (`isOpenRouterModel`,
--     openrouter-invoke.ts). Então `gpt-5-1` (sem barra) tenta falar com
--     a Anthropic e falha: para um modelo não-Anthropic use sempre a
--     forma `openai/...`, `moonshotai/...`, `anthropic/...`.
--
--  4. `temperature` é IGNORADA em Opus 4.7/4.8 e em qualquer `gpt-5*`
--     (`modelSupportsTemperature`). Trocar para um desses não exige
--     mexer na temperatura — ela simplesmente não é enviada.
--
--  5. Agente de IMAGEM (`image`, `campaign_image`) tem política própria
--     em `agents/image/model-policy.ts`: o primário vem do banco e o
--     fallback de provedor é o Gemini. Trocar o primário aqui é o
--     caminho suportado; o fallback é código.
--
-- ── Conferir ANTES e DEPOIS ────────────────────────────────────────────

SELECT agent_type, model, temperature, max_tokens, version
FROM email_agent_configs
WHERE is_active = true
ORDER BY agent_type;

-- ── Fase 1 do Architect ────────────────────────────────────────────────

-- seletor            | hoje: anthropic/claude-sonnet-4.6
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'seletor'            AND is_active = true;

-- estruturador       | hoje: anthropic/claude-sonnet-4.6
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'estruturador'       AND is_active = true;

-- assembler_chooser  | hoje: moonshotai/kimi-k3   (Curador — legado + do vault)
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'assembler_chooser'  AND is_active = true;

-- assembler          | hoje: moonshotai/kimi-k3   (Montador — DESLIGADO por montador_mode='off')
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'assembler'          AND is_active = true;

-- blueprint          | hoje: moonshotai/kimi-k3   (só a rota B, o fallback LLM)
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'blueprint'          AND is_active = true;

-- subject            | hoje: anthropic/claude-sonnet-4.6   (assunto da rota determinística)
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'subject'            AND is_active = true;

-- catalogador        | hoje: anthropic/claude-sonnet-4.6   (1× por pesquisa, não por e-mail)
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'catalogador'        AND is_active = true;

-- ── Fase 2: imagem, cadeia de HTML e QA ────────────────────────────────

-- image              | hoje: openai/gpt-5.4-image-2   (fallback → Gemini, em código)
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'image'              AND is_active = true;

-- copy_merge NÃO tem linha: é determinístico, custo zero, roda em código.

-- merge_verifier     | hoje: moonshotai/kimi-k3
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'merge_verifier'     AND is_active = true;

-- copy_fit           | hoje: openai/gpt-5.4-mini
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'copy_fit'           AND is_active = true;

-- hero_section       | hoje: anthropic/claude-sonnet-4.6   (step 7a)
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'hero_section'       AND is_active = true;

-- text_format        | hoje: moonshotai/kimi-k3            (step 7b)
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'text_format'        AND is_active = true;

-- image_format       | hoje: moonshotai/kimi-k3            (step 7c)
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'image_format'       AND is_active = true;

-- typography         | hoje: moonshotai/kimi-k3            (step 3.5)
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'typography'         AND is_active = true;

-- color_format       | hoje: moonshotai/kimi-k3            (step 7d, fail-open)
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'color_format'       AND is_active = true;

-- qa                 | hoje: moonshotai/kimi-k3
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'qa'                 AND is_active = true;

-- ── Fora do pipeline de flow ───────────────────────────────────────────

-- component_tagger   | hoje: moonshotai/kimi-k3   (Taguedor — 1× por variante)
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'component_tagger'   AND is_active = true;

-- component_test     | hoje: moonshotai/kimi-k3   (teste ad-hoc de variante)
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'component_test'     AND is_active = true;

-- copy               | hoje: claude-opus-4-7   (LEGADO: a copy de produção vem do n8n)
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'copy'               AND is_active = true;

-- Campanhas (Single Day), não são do pipeline de flow:
-- campaign_image     | hoje: openai/gpt-5.4-image-2
-- campaign_copy_master| hoje: moonshotai/kimi-k3
-- campaign_suggestion| hoje: moonshotai/kimi-k3
-- campaign_trends    | hoje: moonshotai/kimi-k3
-- campaign_architect | hoje: gpt-5-1   ← SEM barra: roteia pra Anthropic e falha. Corrija pra 'openai/gpt-5.1'.
-- UPDATE email_agent_configs SET model = 'MODELO_NOVO' WHERE agent_type = 'campaign_architect' AND is_active = true;

-- ── Atalhos ────────────────────────────────────────────────────────────

-- Trocar TODA a cadeia de formatação de uma vez (7a–7d + tipografia):
-- UPDATE email_agent_configs
-- SET model = 'MODELO_NOVO'
-- WHERE is_active = true
--   AND agent_type IN ('hero_section','text_format','image_format','typography','color_format');

-- Trocar todo mundo que hoje está no Kimi K3:
-- UPDATE email_agent_configs
-- SET model = 'MODELO_NOVO'
-- WHERE is_active = true AND model = 'moonshotai/kimi-k3';

-- Trocar TODOS os agentes do pipeline de flow (cuidado: inclui imagem,
-- que precisa de modelo com saída de imagem — nunca ponha um modelo de
-- texto aqui):
-- UPDATE email_agent_configs
-- SET model = 'MODELO_NOVO'
-- WHERE is_active = true
--   AND agent_type IN ('seletor','estruturador','assembler_chooser','assembler',
--                      'blueprint','subject','merge_verifier','copy_fit',
--                      'hero_section','text_format','image_format','typography',
--                      'color_format','qa');

-- ── Rollback ───────────────────────────────────────────────────────────
--
-- Não existe histórico de model nesta tabela (`version` não é bumpado
-- pelo UPDATE in-place). Guarde o SELECT do começo antes de rodar; o
-- rollback é voltar o valor à mão. Se quiser o de/para depois do fato,
-- `email_generation_runs.model` guarda o modelo que REALMENTE rodou em
-- cada run:
--
-- SELECT agent, model, count(*), max(created_at)
-- FROM email_generation_runs
-- WHERE created_at > now() - interval '30 days'
-- GROUP BY agent, model ORDER BY agent, max(created_at) DESC;
