-- DADOS — tradução dos cupons por idioma nos outlines (14/09/2026).
-- Não é migration: é o registro do UPDATE rodado à mão em produção pelo MCP,
-- como `TROCAR_modelo_agentes.sql`. Decisão do dono: os códigos pt-BR do banco
-- são os canônicos; a tradução é LITERAL por idioma (ja/zh/ko usam o inglês —
-- código de cupom precisa ser ASCII, sem acento); `coupon_value` sai do sufixo
-- numérico (ESPECIAL fica NULL).
--
-- Antes: `coupon_codes = '{}'` e `coupon_value = NULL` nos 24 outlines ativos
-- com cupom. Rollback = o UPDATE do fim deste arquivo.
--
-- | pt-BR       | en          | es           | de           | fr          | it          | nl          | nb          | sv          | da          | fi            | pl            | ja/zh/ko    |
-- | BEMVINDO10  | WELCOME10   | BIENVENIDO10 | WILLKOMMEN10 | BIENVENUE10 | BENVENUTO10 | WELKOM10    | VELKOMMEN10 | VALKOMMEN10 | VELKOMMEN10 | TERVETULOA10  | WITAJ10       | WELCOME10   |
-- | DESCONTO10  | DISCOUNT10  | DESCUENTO10  | RABATT10     | REMISE10    | SCONTO10    | KORTING10   | RABATT10    | RABATT10    | RABAT10     | ALENNUS10     | RABAT10       | DISCOUNT10  |
-- | DESCONTO12  | DISCOUNT12  | DESCUENTO12  | RABATT12     | REMISE12    | SCONTO12    | KORTING12   | RABATT12    | RABATT12    | RABAT12     | ALENNUS12     | RABAT12       | DISCOUNT12  |
-- | EXCLUSIVO12 | EXCLUSIVE12 | EXCLUSIVO12  | EXKLUSIV12   | EXCLUSIF12  | ESCLUSIVO12 | EXCLUSIEF12 | EKSKLUSIV12 | EXKLUSIV12  | EKSKLUSIV12 | EKSKLUSIIVI12 | EKSKLUZYWNY12 | EXCLUSIVE12 |
-- | EXCLUSIVO14 | EXCLUSIVE14 | EXCLUSIVO14  | EXKLUSIV14   | EXCLUSIF14  | ESCLUSIVO14 | EXCLUSIEF14 | EKSKLUSIV14 | EXKLUSIV14  | EKSKLUSIV14 | EKSKLUSIIVI14 | EKSKLUZYWNY14 | EXCLUSIVE14 |
-- | ESPECIAL    | SPECIAL     | ESPECIAL     | SPEZIAL      | SPECIAL     | SPECIALE    | SPECIAAL    | SPESIELL    | SPECIELL    | SPECIEL     | ERIKOIS       | SPECJALNY     | SPECIAL     |
-- | VOLTEI15    | COMEBACK15  | VOLVI15      | ZURUECK15    | RETOUR15    | RITORNO15   | TERUG15     | TILBAKE15   | TILLBAKA15  | TILBAGE15   | TAKAISIN15    | WROCILEM15    | COMEBACK15  |
-- | VOLTEI12    | COMEBACK12  | VOLVI12      | ZURUECK12    | RETOUR12    | RITORNO12   | TERUG12     | TILBAKE12   | TILLBAKA12  | TILBAGE12   | TAKAISIN12    | WROCILEM12    | COMEBACK12  |
--
-- O código do outline é o DEFAULT por idioma; a loja sobrescreve pelo bloco
-- `coupon` do e-mail (`email_blocks.content.code`). O cupom precisa existir na
-- plataforma da loja — é responsabilidade de quem configura a loja.

update email_outline_templates set coupon_codes = '{"en":"WELCOME10","es":"BIENVENIDO10","de":"WILLKOMMEN10","fr":"BIENVENUE10","it":"BENVENUTO10","nl":"WELKOM10","nb":"VELKOMMEN10","sv":"VALKOMMEN10","da":"VELKOMMEN10","fi":"TERVETULOA10","pl":"WITAJ10","ja":"WELCOME10","zh":"WELCOME10","ko":"WELCOME10"}'::jsonb, coupon_value = '10%' where is_active = true and coupon_code = 'BEMVINDO10';
update email_outline_templates set coupon_codes = '{"en":"DISCOUNT10","es":"DESCUENTO10","de":"RABATT10","fr":"REMISE10","it":"SCONTO10","nl":"KORTING10","nb":"RABATT10","sv":"RABATT10","da":"RABAT10","fi":"ALENNUS10","pl":"RABAT10","ja":"DISCOUNT10","zh":"DISCOUNT10","ko":"DISCOUNT10"}'::jsonb, coupon_value = '10%' where is_active = true and coupon_code = 'DESCONTO10';
update email_outline_templates set coupon_codes = '{"en":"DISCOUNT12","es":"DESCUENTO12","de":"RABATT12","fr":"REMISE12","it":"SCONTO12","nl":"KORTING12","nb":"RABATT12","sv":"RABATT12","da":"RABAT12","fi":"ALENNUS12","pl":"RABAT12","ja":"DISCOUNT12","zh":"DISCOUNT12","ko":"DISCOUNT12"}'::jsonb, coupon_value = '12%' where is_active = true and coupon_code = 'DESCONTO12';
update email_outline_templates set coupon_codes = '{"en":"EXCLUSIVE12","es":"EXCLUSIVO12","de":"EXKLUSIV12","fr":"EXCLUSIF12","it":"ESCLUSIVO12","nl":"EXCLUSIEF12","nb":"EKSKLUSIV12","sv":"EXKLUSIV12","da":"EKSKLUSIV12","fi":"EKSKLUSIIVI12","pl":"EKSKLUZYWNY12","ja":"EXCLUSIVE12","zh":"EXCLUSIVE12","ko":"EXCLUSIVE12"}'::jsonb, coupon_value = '12%' where is_active = true and coupon_code = 'EXCLUSIVO12';
update email_outline_templates set coupon_codes = '{"en":"EXCLUSIVE14","es":"EXCLUSIVO14","de":"EXKLUSIV14","fr":"EXCLUSIF14","it":"ESCLUSIVO14","nl":"EXCLUSIEF14","nb":"EKSKLUSIV14","sv":"EXKLUSIV14","da":"EKSKLUSIV14","fi":"EKSKLUSIIVI14","pl":"EKSKLUZYWNY14","ja":"EXCLUSIVE14","zh":"EXCLUSIVE14","ko":"EXCLUSIVE14"}'::jsonb, coupon_value = '14%' where is_active = true and coupon_code = 'EXCLUSIVO14';
update email_outline_templates set coupon_codes = '{"en":"SPECIAL","es":"ESPECIAL","de":"SPEZIAL","fr":"SPECIAL","it":"SPECIALE","nl":"SPECIAAL","nb":"SPESIELL","sv":"SPECIELL","da":"SPECIEL","fi":"ERIKOIS","pl":"SPECJALNY","ja":"SPECIAL","zh":"SPECIAL","ko":"SPECIAL"}'::jsonb where is_active = true and coupon_code = 'ESPECIAL';
update email_outline_templates set coupon_codes = '{"en":"COMEBACK15","es":"VOLVI15","de":"ZURUECK15","fr":"RETOUR15","it":"RITORNO15","nl":"TERUG15","nb":"TILBAKE15","sv":"TILLBAKA15","da":"TILBAGE15","fi":"TAKAISIN15","pl":"WROCILEM15","ja":"COMEBACK15","zh":"COMEBACK15","ko":"COMEBACK15"}'::jsonb, coupon_value = '15%' where is_active = true and coupon_code = 'VOLTEI15';
update email_outline_templates set coupon_codes = '{"en":"COMEBACK12","es":"VOLVI12","de":"ZURUECK12","fr":"RETOUR12","it":"RITORNO12","nl":"TERUG12","nb":"TILBAKE12","sv":"TILLBAKA12","da":"TILBAGE12","fi":"TAKAISIN12","pl":"WROCILEM12","ja":"COMEBACK12","zh":"COMEBACK12","ko":"COMEBACK12"}'::jsonb, coupon_value = '12%' where is_active = true and coupon_code = 'VOLTEI12';

-- Verificação: sem_traducao = 0 em todos; sem_valor = 0 exceto ESPECIAL (3).
-- select coupon_code, count(*), count(*) filter (where coupon_codes = '{}'::jsonb) as sem_traducao,
--        count(*) filter (where coupon_value is null) as sem_valor
--   from email_outline_templates where is_active and coupon_code is not null group by 1;

-- Rollback (volta ao pt-BR com aviso `traducao_faltante`):
-- update email_outline_templates set coupon_codes = '{}'::jsonb, coupon_value = null
--  where is_active = true and coupon_code is not null;
