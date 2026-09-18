-- Separação entre seções (18/09) — o gate.
--
-- O K9 do guia de cor diz "troca de fundo sem transição = 0", e a alçada
-- do agente respondia que inserir forma onde não existe nenhuma tem outro
-- dono. Medido na run 794b8ae1 (Innova Bay, 17/09): as duas trocas de
-- fundo da peça saíram secas e ele registrou a mesma lacuna R4 DUAS vezes
-- na telemetria, pedindo o que não podia fazer.
--
-- Nasce 'on', ao contrário de `color_plano_mode` (que nasceu 'shadow'):
-- decisão do dono, e o que substitui a leitura em shadow foi olhar as oito
-- formas renderizadas antes de subir. A coluna existe para poder DESLIGAR
-- sem deploy — que é o que `qa_mode` e `lint_mode` já fazem.
--
--   off    — nada: o catálogo não entra no prompt e nenhuma op é emitida.
--   shadow — o agente decide, o plano é gravado na run, nada é inserido.
--   on     — aplica.

alter table email_generation_settings
  add column if not exists color_separador_mode text not null default 'on'
  check (color_separador_mode in ('off','shadow','on'));

comment on column email_generation_settings.color_separador_mode is
  'Separação entre seções no agente color_format: off | shadow | on. Nasce on. A env EMAIL_SEPARADOR_MODE vence esta coluna (freio que não depende do Postgres responder).';
