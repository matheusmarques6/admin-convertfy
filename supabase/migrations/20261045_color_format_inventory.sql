-- ============================================================
-- Arquitetura por views (F4): color_format deixa de receber o documento.
--
-- As vars do agente mudaram ({{html}} saiu; entrou {{color_inventory_json}})
-- e o vocabulário de ops mudou (replace de trecho → recolor por valor de
-- cor). Prompt customizado salvo no DB referencia o contrato antigo e
-- quebraria em silêncio — corte seco: zera o prompt da config ativa para
-- que o chain use os DEFAULTS in-code novos.
-- ============================================================

UPDATE email_agent_configs
SET system_prompt = '',
    user_template = ''
WHERE agent_type = 'color_format'
  AND is_active = true;
