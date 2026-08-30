-- =============================================================
-- Orientação do fluxo em DOIS textos: intenção e progressão.
--
-- `estruturador_orientacoes` (20261086) aceita um texto por escopo. Para o
-- escopo `flow` isso não basta: o que se escreve sobre um fluxo são duas
-- coisas independentes, e o pipeline JÁ as trata separado — o Estruturador
-- recebe `intencao_flow` e `progressao` como duas variáveis de prompt
-- distintas (estruturador.service.ts), montadas de `email_intents` com
-- `slug='_flow'` e `kind='progressao'`.
--
-- `email_intents` é sincronizada do Obsidian: escrever ali pelo admin seria
-- desfeito no próximo sync. A orientação é o par EDITÁVEL do mesmo material,
-- servida em `<orientacao_do_coo>` — camada separada do vault de propósito,
-- e declarada no prompt como valendo acima dele.
--
-- Daí o `kind` usar o MESMO vocabulário de `email_intents.kind`: quem escreve
-- na tela e quem cura no Obsidian falam a mesma língua.
--
-- 'geral' é o default e cobre o que já existia (escopo global e por e-mail,
-- que não se dividem em intenção/progressão). A tabela está VAZIA hoje —
-- nenhuma linha para migrar.
-- =============================================================

alter table public.estruturador_orientacoes
  add column if not exists kind text not null default 'geral';

alter table public.estruturador_orientacoes
  drop constraint if exists estruturador_orientacoes_kind_check;

alter table public.estruturador_orientacoes
  add constraint estruturador_orientacoes_kind_check
  check (kind in ('geral', 'intencao', 'progressao'));

comment on column public.estruturador_orientacoes.kind is
  'Que tipo de orientação é esta. No escopo `flow`: intencao (o arco e o que
   o fluxo precisa provocar) e progressao (como a forma muda de e-mail para
   e-mail). Espelha email_intents.kind — o vault guarda o curado, isto é o
   editável. `geral` nos demais escopos.';

-- O índice único passa a incluir o kind: duas linhas de flow convivem se os
-- kinds forem diferentes, e continuam barradas se forem iguais. COALESCE
-- pelo mesmo motivo de antes — UNIQUE ignora NULL, e 'global' tem flow_type
-- e email_number nulos.
drop index if exists uq_estruturador_orientacoes_escopo;

create unique index if not exists uq_estruturador_orientacoes_escopo
  on public.estruturador_orientacoes (
    escopo,
    coalesce(flow_type, ''),
    coalesce(email_number, -1),
    kind
  );
