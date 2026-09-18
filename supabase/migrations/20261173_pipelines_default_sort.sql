-- 20261173 · Ordenação padrão do board, por pipeline. (APLICADA em produção em 17/09.)
--
-- O board sempre reordenou por `last_stage_changed_at` (o `moved_desc` do
-- seletor), e a ordem que a API devolve — `deals.position` crescente — era
-- descartada no cliente. Numa pipeline de PROSPECÇÃO isso inverte o
-- trabalho: o import da lista do parceiro gravou a prioridade em
-- `position` (passos de 10, única dentro de cada coluna), e o board
-- mostrava os 431 negócios na ordem em que foram tocados pela última vez.
--
-- A escolha é da PIPELINE, não do usuário: quem abre a fila da campanha
-- pela primeira vez tem de ver a ordem de abordagem sem configurar nada.
-- O seletor do topo continua valendo como override da sessão.
--
-- Coluna ADITIVA e nula por padrão: toda pipeline que não declarar segue
-- em `moved_desc`, e as leituras fazem retry sem ela (a migration deste
-- repo é aplicada à mão e escorrega). Idempotente.
--
-- Nasceu como 20261161 e foi renumerada: outra sessão gravou o mesmo
-- número no mesmo dia (`20261161_forms_resultados_rpc.sql`).

begin;

alter table public.pipelines
  add column if not exists default_sort text;

comment on column public.pipelines.default_sort is
  'Ordenação inicial do board: created_desc | created_asc | moved_desc | moved_asc | position_asc. NULL = moved_desc.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pipelines_default_sort_check'
  ) then
    alter table public.pipelines
      add constraint pipelines_default_sort_check
      check (
        default_sort is null
        or default_sort in ('created_desc', 'created_asc', 'moved_desc', 'moved_asc', 'position_asc')
      );
  end if;
end $$;

-- A campanha do parceiro abre na ordem da lista. Por NOME e não por id:
-- o script roda em qualquer ambiente que tenha a pipeline, e onde ela não
-- existir o update alcança zero linhas em vez de falhar.
update public.pipelines
   set default_sort = 'position_asc'
 where name = 'Parceiro Luan · Black Friday 2026'
   and default_sort is distinct from 'position_asc';

commit;
