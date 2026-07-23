-- ============================================================
-- Fix de 2 falhas do batch de geração (Luxe Lift, 23/jul):
--
-- 1) MONTADOR truncado: o run parou EXATAMENTE em 16.384 tokens de output
--    (== max_tokens), sem fechar </html> → guard looksLikeHtml barra →
--    fallback llm_output_not_html. O HTML de arquitetura de emails grandes
--    não cabe em 16k. Sobe o teto pra 32.000 (headroom 2x). Idempotente:
--    só sobe se estiver abaixo.
--
-- 2) HTML AGENT timeout: o run morreu no teto de 200s com 0/0 tokens
--    (modelo nunca respondeu). Causa: o modelo ativo é
--    'anthropic/claude-sonnet-4.6' — o "/" ROTEIA VIA OPENROUTER, que
--    pendurou (e o timeout cheio do AbortController NÃO é re-tentado).
--    Volta pro id direto 'claude-sonnet-4-6' (Anthropic SDK, mais rápido
--    e estável). Guard no valor exato pra não sobrescrever escolha diversa.
-- ============================================================

-- 1. Montador: teto de tokens maior (emails grandes fecham o </html>).
UPDATE email_agent_configs
SET max_tokens = 32000
WHERE agent_type = 'assembler'
  AND is_active = true
  AND max_tokens < 32000;

-- 2. HTML agent: modelo direto (sem roteamento OpenRouter).
UPDATE email_agent_configs
SET model = 'claude-sonnet-4-6'
WHERE agent_type = 'html'
  AND is_active = true
  AND model = 'anthropic/claude-sonnet-4.6';
