-- Idempotência de job que NÃO nasce de uma automação do builder.
--
-- `crm_automation_runs` já tem UNIQUE (automation_id, idempotency_key),
-- e é ela que o executor usa. O job de SLA da prospecção não tem
-- automação nenhuma por trás: ele insere com `automation_id` NULL.
--
-- Em Postgres NULL é DISTINTO num índice único, então
-- (NULL, 'sla:vencido:x:2026-09-21') nunca conflita com ela mesma: o
-- 23505 nunca dispararia e o job criaria a MESMA tarefa em toda rodada,
-- sem erro em lugar nenhum. É a mesma família do 42P10 da fila de
-- conversão — índice que parece proteger e não protege.
--
-- Índice PARCIAL de propósito: ele cobre só as linhas sem automação, e
-- não muda nada pro executor. A inferência de ON CONFLICT não é usada
-- aqui (o código faz INSERT simples e trata 23505), então o problema de
-- índice parcial + `on_conflict=` do PostgREST não se aplica.
--
-- Idempotente: pode rodar de novo.

create unique index if not exists uniq_crm_automation_runs_idem_sem_automacao
  on public.crm_automation_runs (idempotency_key)
  where automation_id is null;

comment on index public.uniq_crm_automation_runs_idem_sem_automacao is
  'Idempotência de jobs sem automação (ex: SLA da prospecção). O UNIQUE (automation_id, idempotency_key) não cobre estas linhas porque NULL é distinto.';
