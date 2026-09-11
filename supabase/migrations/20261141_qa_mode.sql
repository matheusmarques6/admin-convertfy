-- O interruptor do QA sai do ambiente e vai para o banco.
--
-- `getQaMode()` lê só `process.env`, então ligar o QA em produção exigia um
-- deploy da Vercel e desligá-lo de novo, outro. É o mesmo desenho que
-- `montador_mode`, `seletor_mode`, `blueprint_mode` e `color_plano_mode` já
-- tinham — e o QA é o mais importante deles, porque em `enforce` uma issue
-- `high` passa a REPROVAR a peça (`status: failed`, `qa_failed`).
--
--   off     → o agente de QA nem roda; o HTML vai direto para `ready` e os
--             checks determinísticos ficam gravados em `qa_issues`.
--   shadow  → roda, grava tudo e NÃO bloqueia. Era o default.
--   enforce → `passed = false` (ou um check de conteúdo `high`) reprova.
--
-- A variável de ambiente CONTINUA VENCENDO o banco: ela é o freio de
-- emergência que não depende do Postgres responder. Ver
-- `src/lib/agents/chains/qa-mode-loader.ts`.
--
-- Default `shadow` na coluna, e o UPDATE abaixo liga `enforce` para as orgs
-- existentes — decisão de 11/09, depois da semana de medição: no batch
-- 57bf409d o QA apontou 5 issues `high` (preheader com placeholder visível,
-- dois grupos de links sem endereço, lorem ipsum e label genérico) e o
-- e-mail saiu `ready` assim mesmo, com o cliente reclamando dos mesmos
-- pontos depois.
alter table email_generation_settings
  add column if not exists qa_mode text not null default 'shadow'
  check (qa_mode in ('off','shadow','enforce'));

comment on column email_generation_settings.qa_mode is
  'QA da fase 2: off = pula o agente; shadow = roda e registra sem bloquear; enforce = issue high reprova a peça. EMAIL_QA_MODE/EMAIL_QA_ENABLED no ambiente VENCEM esta coluna. Ver src/lib/agents/chains/qa-mode-loader.ts.';

update email_generation_settings set qa_mode = 'enforce' where qa_mode = 'shadow';
