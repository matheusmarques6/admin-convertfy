-- ============================================================
-- Montador (Component Assembler) — NUNCA remover slots de imagem
--
-- Bug provado (Luxe Lift welcome#3, 19/jul): o Curador escolheu variantes
-- COM slots de imagem tagueados (hero section 4 → {{HERO_IMAGE}},
-- produtos 3 → {{PRODUCTS_IMAGE}}, body 1 → {{BODY_IMAGE}}), mas o Montador
-- (openai/gpt-5.4) REMOVEU as tags ao harmonizar — o reference final saiu
-- com ZERO tags de imagem. Consequência em cascata: esqueleto marca
-- needs_image=false em todos os blocos → fase de imagem não gera nada →
-- email renderiza em branco (hero com background vazio + padding).
--
-- Duas defesas: esta regra no prompt + guard determinístico em código
-- (findDroppedImageTags → warning + image_tags_dropped na telemetria).
--
-- Append idempotente ao prompt ativo (agent_type='assembler').
-- ============================================================

UPDATE email_agent_configs
SET system_prompt = system_prompt || $RULE$

REGRA DOS SLOTS DE IMAGEM: TODA tag de imagem presente nas variantes escolhidas ({{HERO_IMAGE}}, {{PRODUCT_N_IMAGE}}, {{BODY_IMAGE}}, {{PRODUCTS_IMAGE}}, {{*_THUMB_*}} etc.) DEVE aparecer no documento final, no bloco correspondente, com o MESMO atributo (src ou background-image) da variante original. NUNCA remova, simplifique ou converta uma seção com imagem em versão só-texto ao harmonizar — o pipeline downstream gera as imagens a partir dessas tags; sem elas o email sai em branco. Bloco mínimo criado do zero para seção hero ou products DEVE incluir o slot de imagem tagueado ({{HERO_IMAGE}} / {{PRODUCT_1_IMAGE}}).$RULE$
WHERE agent_type = 'assembler'
  AND is_active = true
  AND system_prompt NOT LIKE '%REGRA DOS SLOTS DE IMAGEM%';
