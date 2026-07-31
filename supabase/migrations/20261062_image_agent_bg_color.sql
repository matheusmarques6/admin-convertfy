-- ============================================================
-- Cor de fundo do email no prompt do agente de imagem.
--
-- O agente recebia a paleta da marca (`primary_colors`/`secondary_colors`),
-- mas nunca a cor da SEÇÃO onde a imagem entra. Quando a direção pede fundo
-- contínuo, ele escolhia um neutro qualquer — e o email da Luxe Lift saiu
-- com o bloco em bege (#FAF5F3) e a foto em cinza-azulado, uma emenda
-- visível no meio da peça.
--
-- O design system dessa hero é explícito: "o fundo do bloco e o fundo da
-- fotografia devem ter o mesmo valor tonal, com tolerância de ±5%. A
-- transição entre seção e foto tem que ser praticamente invisível — esse é
-- o truque central do layout."
--
-- `{{BG_COLOR}}` é o MESMO `bg` que a cadeia de formatação aplica no
-- documento (deriveColorRoles), então o hex do prompt e o hex do email são
-- o mesmo valor por construção.
--
-- Idempotente: a marca CFY_BG_COLOR impede aplicar duas vezes.
-- Rollback: remover o bloco delimitado pela marca.
-- ============================================================

UPDATE email_agent_configs
SET user_template =
  '{{#if BG_COLOR}}
CFY_BG_COLOR — EMAIL BACKGROUND COLOUR: {{BG_COLOR}}
This is the exact colour of the section this image sits in. When the direction calls for a continuous, seamless or studio-neutral backdrop — or whenever the photo is meant to blend into the layout — the background of the photograph MUST be this hex, not an approximation. A backdrop half a tone off reads as a seam across the email.
When the direction calls for a real setting (a room, a street, outdoors), ignore this and shoot the setting.

{{/if}}' || user_template
WHERE agent_type = 'image'
  AND is_active = true
  AND user_template NOT LIKE '%CFY_BG_COLOR%';

-- Verificação: as três marcas do prompt de imagem.
SELECT agent_type,
       model,
       length(user_template)                       AS user_chars,
       user_template LIKE '%CFY_BG_COLOR%'         AS tem_bg_color,
       user_template LIKE '%CFY_PHOTO_DIRECTION%'  AS tem_direcao_foto,
       system_prompt LIKE '%CFY_NO_TEXT_RULE%'     AS tem_regra_sem_texto
FROM email_agent_configs
WHERE agent_type = 'image' AND is_active = true;
