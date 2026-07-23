-- ============================================================
-- Montador (assembler) não cria placeholders próprios (decisão jul/2026):
-- ele PRESERVA o HTML da variante do jeito que vem da biblioteca — que já
-- traz as tags canônicas {{TAG}}. A regra antiga mandava "usar placeholders
-- curtos ({{HEADLINE}}...)" o que conflitava com a REGRA DAS TAGS CANÔNICAS
-- (que exige o padrão SECAO_CAMPO). Troca a linha no user? não: está no
-- SYSTEM prompt. REPLACE idempotente do trecho no system_prompt ATIVO.
-- Prompt editado à mão fica intocado (REPLACE é no-op se o trecho não bate).
-- ============================================================

UPDATE email_agent_configs
SET system_prompt = REPLACE(
  system_prompt,
  '- NÃO escreva a copy final: use placeholders curtos (ex.: {{HEADLINE}}, {{BODY}}, {{CTA_LABEL}}).',
  '- NÃO escreva a copy final e NÃO crie placeholders próprios: DEIXE o HTML de cada variante DO JEITO QUE VEM DA BIBLIOTECA, com os placeholders/tags que ele já traz. Nunca troque conteúdo por placeholder novo, nem simplifique — só preserve o que a variante trouxe.'
)
WHERE agent_type = 'assembler'
  AND is_active = true
  AND system_prompt LIKE '%use placeholders curtos%';
