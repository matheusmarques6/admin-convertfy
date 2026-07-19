-- ============================================================
-- Blueprint Agent — purpose LIMITADO às tags do bloco
--
-- Problema (Luxe Lift welcome#3): o purpose pedia copy sem slot no
-- template — ex.: bloco "storytelling da fundadora" com purpose pedindo
-- NARRATIVA, mas as tags do bloco eram só BODY_IMAGE + BODY_CTA_* (não há
-- {{BODY_TEXT}} para a história ser escrita); hero com purpose pedindo
-- headline num template que só tem imagem+CTA. O n8n gera texto que não
-- tem onde renderizar (é descartado) e o purpose distorce a prioridade.
--
-- Regra: com <estrutura_extraida> presente, o purpose de cada bloco deve
-- dirigir SOMENTE os campos que existem nas tags daquele bloco.
--
-- Append idempotente ao prompt ativo (agent_type='blueprint').
-- ============================================================

UPDATE email_agent_configs
SET system_prompt = system_prompt || $RULE$

PURPOSE LIMITADO ÀS TAGS: em <estrutura_extraida>, cada bloco lista as tags {{TAG}} do template. O purpose de cada bloco deve dirigir SOMENTE a copy dos campos presentes nas tags DAQUELE bloco — nada além. Ex.: bloco com apenas *_CTA_LABEL + *_IMAGE → purpose foca no texto do botão e na direção visual; NUNCA peça narrativa, headline ou body que o template não tem onde renderizar. Tags de sistema (*_IMAGE, *_URL, *_ICON, nomes/preços de produto) não recebem copy — podem ser citadas como direção visual, não como campo a escrever. Se a intenção editorial do email (outline/objective) pedir um conteúdo sem slot no bloco, NÃO transfira esse conteúdo para outro campo — registre a intenção no messaging geral e mantenha o purpose fiel às tags.$RULE$
WHERE agent_type = 'blueprint'
  AND is_active = true
  AND system_prompt NOT LIKE '%PURPOSE LIMITADO ÀS TAGS%';
