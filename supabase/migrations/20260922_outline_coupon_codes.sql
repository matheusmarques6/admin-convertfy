-- Estrutura geral (email_outline_templates): cupom literal por idioma.
--
-- O código do cupom varia conforme o idioma da loja (ex.: pt-BR usa
-- BEMVINDO10, en usa WELCOME10). Guardamos um mapa { idioma: código } e o
-- pipeline (email-copy-webhook) escolhe o código pelo idioma efetivo da loja
-- (resolveStoreLanguage). Idioma sem código preenchido => nenhum cupom
-- injetado (não caímos em código de outra língua).
--
-- `suggested_blocks` permanece TEXT[], mas passa a carregar apenas as chaves
-- canônicas das 8 categorias da biblioteca (header, hero, body, products,
-- reviews, cta, offer, footer). A normalização é feita na camada de API/UI;
-- linhas legadas com rótulos livres continuam válidas (resolveStructure já
-- tolera via keyword-matching).

ALTER TABLE email_outline_templates
  ADD COLUMN IF NOT EXISTS coupon_codes jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN email_outline_templates.coupon_codes IS
  'Códigos de cupom literais por idioma da loja, ex: {"pt-BR":"BEMVINDO10","en":"WELCOME10"}. O pipeline escolhe pelo idioma efetivo da loja; idioma ausente => sem cupom.';
