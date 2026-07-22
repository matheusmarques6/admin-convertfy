-- ============================================================
-- Curador (assembler_chooser) recebe mais contexto (decisão jul/2026):
--   1. Candidatos ganham orientacao_copy (copy_guidance), campos_copy
--      (output_schema compacto) e notas_implementacao (long_description)
--      — mudança de código, sem SQL (candidates_json).
--   2. Prompt ganha <perfil_marca> ({{briefing_marca}} =
--      store_briefings.marca) e <top_products> (top 5 da loja).
-- Este UPDATE injeta as seções no user_template ATIVO + regras no system
-- prompt. Estratégia em 2 passos, idempotente (guards NOT LIKE), mesmo
-- padrão das 20261023/20261024.
-- ============================================================

-- 1. Inserção no ponto canônico (logo após o fechamento de <outline>).
UPDATE email_agent_configs
SET user_template = REPLACE(
  user_template,
  '</outline>',
  '</outline>

<perfil_marca>
{{briefing_marca}}
</perfil_marca>

<top_products>
{{top_products}}
</top_products>'
)
WHERE agent_type = 'assembler_chooser'
  AND is_active = true
  AND user_template NOT LIKE '%{{briefing_marca}}%'
  AND user_template LIKE '%</outline>%';

-- 2. Fallback: template divergente sem </outline> → apenda ao final.
UPDATE email_agent_configs
SET user_template = user_template || '

<perfil_marca>
{{briefing_marca}}
</perfil_marca>

<top_products>
{{top_products}}
</top_products>'
WHERE agent_type = 'assembler_chooser'
  AND is_active = true
  AND user_template NOT LIKE '%{{briefing_marca}}%';

-- 3. System prompt: como usar os dados novos.
UPDATE email_agent_configs
SET system_prompt = system_prompt || '

DADOS NOVOS POR CANDIDATO: orientacao_copy (diretriz de copy do bloco), campos_copy (campos que o bloco exige da copy — key/type/max_len/required) e notas_implementacao (notas técnicas do layout). Use-os como sinal de viabilidade: se o bloco exige dados que a loja não tem (ex.: campo de cupom sem oferta no contexto), prefira outra variante. CONTEXTO NOVO: <perfil_marca> é a âncora de identidade (a escolha precisa caber na marca) e <top_products> lista os produtos reais da loja — NUNCA escolha variante que exige mais produtos (product_slots) do que a loja tem cadastrado.'
WHERE agent_type = 'assembler_chooser'
  AND is_active = true
  AND system_prompt NOT LIKE '%campos_copy%';
