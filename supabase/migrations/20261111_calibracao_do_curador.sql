-- 20261111 — o ciclo de calibração deixa de ser só do Estruturador.
--
-- O Estruturador tem, desde a fase 4 (20261084/20261086), os dois lados do
-- ciclo: 👍/👎 por run (vira rascunho de aprendizado, curado no Obsidian) e
-- orientação do COO (instrui as próximas gerações, servida no prompt na
-- hora). O Curador — quem escolhe QUAL bloco da biblioteca realiza o papel
-- de cada posição — não tinha nenhum dos dois: quem via a escolha errada no
-- Estúdio não tinha onde dizer.
--
-- As duas tabelas ganham `agente` em vez de nascer uma cópia por agente: a
-- tela, a rota e o módulo puro são os mesmos; o que muda é a quem o texto é
-- servido. O nome `estruturador_*` fica por ser histórico — renomear tabela
-- em produção não paga o que custa, e o comentário abaixo desfaz a leitura
-- errada.
--
-- 'curador' é o nome humano; a run correspondente é `assembler_chooser`
-- (email_generation_runs.agent). A rota faz o de/para — o banco guarda o
-- nome que quem escreve na tela reconhece.

-- ── Feedback por run ────────────────────────────────────────────────────
-- O UNIQUE (run_id, created_by) já basta: a run pertence a UM agente. A
-- coluna é denormalização para agregar "quantos 👎 por agente" sem join.
alter table public.estruturador_feedback
  add column if not exists agente text not null default 'estruturador';

alter table public.estruturador_feedback
  drop constraint if exists estruturador_feedback_agente_check;

alter table public.estruturador_feedback
  add constraint estruturador_feedback_agente_check
  check (agente in ('estruturador', 'curador'));

comment on table public.estruturador_feedback is
  'Julgamento humano de UMA run, por agente (estruturador | curador). Vira rascunho de nota do vault — nunca entra direto no prompt. Nome da tabela é histórico: serve os dois.';

-- ── Orientações do COO ──────────────────────────────────────────────────
-- Aqui a coluna é ESTRUTURAL: sem ela, a orientação escrita para o
-- Estruturador seria servida também ao Curador (e o índice único deixaria
-- só uma das duas existir por escopo).
alter table public.estruturador_orientacoes
  add column if not exists agente text not null default 'estruturador';

alter table public.estruturador_orientacoes
  drop constraint if exists estruturador_orientacoes_agente_check;

alter table public.estruturador_orientacoes
  add constraint estruturador_orientacoes_agente_check
  check (agente in ('estruturador', 'curador'));

drop index if exists uq_estruturador_orientacoes_escopo;

create unique index if not exists uq_estruturador_orientacoes_escopo
  on public.estruturador_orientacoes (
    agente,
    escopo,
    coalesce(flow_type, ''),
    coalesce(email_number, -1),
    kind
  );

-- A leitura do runtime é "as ativas DESTE agente que se aplicam a este
-- email" — sem `agente` no índice, toda geração varreria as do outro.
drop index if exists idx_estruturador_orientacoes_ativas;

create index if not exists idx_estruturador_orientacoes_ativas
  on public.estruturador_orientacoes (agente, is_active, escopo, flow_type, email_number);

comment on table public.estruturador_orientacoes is
  'Diretrizes do COO servidas em <orientacao_do_coo> ao agente da coluna `agente`. Não é vault: efeito imediato, sem curadoria no Obsidian. Nome da tabela é histórico: serve o Estruturador e o Curador.';
