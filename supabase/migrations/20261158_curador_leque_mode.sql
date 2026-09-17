-- Leque do Curador (16/09): uma chamada por POSIÇÃO em vez de uma pelo
-- e-mail inteiro.
--
-- Nasce em 'off'. O que ele muda é a FORMA do prompt (o catálogo sai do
-- system e desce fatiado para a cauda, e o contrato de saída descreve uma
-- posição), então ligar é decisão com número na mão — a bancada da Fase 1a
-- mede rodando "Rodar só este nó" sobre o MESMO e-mail nos dois modos, o
-- que custa o Curador sozinho (~US$ 1,6) em vez de uma geração inteira.
--
--   off → o caminho de hoje: uma chamada, o e-mail inteiro.
--   on  → o leque decide a peça.
--
-- **Sem 'shadow', de propósito.** O valor existia no plano e sairia do
-- CHECK sem nenhum código que o executasse: rodar o laço em paralelo
-- pagaria o Curador DUAS vezes por geração de cliente e gravaria uma
-- segunda run `assembler_chooser`, que a RPC do Estúdio (DISTINCT ON por
-- email × bucket) esconderia. Valor no enum que o código não executa é a
-- armadilha que este repositório já pagou três vezes; medir é rodar a
-- bancada com o gate em 'on' e voltar para 'off'.
--
-- Nenhuma migration no CHECK de `email_generation_runs`: o leque continua
-- sendo o agente `assembler_chooser`, e o que muda é o conteúdo do
-- `parsed_output` (chave `leque`), não a linha.

alter table email_generation_settings
  drop constraint if exists email_generation_settings_curador_leque_mode_check;

alter table email_generation_settings
  add column if not exists curador_leque_mode text not null default 'off';

update email_generation_settings
   set curador_leque_mode = 'off'
 where curador_leque_mode not in ('off','on');

alter table email_generation_settings
  add constraint email_generation_settings_curador_leque_mode_check
  check (curador_leque_mode in ('off','on'));

comment on column email_generation_settings.curador_leque_mode is
  'Leque do Curador: off = uma chamada pelo e-mail inteiro; on = uma chamada por posição. Sem shadow (ver o cabeçalho da migration 20261158). A decisão de cada posição fica em parsed_output.leque das runs de assembler_chooser.';
