-- =============================================================
-- Wipe do TEXTO editorial — 29/08/2026 (JÁ EXECUTADO em produção)
--
-- Zera os três guias da aba "Arquitetura dos Emails" — "Intenção do e-mail",
-- "O e-mail deve" e "O e-mail não deve" — para que sejam reescritos do zero.
-- A SEQUÊNCIA DE BLOCOS fica intacta, e é ela que continua desenhando o
-- e-mail.
--
-- Histórico honesto: a primeira execução desta janela zerou os BLOCOS
-- (APPLY_MANUALLY_wipe_blocos_20260829.sql). Era o oposto do pretendido; foi
-- revertida pelas tabelas espelho, com divergência zero contra o backup, e
-- substituída por este arquivo. O anterior fica no repo só como registro —
-- não rode.
--
-- Colunas zeradas e onde cada uma aparece na tela:
--   email_blueprints.objective        → "Intenção do e-mail"
--   email_blueprints.messaging        → "O e-mail deve" (a metade do blueprint)
--   email_outline_templates.objective → "Intenção" (fallback)
--   email_outline_templates.guidance  → "O e-mail deve" (a metade do outline)
--   email_outline_templates.restrictions → "O e-mail não deve" (já vazia nas 34)
--
-- `objective` e `messaging` são NOT NULL nas duas tabelas — daí string vazia
-- em vez de NULL.
--
-- Intocados: blocks, suggested_blocks, subject_hint, tone_override,
-- tone_hint, coupon_code, text_only, image_* e a régua
-- (email_flow_templates).
--
-- O que muda no pipeline até a re-curação: o payload de copy do n8n leva
-- `objective` e `messaging` VAZIOS. A cascata de
-- email-copy-webhook.service.ts é `bp?.objective ?? outline?.objective ??
-- bpDefault?.objective` — `??` só cobre null/undefined, então a string vazia
-- ganha do DEFAULT_BLUEPRINTS do código. É consequência aceita do wipe, não
-- descuido: o texto tem de sair em branco na tela para ser reescrito.
-- =============================================================

UPDATE email_blueprints
   SET objective = '', messaging = ''
 WHERE btrim(objective) <> '' OR btrim(messaging) <> '';

UPDATE email_outline_templates
   SET objective = '', guidance = NULL, restrictions = NULL
 WHERE btrim(objective) <> '' OR guidance IS NOT NULL OR restrictions IS NOT NULL;

-- Estado depois de rodar (conferido em 29/08):
--   email_blueprints        → 34 linhas · 0 com intenção · 0 com diretriz
--                             · 34 COM BLOCOS (249 no total) · 34 com assunto
--                             · 5 somente-texto
--   email_outline_templates → 34 linhas · 0 com intenção · 0 com guidance
--                             · 32 COM suggested_blocks (205) · 24 com cupom
--   email_flow_templates    → 34 e-mails ativos nos 7 fluxos (intocada)

-- ── Como reverter ──────────────────────────────────────────────
--   UPDATE email_blueprints b
--      SET objective = k.objective, messaging = k.messaging
--     FROM email_blueprints_bkp_20260829 k WHERE k.id = b.id;
--
--   UPDATE email_outline_templates o
--      SET objective = k.objective, guidance = k.guidance
--     FROM email_outline_templates_bkp_20260829 k WHERE k.id = o.id;
--
-- (`restrictions` é coluna nova da migration 20261091 e estava NULL nas 34,
-- então não há o que restaurar nela.)
--
-- Fora do banco, o mesmo conteúdo está em
-- `supabase/migrations/BACKUP_arquitetura_emails_20260829.sql` (68 tuplas) —
-- mas aquele arquivo usa `ON CONFLICT (id) DO NOTHING`, que restaura linha
-- APAGADA, não linha alterada. Para desfazer este wipe, use os UPDATE acima.
