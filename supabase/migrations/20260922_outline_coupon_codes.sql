-- Estrutura geral (email_outline_templates): cupom padrão do email.
--
-- Campo ÚNICO (código literal) por email do flow — global. A variação por
-- idioma/loja NÃO fica aqui: é resolvida depois, na etapa por-loja de cada
-- email (bloco `coupon` em email_blocks). O pipeline usa este código como
-- default do bloco `coupon` quando ainda está vazio.
--
-- Idempotente: dropa a versão jsonb (coupon_codes), caso uma execução
-- anterior a tenha criado, e adiciona a coluna text.

ALTER TABLE email_outline_templates
  DROP COLUMN IF EXISTS coupon_codes;

ALTER TABLE email_outline_templates
  ADD COLUMN IF NOT EXISTS coupon_code text;

COMMENT ON COLUMN email_outline_templates.coupon_code IS
  'Código de cupom padrão deste email (global). A variação por idioma/loja é feita depois, por loja, no bloco coupon (email_blocks). Usado como default do bloco coupon quando vazio.';
