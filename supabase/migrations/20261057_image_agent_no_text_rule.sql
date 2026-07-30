-- ============================================================
-- Agente de imagem: regra ABSOLUTA de "nenhum texto na imagem".
--
-- Contexto: o primeiro email gerado ponta a ponta (Luxe Lift, carrinho
-- abandonado) saiu com a headline, o nome da marca e um botão "SHOK NOW"
-- QUEIMADOS dentro do PNG da hero. O erro de digitação no botão é a
-- assinatura de texto desenhado por modelo de imagem.
--
-- A regra já existia no prompt — e o modelo desobedeceu mesmo assim. Não é
-- surpresa: o prompt entrega ao modelo a ideia do email, o brief do slot e a
-- COPY do bloco, tudo em forma de frase. Uma linha no meio de uma lista de
-- requisitos ("No text in the image") não compete com meia dúzia de frases
-- prontas para serem desenhadas.
--
-- Esta migration reforça o prompt do BANCO (o default in-code só vale com o
-- campo vazio, e aqui ele tem 10k+ chars): a proibição entra no TOPO, onde é
-- lida primeiro, e é repetida no FIM, que é a posição que mais pesa em
-- modelo de imagem. O prompt existente é PRESERVADO no meio.
--
-- Idempotente: a marca CFY_NO_TEXT_RULE impede aplicar duas vezes.
-- Rollback: remover os dois blocos delimitados pela marca.
-- ============================================================

UPDATE email_agent_configs
SET system_prompt =
  'CFY_NO_TEXT_RULE — ABSOLUTE, OVERRIDES EVERYTHING BELOW.
Render NO text, NO lettering, NO numbers, NO logo, NO wordmark, NO button, NO badge, NO price tag, NO watermark, NO UI element anywhere in the image. Not a headline, not a product name, not a brand name, not a call to action, not a single legible character.
Every word you receive — the email idea, the slot brief, the block copy, the product names — is DIRECTION for the composition. None of it is content to draw.
All copy, the logo and the buttons are placed in HTML ON TOP of your image. Text baked into the image renders twice, cannot be edited, cannot be translated and cannot be A/B tested.
Where the composition seems to call for a headline or a button, leave that area CLEAN and let the layout breathe there.

' || system_prompt || '

CFY_NO_TEXT_RULE — FINAL CHECK
Before returning: the image must contain zero legible characters. If you drew any text, logo or button, redo the composition without it.'
WHERE agent_type = 'image'
  AND is_active = true
  AND system_prompt NOT LIKE '%CFY_NO_TEXT_RULE%';

-- Verificação: a marca precisa aparecer DUAS vezes (topo e fim).
SELECT agent_type,
       model,
       length(system_prompt) AS system_chars,
       (length(system_prompt)
        - length(replace(system_prompt, 'CFY_NO_TEXT_RULE', ''))
       ) / length('CFY_NO_TEXT_RULE') AS ocorrencias_da_regra
FROM email_agent_configs
WHERE agent_type = 'image' AND is_active = true;
