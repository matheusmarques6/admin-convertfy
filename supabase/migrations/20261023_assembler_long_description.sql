-- ============================================================
-- Montador respeita as notas de implementação das variantes.
--
-- O chosen_html_json agora leva `notas_implementacao` por componente
-- (email_component_variants.long_description — quirks de Outlook, VML,
-- hospedagem de asset). Este UPDATE ensina o prompt ATIVO do assembler
-- a respeitá-las. Estratégia em 2 passos, idempotente:
--   1. REPLACE dirigido logo após a regra "Preserve a técnica..."
--      (texto canônico das migrations 20260730+).
--   2. Fallback: se o prompt ativo divergiu (edição via UI) e o REPLACE
--      não pegou, APENDA a regra ao final do system_prompt.
-- Guard NOT LIKE evita dupla aplicação.
-- ============================================================

-- 1. Inserção no ponto canônico.
UPDATE email_agent_configs
SET system_prompt = REPLACE(
  system_prompt,
  'Regras:
- Preserve a técnica/estrutura de cada variante escolhida — não reescreva do zero; adapte só o necessário para harmonizar (espaçamentos, larguras, tipografia) num documento único.',
  'Regras:
- Preserve a técnica/estrutura de cada variante escolhida — não reescreva do zero; adapte só o necessário para harmonizar (espaçamentos, larguras, tipografia) num documento único.
- Cada componente escolhido pode trazer `notas_implementacao` (quirks de Outlook, VML, hospedagem de assets, restrições técnicas): RESPEITE essas notas ao harmonizar — nunca remova a técnica que elas descrevem e NÃO as copie para o HTML final.'
)
WHERE agent_type = 'assembler'
  AND is_active = true
  AND system_prompt NOT LIKE '%notas_implementacao%';

-- 2. Fallback: prompt ativo divergente → apenda a regra ao final.
UPDATE email_agent_configs
SET system_prompt = system_prompt || '

REGRA DAS NOTAS DE IMPLEMENTAÇÃO: cada componente escolhido pode trazer `notas_implementacao` (quirks de Outlook, VML, hospedagem de assets, restrições técnicas). RESPEITE essas notas ao harmonizar — nunca remova a técnica que elas descrevem e NÃO as copie para o HTML final.'
WHERE agent_type = 'assembler'
  AND is_active = true
  AND system_prompt NOT LIKE '%notas_implementacao%';
