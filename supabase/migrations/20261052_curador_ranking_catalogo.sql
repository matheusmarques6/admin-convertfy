-- ============================================================
-- Story CM-3 — o Curador rankeia até 3 por posição sobre o catálogo INTEIRO.
--
-- O que muda:
--   1. O pré-filtro determinístico (score objectives×3 / tones×2 / density×1,
--      top-8 por posição) SAIU do código. Ele decidia quem o LLM podia ver a
--      partir de três campos categóricos, antes de qualquer leitura de marca.
--   2. O catálogo da biblioteca passa a ir no SYSTEM prompt, na var
--      {{catalogo}}, em ordem estável — prefixo idêntico entre lojas, logo
--      cacheável (cache_control no OpenRouter para modelos Anthropic).
--   3. O output deixa de ser uma escolha por posição e passa a ser um
--      RANKING de até 3, em ordem de preferência, com `motivo` só na 1ª.
--   4. O `output_schema` (campos_copy) SAI do Curador: virou insumo
--      exclusivo do Montador (CM-4), que decide viabilidade de dados.
--
-- Corte seco: zera os prompts da config ativa para os defaults novos in-code
-- assumirem, e sobe max_tokens (12 posições × 3 UUIDs + 12 motivos ≈ 2,5k de
-- output; 2048 estouraria). Editar na aba Agentes volta a sobrescrever — mas
-- o system PRECISA conter {{catalogo}}: sem ele o serviço falha explicitamente
-- em vez de deixar o Curador escolher no vazio.
--
-- Rollback: reativar a versão anterior da row (histórico preservado por
-- versão) e reverter o código.
-- ============================================================

UPDATE email_agent_configs
SET system_prompt = '',
    user_template = '',
    max_tokens = 8192
WHERE agent_type = 'assembler_chooser'
  AND is_active = true;

-- Verificação
SELECT agent_type, model, temperature, max_tokens,
       length(system_prompt) AS system_chars,
       length(user_template) AS user_chars
FROM email_agent_configs
WHERE agent_type = 'assembler_chooser' AND is_active = true;
