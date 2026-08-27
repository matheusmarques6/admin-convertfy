-- 20261088 — revisão humana da estrutura do email.
--
-- Quando o operador reordena ou remove blocos na tela do email, ele escreve
-- POR QUÊ. Essa justificativa vira input dos agentes na próxima geração
-- daquele email: o review humano entrando no pipeline em vez de morrer numa
-- correção manual que o agente refaz na geração seguinte.
--
-- Tabela própria e não `estruturador_orientacoes` porque isto NÃO é uma
-- diretriz de texto livre: é um diff de ordem com motivo (as duas sequências
-- viajam para o prompt e para a telemetria) e tem alcance por LOJA — que a
-- orientação do COO não tem, onde a regra é do MÉTODO (decisão do ADR). As
-- duas camadas convivem, como o vault e a orientação já convivem.
--
-- RLS habilitado SEM policies = service role apenas; a rota é o caminho e
-- valida quem pode. Regra pós-incidente ago/2026: nenhuma policy nova sem TO
-- explícito — aqui não há policy nenhuma, de propósito.

create table if not exists email_structure_reviews (
  id uuid primary key default gen_random_uuid(),

  -- Alcance 'este_email' = desta loja; 'todo_email_do_flow' = todo email #N
  -- daquele flow, em qualquer loja (store_id null).
  alcance text not null check (alcance in ('este_email', 'todo_email_do_flow')),
  store_id uuid references client_stores(id) on delete cascade,
  flow_type text not null,
  email_number int not null,
  -- De qual email nasceu. SET NULL: a revisão sobrevive ao email ser
  -- recriado — ela vale para o (flow, número), não para a linha.
  email_id uuid references email_flow_emails(id) on delete set null,

  -- Sections (hero, body, offer…) na ordem de antes e de depois. É o que o
  -- prompt mostra: "estava assim → ficou assim, porque…". Guardar as duas
  -- sequências é o motivo de esta tabela existir em vez de um texto livre.
  ordem_anterior text[] not null default '{}',
  ordem_nova text[] not null default '{}',
  blocos_removidos text[] not null default '{}',

  justificativa text not null,

  -- Quem lê. O Estruturador é o dono da ORDEM e vem marcado por padrão; o
  -- Curador e o Montador entram quando o motivo também fala de escolha de
  -- variante ou de composição.
  para_estruturador boolean not null default true,
  para_curador boolean not null default false,
  para_montador boolean not null default false,

  is_active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),

  -- Coerência do alcance com a coluna: 'este_email' exige loja, o outro
  -- exige a ausência dela. Sem isto uma revisão global com store_id seria
  -- servida para a loja errada.
  constraint email_structure_reviews_alcance_coerente check (
    (alcance = 'este_email' and store_id is not null) or
    (alcance = 'todo_email_do_flow' and store_id is null)
  )
);

-- UMA revisão ATIVA por alvo: salvar de novo desativa a anterior em vez de
-- empilhar. O histórico fica (is_active = false), o prompt não cresce sem
-- controle. COALESCE porque UNIQUE ignora NULL e o alcance global tem
-- store_id nulo.
create unique index if not exists uq_email_structure_reviews_alvo
  on email_structure_reviews (
    alcance,
    coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid),
    flow_type,
    email_number
  )
  where is_active;

-- A leitura do runtime é sempre "as ativas que se aplicam a este email".
create index if not exists idx_email_structure_reviews_ativas
  on email_structure_reviews (is_active, flow_type, email_number, store_id);

alter table email_structure_reviews enable row level security;

comment on table email_structure_reviews is
  'Revisão humana da estrutura de um email (reordenar/remover + porquê), servida aos agentes em <revisao_humana> na próxima geração. Sinal forte, não trava: o agente pode divergir com motivo.';
