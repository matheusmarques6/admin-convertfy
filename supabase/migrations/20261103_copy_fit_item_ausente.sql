-- 20261103 — o encurtador cria o item de lista que o gerador pulou
--
-- Body 4 "Why Innovabay" (Welcome 1, batch f576a00f, 02/09): o n8n devolveu
-- 5 dos 6 itens da coluna "Others" (`column_b_item_6` ausente — run `copy`
-- com kind=missing). O contrato diz required:false e o flow ignora as
-- nossas diretivas; o merge limpou o lorem e o badge "6" foi ao cliente sem
-- texto.
--
-- Agora `alvosDeEncurtamento` marca o item VAZIO de uma lista com >= 2
-- irmãos preenchidos com o motivo `ausente`, o contrato leva
-- `criar_item_da_lista` + `itens_irmaos`, e esta regra diz ao modelo o que
-- fazer. O guard continua do código: idioma, max_caracteres e
-- `igual_a_irmao`. Não criado → o merge remove badge + linha.
--
-- Idempotente: só insere a regra onde ela ainda não existe.

UPDATE email_agent_configs
SET system_prompt = replace(
      system_prompt,
      E'- TRAVESSÃO:',
      E'- ITEM AUSENTE: campo marcado com criar_item_da_lista veio VAZIO do gerador. Escreva UM item novo para a mesma lista, no mesmo idioma, tom, pessoa e tamanho dos itens_irmaos, coerente com a orientacao do campo e com o argumento da lista — sem repetir nem parafrasear nenhum irmão. É a única situação em que você cria texto que não estava no original.\n- TRAVESSÃO:'
    ),
    version = version + 1
WHERE agent_type = 'copy_fit'
  AND is_active = true
  AND system_prompt NOT LIKE '%criar_item_da_lista%';

-- Confere: a regra tem de estar lá.
SELECT agent_type, version,
       (system_prompt LIKE '%criar_item_da_lista%') AS tem_regra_item_ausente
  FROM email_agent_configs
 WHERE agent_type = 'copy_fit' AND is_active = true;
