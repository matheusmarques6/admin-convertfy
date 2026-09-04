-- Limpeza one-off (set/2026): as 8 intenções do welcome nasceram como
-- `intencoes/welcome/1.md`..`8.md` e foram renomeadas para `welcome-1.md`..
-- `welcome-8.md`. O vault-sync nunca apaga (arquivo removido → is_active=false),
-- então as 8 linhas antigas ficaram inativas com o MESMO body_md — inofensivas
-- para o runtime (todo loader filtra is_active) e poluição no Estúdio.
--
-- É dado, não schema: aplicar à mão, uma vez. Idempotente.

delete from email_intents
 where flow_type = 'welcome'
   and not is_active
   and kind = 'intencao'
   and slug ~ '^[0-9]+$';

-- Confere: só welcome-1..8, _flow e _progressao devem sobrar.
select slug, kind, email_number, is_active from email_intents
 where flow_type = 'welcome' order by email_number nulls last, slug;
