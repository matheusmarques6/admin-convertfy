-- 20261087 — o HTML marcado vira artefato.
--
-- Cada bloco do email é uma <tr> embrulhada em
--   <!-- cfy:block:{i}:{section}:start --> … <!-- …:end -->
-- pelo Montador (architect/assemble-document.ts). Até aqui esses marcadores
-- eram apagados no fim do STEP 3 da fase 2 — "infraestrutura interna, jamais
-- pode chegar ao cliente" — e o `html` salvo ficava sem âncora nenhuma.
--
-- Consequência: reordenar um bloco na tela mexia só no CONTRATO de copy
-- (email_blocks.position). O email renderizado não mudava, porque
-- renderEmailHtml devolve `html` direto quando ele existe.
--
-- Agora o strip é fronteira de SAÍDA, não etapa: `html` continua limpo (é o
-- que vira o email do cliente) e `html_marked` guarda o mesmo documento com
-- os marcadores. A edição manual de estrutura reordena/remove regiões aqui e
-- re-deriva `html`.
--
-- NULL é estado legítimo e tratado: email gerado antes desta migration, ou
-- HTML colado por fora (o PATCH do email zera a coluna, porque o documento
-- marcado deixou de descrever este email). Nesses casos a edição de
-- estrutura salva a ordem e a revisão sem tocar no HTML, e a tela avisa.

alter table email_flow_emails
  add column if not exists html_marked text;

comment on column email_flow_emails.html_marked is
  'Mesmo documento de html, com os marcadores cfy:block preservados — torna a região de cada bloco endereçável (edição manual de estrutura). NULL = gerado antes da migration 20261087 ou HTML trocado por fora.';
