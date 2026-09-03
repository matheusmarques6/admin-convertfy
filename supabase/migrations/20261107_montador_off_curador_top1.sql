-- 20261107 — Montador desligado + Curador com UMA variante por posição
--
-- O Montador (agent 'assembler', story CM-4) escolhia 1 entre as até 3
-- finalistas que o Curador rankeava por posição, "olhando o email inteiro".
-- Na prática ele confirmava o rank 1 em quase tudo (Innova welcome #1,
-- 02/09: 5 de 6 posições) e custava mais um call de ~27k tokens por email.
-- Decisão do owner (03/09): o Curador do vault passa a devolver UMA
-- variante por posição (SHADOW_TOP_N = 1, in-code) e o Montador sai do
-- caminho — a escolha do Curador vai direto para a montagem por código.
--
-- Esta coluna é o kill-switch sem deploy. 'off' = o passo B não chama LLM
-- (run 'assembler' gravada como skipped, com as stats da montagem); 'on'
-- = comportamento anterior (o agente escolhe entre os finalistas — que
-- agora chegam com 1 por posição, então só tem efeito com o Curador legado
-- do kimi, que continua rankeando até 3).

alter table email_generation_settings
  add column if not exists montador_mode text not null default 'off'
  check (montador_mode in ('off','on'));

update email_generation_settings
   set montador_mode = 'off',
       updated_at = now()
 where montador_mode is distinct from 'off';

select montador_mode, curador_vault_mode, estruturador_mode, updated_at
  from email_generation_settings;
