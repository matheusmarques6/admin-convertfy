-- 20261084 — Fase 4 do Estruturador: feedback do COO sobre as decisões.
--
-- É o mecanismo de calibração do épico (decisão 9 do ADR): cada run do
-- Estruturador pode receber 👍/👎 + comentário no drill-down do Estúdio.
-- O feedback vira rascunho de aprendizado (nota do vault) — o caminho de
-- volta é a curadoria humana no Obsidian, nunca injeção direta no prompt.
--
-- RLS habilitado SEM policies = somente service role (a API valida o gate
-- canManagePrompts). Regra pós-incidente ago/2026: nenhuma policy nova sem
-- TO explícito; aqui não há policy nenhuma de propósito.

create table if not exists estruturador_feedback (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references email_generation_runs(id) on delete cascade,
  -- Denormalizados da run (a run pode ser purgada por retenção; o contexto
  -- do feedback sobrevive para o histórico agregado por flow×email).
  store_id uuid,
  flow_type text,
  email_number int,
  rating text not null check (rating in ('up', 'down')),
  comentario text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Um julgamento por pessoa por run — refazer o clique ATUALIZA, não duplica.
  constraint estruturador_feedback_run_autor unique (run_id, created_by)
);

create index if not exists idx_estruturador_feedback_run
  on estruturador_feedback (run_id);
create index if not exists idx_estruturador_feedback_contexto
  on estruturador_feedback (flow_type, email_number, created_at desc);

alter table estruturador_feedback enable row level security;
