-- 20261086 — Orientações do COO ao Estruturador, em três escopos.
--
-- Complementa o feedback por run (20261084) com o outro lado do ciclo:
-- o 👍/👎 julga UMA decisão e vira rascunho de aprendizado; a orientação
-- instrui as PRÓXIMAS gerações e vale imediatamente.
--
-- Três alcances, nenhum obrigatório:
--   email  → todo `{flow} #{n}`, em qualquer loja
--   flow   → todo email daquele flow
--   global → todo flow, todo email
--
-- Não é vault. O vault (email_intents/refs/learnings) é o corpus CURADO,
-- que só entra depois de aprovação no Obsidian (decisão 7 do ADR). A
-- orientação é diretriz viva do COO — servida ao agente numa camada
-- SEPARADA (<orientacao_do_coo>), para uma coisa não virar a outra.
--
-- Alcance global de propósito (decisão 27/08): a regra editorial é do
-- MÉTODO, não do cliente — como as intenções e os aprendizados do vault,
-- que também não têm store_id.
--
-- RLS habilitado SEM policies = somente service role (a API valida o gate
-- canManagePrompts). Regra pós-incidente ago/2026: nenhuma policy nova sem
-- TO explícito; aqui não há policy nenhuma de propósito.

create table if not exists estruturador_orientacoes (
  id uuid primary key default gen_random_uuid(),
  escopo text not null check (escopo in ('email', 'flow', 'global')),
  -- null quando escopo='global'
  flow_type text,
  -- não-nulo só quando escopo='email'
  email_number int,
  texto text not null,
  is_active boolean not null default true,
  -- De qual run nasceu, quando veio do painel do Estúdio. Só
  -- rastreabilidade: a orientação NÃO morre com a run (set null).
  origem_run_id uuid references email_generation_runs(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Coerência do escopo com as colunas: 'global' não tem flow nem email,
  -- 'flow' tem flow e não tem email, 'email' tem os dois. Sem isto, uma
  -- linha 'global' com flow_type preenchido seria servida por engano.
  constraint estruturador_orientacoes_escopo_coerente check (
    (escopo = 'global' and flow_type is null and email_number is null) or
    (escopo = 'flow' and flow_type is not null and email_number is null) or
    (escopo = 'email' and flow_type is not null and email_number is not null)
  )
);

-- UMA orientação por escopo — campos, não listas: é o que a UI edita, e é
-- o que impede o bloco de crescer sem controle dentro do prompt.
--
-- COALESCE porque UNIQUE ignora NULL: sem isto, duas linhas 'global'
-- (ambas com flow_type null) conviveriam e as duas seriam servidas.
create unique index if not exists uq_estruturador_orientacoes_escopo
  on estruturador_orientacoes (
    escopo,
    coalesce(flow_type, ''),
    coalesce(email_number, -1)
  );

-- A leitura do runtime é sempre "as ativas que se aplicam a este email".
create index if not exists idx_estruturador_orientacoes_ativas
  on estruturador_orientacoes (is_active, escopo, flow_type, email_number);

alter table estruturador_orientacoes enable row level security;

comment on table estruturador_orientacoes is
  'Diretrizes do COO servidas ao Estruturador em <orientacao_do_coo>. Não é vault: efeito imediato, sem curadoria no Obsidian.';
