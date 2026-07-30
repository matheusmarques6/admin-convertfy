-- ============================================================
-- Story CM-5 — a hero passa a declarar o que descartou, e o modo `full_doc`
-- sai de cena.
--
-- O que muda no agente:
--   1. O contrato de output vira único: fragmento entre <CFY_HERO_OUTPUT>,
--      mais um relatório JSON entre <CFY_HERO_REPORT> com o que foi
--      descartado (imagem ausente, campos sem copy, linhas removidas, logo
--      escolhida). Hoje, quando ele apaga uma linha de CTA por falta de copy
--      — comportamento CORRETO e previsto no <empty_slot_rule> — ninguém
--      fica sabendo.
--   2. O modo `full_doc`, em que o agente devolvia o DOCUMENTO INTEIRO
--      quando a região não era localizável, foi REMOVIDO. Ele existia porque
--      o Montador LLM emitia marcadores malformados; com a montagem por
--      código (CM-2) os marcadores são sempre válidos. Manter um caminho que
--      autoriza a reescrita do email todo, para um fallback sem causa, era a
--      maior superfície de risco da cadeia.
--   3. O modo `montador` do prompt passa a ser declarado como fallback de
--      reference LEGADA (gravada antes do CM-2), não como caminho comum.
--
-- O relatório é OPCIONAL no parser: ausência ou JSON quebrado registram
-- `hero_report_missing` e o fragmento vale do mesmo jeito. Observabilidade
-- não derruba entrega.
--
-- Corte seco: zera os prompts para os defaults novos in-code assumirem.
-- Rollback: reativar a versão anterior da row e reverter o código.
-- ============================================================

UPDATE email_agent_configs
SET system_prompt = '',
    user_template = ''
WHERE agent_type = 'hero_section'
  AND is_active = true;

-- Verificação
SELECT agent_type, model, temperature, max_tokens,
       length(system_prompt) AS system_chars,
       length(user_template) AS user_chars
FROM email_agent_configs
WHERE agent_type = 'hero_section' AND is_active = true;
