-- Merge por EXAMPLE antes da hero (F2 do endereçamento sem placeholder).
--
-- O agente hero_section mudou de contrato: a região agora chega com a copy
-- FINAL aplicada pelo merge determinístico (anchor-match) e o agente é
-- PROIBIDO de reescrever texto — remoção de linha só via <hero_pending>.
-- Um prompt customizado gravado antes desta mudança instruía o agente a
-- preencher placeholders com o hero_content (e podia reescrever a copy que
-- o merge acabou de aplicar — o guard heroCopyPreserved derrubaria o step
-- duas vezes e o email falharia com hero_failed).
--
-- Corte seco pros defaults in-code (mesmo padrão das migrations
-- 20261044-46 para image_format/color_format/qa): zera o prompt ativo e o
-- chain usa DEFAULT_HERO_SYSTEM_PROMPT/DEFAULT_HERO_USER_TEMPLATE.

update email_agent_configs
set system_prompt = '',
    user_template = '',
    updated_at = now()
where agent_type = 'hero_section'
  and is_active = true;
