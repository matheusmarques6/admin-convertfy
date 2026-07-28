-- ============================================================
-- Arquitetura por views (F5): QA deixa de receber o documento.
--
-- O LLM do QA passa a receber views por bloco ({{block_views_json}}) no
-- lugar de {{html}}; os checks de visão global do documento viraram
-- código (runGlobalDocChecks). O qa.chain agora tem prompts DEFAULT
-- in-code (padrão dos chains da cadeia) — corte seco: zera o prompt da
-- config ativa para que os defaults novos assumam. Editar na aba Agentes
-- volta a sobrescrever normalmente.
-- ============================================================

UPDATE email_agent_configs
SET system_prompt = '',
    user_template = ''
WHERE agent_type = 'qa'
  AND is_active = true;
