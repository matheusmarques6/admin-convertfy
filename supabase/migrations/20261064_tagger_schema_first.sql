-- ============================================================
-- Taguedor schema-first — corte seco para o default in-code.
--
-- O prompt do Taguedor ganhou a regra que faltava: quando o slot de um campo
-- já carrega uma {{TAG}} com nome divergente do schema, ela é RENOMEADA para
-- {{MAIÚSCULA_DA_KEY}}. Antes a regra dizia o oposto ("mantenha a tag
-- existente, não renomeie"), e era exatamente essa linha que produzia a
-- biblioteca desalinhada: variante com `hero_headline` no schema e
-- {{HERO_EYEBROW}} no HTML, aprovada sem uma reclamação sequer.
--
-- O prompt vive em email_agent_configs; enquanto houver texto lá, o default
-- in-code NUNCA é usado — mexer só no código não teria efeito nenhum. Esta
-- migration zera system_prompt e user_template do agente, do mesmo jeito que
-- as 20261044-46 fizeram com image_format/color_format/qa.
--
-- Idempotente (zerar duas vezes dá no mesmo).
-- Rollback: repor o texto anterior na linha ativa.
-- ============================================================

UPDATE email_agent_configs
SET system_prompt = '',
    user_template = ''
WHERE agent_type = 'component_tagger'
  AND is_active = true
  AND (length(system_prompt) > 0 OR length(user_template) > 0);

-- Verificação: 0/0 = rodando com o default in-code (o desejado).
SELECT agent_type,
       model,
       length(system_prompt) AS system_chars,
       length(user_template) AS user_chars
FROM email_agent_configs
WHERE agent_type = 'component_tagger' AND is_active = true;
