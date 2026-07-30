-- ============================================================
-- Direção fotográfica no prompt do agente de imagem (migration 20261060).
--
-- A coluna `email_component_variants.photo_direction` já existe e o código
-- já resolve a variante de cada bloco e expõe a var `PHOTO_DIRECTION`. Falta
-- o prompt do BANCO consumir — o `user_template` do agente `image` tem 6k+
-- chars, então o default in-code nunca é usado e a var passaria em branco.
--
-- O bloco entra no TOPO: é o briefing do fotógrafo, e o resto do prompt
-- (nicho, posicionamento, paleta, produtos) passa a ser contexto de apoio.
-- Envolvido em `{{#if}}` porque variante sem direção escrita não pode abrir
-- uma seção vazia — seção vazia num prompt é convite para o modelo
-- preencher sozinho.
--
-- Idempotente: a marca CFY_PHOTO_DIRECTION impede aplicar duas vezes.
-- Rollback: remover o bloco delimitado pela marca.
-- ============================================================

UPDATE email_agent_configs
SET user_template =
  '{{#if PHOTO_DIRECTION}}
CFY_PHOTO_DIRECTION — PHOTOGRAPHIC DIRECTION, YOUR PRIMARY BRIEF.
Written for this exact component by the person who designed it. It governs HOW the photograph is made: light, framing, distance, lens feel, presence and pose of a model, setting, depth, colour treatment, and which area stays clean for copy. Shoot to satisfy it.
Everything else in this prompt — niche, positioning, palette, products, block role — is SUPPORTING CONTEXT: it fills in what the direction leaves open, and never a reason to contradict it.

{{PHOTO_DIRECTION}}

{{/if}}' || user_template
WHERE agent_type = 'image'
  AND is_active = true
  AND user_template NOT LIKE '%CFY_PHOTO_DIRECTION%';

-- Verificação: a marca e a var precisam estar presentes UMA vez cada.
SELECT agent_type,
       model,
       length(user_template) AS user_chars,
       user_template LIKE '%CFY_PHOTO_DIRECTION%' AS tem_bloco,
       user_template LIKE '%{{PHOTO_DIRECTION}}%' AS tem_var,
       system_prompt LIKE '%CFY_NO_TEXT_RULE%'    AS tem_regra_sem_texto
FROM email_agent_configs
WHERE agent_type = 'image' AND is_active = true;
