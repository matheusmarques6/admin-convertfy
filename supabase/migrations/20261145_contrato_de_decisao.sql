-- Contrato de decisão do e-mail (14/09) — Passo 6 do plano de evolução.
--
-- `store_email_blueprints.decisao`: o objeto `DecisaoDoEmail` montado UMA
-- vez depois do Estruturador (alvo do Seletor + estrutura com requisitos +
-- incentivo do toque) e lido por todo nó a jusante. Até aqui cada nó lia um
-- subconjunto diferente de quatro lugares e a inversão acontecia na
-- fronteira (batch 6249aef2: 3 de 6 posições contrárias à decisão).
--
-- Três gates em `email_generation_settings`, mesmo desenho de
-- `color_plano_mode`/`qa_mode` (off | shadow | on):
--   contrato_estrutural   — validadores de escolha/resgate/blueprint (campo
--                           × campo, sem falso positivo). Nasce `on`.
--   contrato_textual      — régua de claims de oferta na copy e no HTML
--                           final (regex). Nasce `shadow`: uma semana lendo
--                           violações antes de ligar.
--   auditoria_estruturador — auditoria dos `requisitos` que o Estruturador
--                           declara (é de lá que sai o filtro por contrato).
--                           Nasce `on`.
--
-- O código degrada com log nomeado quando as colunas não existem
-- (`decisao.coluna_ausente`, `contrato_mode.load_failed`).

alter table store_email_blueprints
  add column if not exists decisao jsonb;

comment on column store_email_blueprints.decisao is
  'DecisaoDoEmail (src/lib/agents/shared/decisao-do-email.ts): alvo, incentivo, insumos, proibições deduplicadas, posições com requisitos, descartes, fio. Montada uma vez após o Estruturador; lida pelo Curador, blueprint, n8n, formatação e QA.';

alter table email_generation_settings
  add column if not exists contrato_estrutural text not null default 'on'
  check (contrato_estrutural in ('off','shadow','on'));

alter table email_generation_settings
  add column if not exists contrato_textual text not null default 'shadow'
  check (contrato_textual in ('off','shadow','on'));

alter table email_generation_settings
  add column if not exists auditoria_estruturador text not null default 'on'
  check (auditoria_estruturador in ('off','shadow','on'));

comment on column email_generation_settings.contrato_estrutural is
  'Validadores estruturais do contrato de decisão (escolha do Curador, resgate, blueprint): off = não roda; shadow = grava violações em _contrato sem bloquear; on = viola → retentativa e depois failed. Ver src/lib/agents/shared/contrato-mode.ts.';

comment on column email_generation_settings.contrato_textual is
  'Régua de claims de oferta na copy do n8n e no HTML final: off = não roda; shadow = grava; on = copy volta ao n8n uma vez / HTML reprova. Ver src/lib/agents/shared/validadores/claims.ts.';

comment on column email_generation_settings.auditoria_estruturador is
  'Auditoria dos requisitos declarados pelo Estruturador: off = não roda; shadow = grava; on = incoerência dura → retentativa e depois failed (estruturador_incoerente). Ver src/lib/agents/estruturador/auditoria-requisitos.ts.';
