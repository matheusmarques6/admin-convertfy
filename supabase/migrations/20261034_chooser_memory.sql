-- ============================================================
-- Memória do Curador (assembler_chooser) — decisão jul/2026:
--   O Curador passa a receber <memoria> com dois sinais (código:
--   curador-memory.ts + email_generation_choices):
--     1. email_anterior_desta_loja — variantes do email N-1 do mesmo
--        flow/loja → COERÊNCIA visual dentro do flow.
--     2. mesmo_email_em_outras_lojas — variantes que o MESMO email (N)
--        recebeu nas últimas lojas do org → VARIEDADE.
-- Este UPDATE injeta a seção <memoria> no user_template ATIVO (após
-- <top_products>) + a regra de uso no system prompt. Idempotente
-- (guards NOT LIKE), mesmo padrão da 20261025.
-- ============================================================

-- 1. Inserção no ponto canônico (logo após o fechamento de <top_products>).
UPDATE email_agent_configs
SET user_template = REPLACE(
  user_template,
  '</top_products>',
  '</top_products>

<memoria>
{{memoria}}
</memoria>'
)
WHERE agent_type = 'assembler_chooser'
  AND is_active = true
  AND user_template NOT LIKE '%{{memoria}}%'
  AND user_template LIKE '%</top_products>%';

-- 2. Fallback: template divergente sem </top_products> → apenda ao final.
UPDATE email_agent_configs
SET user_template = user_template || '

<memoria>
{{memoria}}
</memoria>'
WHERE agent_type = 'assembler_chooser'
  AND is_active = true
  AND user_template NOT LIKE '%{{memoria}}%';

-- 3. System prompt: como usar a memória.
UPDATE email_agent_configs
SET system_prompt = system_prompt || '

MEMÓRIA (<memoria>): use como sinal de continuidade e variedade. <email_anterior_desta_loja> traz as variantes escolhidas no email ANTERIOR do MESMO flow desta loja — busque COERÊNCIA de linguagem visual (mesma família de layout), sem copiar cegamente. <mesmo_email_em_outras_lojas> traz as variantes que ESTE mesmo email recebeu em OUTRAS lojas recentes — busque VARIEDADE, evitando repetir sempre as mesmas variantes quando houver alternativa igualmente adequada. A memória é sinal, não regra: adequação à marca e ao objetivo do email SEMPRE vence.'
WHERE agent_type = 'assembler_chooser'
  AND is_active = true
  AND system_prompt NOT LIKE '%<memoria>%';
