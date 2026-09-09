-- Lacunas da biblioteca propostas pela telemetria do Curador (09/09).
--
-- O 👎 do Estúdio gera rascunho que ninguém persiste e o token do vault é
-- read-only: não há caminho automático de "o Curador tropeçou 4 vezes no
-- mesmo buraco" até uma nota em componentes/lacunas/. Esta tabela é a fila:
-- o cron agrega `protocol_violations` + `posicoes_sem_variante` das runs
-- `assembler_chooser` de 14 dias e, na 3ª ocorrência, grava o rascunho
-- (molde em src/lib/agents/architect/lacuna-draft.ts). A aba Conhecimento
-- lista, copia e marca. Idempotente pela `chave`.
--
-- RLS: TO authenticated + is_org_member() (regra do incidente ago/2026).
-- Não há org_id: o vault é um só e a proposta não é dado de cliente.

create table if not exists vault_propostas (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  tipo text not null check (tipo in ('lacuna')),
  violacao text not null,
  secao text,
  path_sugerido text not null,
  markdown text not null,
  ocorrencias integer not null default 0,
  primeira_vez timestamptz not null,
  ultima_vez timestamptz not null,
  exemplos jsonb not null default '[]'::jsonb,
  status text not null default 'proposta' check (status in ('proposta','copiada','descartada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vault_propostas_status on vault_propostas(status, ocorrencias desc);

alter table vault_propostas enable row level security;
drop policy if exists vault_propostas_select on vault_propostas;
create policy vault_propostas_select on vault_propostas
  for select to authenticated using (is_org_member());
drop policy if exists vault_propostas_update on vault_propostas;
create policy vault_propostas_update on vault_propostas
  for update to authenticated using (is_org_member()) with check (is_org_member());

comment on table vault_propostas is
  'Rascunhos de nota do vault de e-mail propostos por telemetria (lacunas da biblioteca). O humano copia para o Obsidian; status marca o que já foi levado.';
