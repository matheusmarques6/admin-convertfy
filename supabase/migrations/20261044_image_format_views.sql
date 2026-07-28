-- ============================================================
-- Arquitetura por views (F3): image_format deixa de receber o documento.
--
-- As vars do agente mudaram ({{html}} saiu; entraram {{image_slots_json}}
-- e {{logo_candidates_json}}). Prompt customizado salvo no DB referencia
-- as vars antigas e quebraria em silêncio — corte seco: zera o prompt da
-- config ativa para que o chain use os DEFAULTS in-code novos. Editar na
-- aba Agentes volta a sobrescrever normalmente.
-- ============================================================

UPDATE email_agent_configs
SET system_prompt = '',
    user_template = ''
WHERE agent_type = 'image_format'
  AND is_active = true;
