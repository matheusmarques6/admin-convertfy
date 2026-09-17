-- Cupom do outline por IDIOMA e valor do desconto (14/09).
--
-- O incentivo é decisão do flow: `email_outline_templates.coupon_code` diz
-- se o toque entrega cupom (27 dos 34 toques têm). O que faltava era a
-- tradução: a migration 20260922 dizia que "a variação por idioma/loja é
-- feita depois, por loja, no bloco coupon" — isto é edição MANUAL que
-- ninguém fez, e BEMVINDO10 saiu numa loja inglesa (Hero Boxers, 11/09).
--
-- A tradução é DECISÃO HUMANA, não regra derivável (BEMVINDO10 → WELCOME10
-- é escolha de quem cadastra), então mora aqui como dado, uma chave por
-- código de idioma da lista `STORE_LANGUAGE_CODES`:
--   {"en": "WELCOME10", "pl": "WITAJ10"}
-- `coupon_code` continua sendo o pt-BR e o fallback: idioma sem tradução
-- sai com ele e `traducao_faltante: true` na decisão (vira aviso no QA).
--
-- `coupon_value` ("10%") é o que permite ao validador de copy dizer que
-- "15% OFF" está errado num cupom de 10%. Sem ele só se confere presença.
--
-- ATENÇÃO: a migration 20260922 faz `DROP COLUMN IF EXISTS coupon_codes`.
-- Ela NUNCA pode ser reexecutada depois desta. As migrations deste repo
-- são aplicadas à mão, uma vez; se algum dia houver replay, esta precisa
-- vir depois (e vem: 20261144 > 20260922).
--
-- Quem lê: `incentivoDoOutline` (src/lib/agents/objecoes/incentivo.ts) via
-- `incentivo-da-loja.service.ts` e o webhook do n8n; os dois degradam com
-- `log.warn incentivo.sem_traducao` enquanto as colunas não existirem.

alter table email_outline_templates
  add column if not exists coupon_codes jsonb not null default '{}'::jsonb;

alter table email_outline_templates
  add column if not exists coupon_value text;

comment on column email_outline_templates.coupon_codes is
  'Código do cupom por idioma da loja ({"en":"WELCOME10"}), decisão humana na tela /admin/outlines. coupon_code é o pt-BR e o fallback. Ver src/lib/agents/objecoes/incentivo.ts.';

comment on column email_outline_templates.coupon_value is
  'Valor do desconto do cupom deste toque, como texto ("10%"). Usado pelo validador de copy para conferir percentual prometido × cadastrado.';
