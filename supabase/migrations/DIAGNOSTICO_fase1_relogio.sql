-- ============================================================================
-- DIAGNÓSTICO — o relógio da fase 1
--
-- Não é migration: são as queries que PRODUZEM os números gravados em
-- `src/lib/agents/fase1-orcamento.ts` (`CUSTO_TIPICO_MS`,
-- `RESERVA_POS_ESTRUTURADOR_MS`) e em
-- `src/lib/services/email-dispatch-queue.service.ts`
-- (`CRON_MAX_DURATION_S`, `CUSTO_DE_UM_LOTE_MS`).
--
-- **Trocar o modelo de um agente da fase 1 obriga a rodar isto de novo.** O
-- custo típico é medição, não estimativa: com o número velho a conta de
-- `cabeNaJanela` passa a recusar (ou aceitar) a etapa errada, e o sintoma é
-- silencioso — foi assim que o Estruturador passou dias "pulado" em 11/09.
--
-- Retrato de 16/09 (7 dias, `~anthropic/claude-fable-latest` nos três que
-- decidem):
--
--   agente             p50    p90    max    n
--   seletor             61s    65s    66s    8
--   estruturador       150s   210s   267s    7
--   assembler_chooser  210s   336s   376s    7
--   blueprint (código)   8s    20s    22s   17
--   subject (4.6)        6s     7s     7s    8
--
--   fase 1 por e-mail  363s   681s  1213s   43   (14 dias)
-- ============================================================================

-- 1) Duração por agente e por MODELO. O modelo importa: a mesma linha de
--    `email_agent_configs` muda sem deploy, então agrupar só por agente
--    mistura medições de motores diferentes.
select agent, model, count(*) as runs,
       round(percentile_cont(0.5) within group (order by duration_ms) / 1000.0) as p50_s,
       round(percentile_cont(0.9) within group (order by duration_ms) / 1000.0) as p90_s,
       round(max(duration_ms) / 1000.0)                                        as max_s,
       max(created_at)::date                                                   as ultima_run
from email_generation_runs
where agent in ('seletor', 'estruturador', 'assembler_chooser', 'blueprint', 'subject')
  and status = 'success'
  and duration_ms is not null
  and created_at > now() - interval '7 days'
group by agent, model
order by agent, runs desc;

-- 2) A fase 1 INTEIRA, por e-mail. É este número que decide o `maxDuration`
--    do cron: a fase 1 não é retomável no meio, então a função precisa
--    comportar um e-mail completo.
with por_email as (
  select email_id, batch_id,
         min(created_at) as ini,
         max(created_at + (coalesce(duration_ms, 0) || ' milliseconds')::interval) as fim
  from email_generation_runs
  where agent in ('seletor', 'estruturador', 'assembler_chooser', 'assembler', 'blueprint', 'subject')
    and created_at > now() - interval '14 days'
    and email_id is not null
  group by email_id, batch_id
)
select count(*) as emails,
       round(percentile_cont(0.5) within group (order by extract(epoch from (fim - ini)))) as wall_p50_s,
       round(percentile_cont(0.9) within group (order by extract(epoch from (fim - ini)))) as wall_p90_s,
       round(max(extract(epoch from (fim - ini))))                                         as wall_max_s
from por_email;

-- 3) Por chamada do Curador (shortlist × escolha). A shortlist é pulada com
--    até 5 candidatas na posição, então o `null` aqui é informação.
select k as chamada, count(*) as n,
       round(percentile_cont(0.5) within group (order by (v ->> 'seg')::numeric)) as p50_s,
       round(percentile_cont(0.9) within group (order by (v ->> 'seg')::numeric)) as p90_s,
       max((v ->> 'seg')::numeric)                                                as max_s
from email_generation_runs r,
     lateral jsonb_each(r.parsed_output -> 'consumo_por_chamada') as e(k, v)
where r.agent = 'assembler_chooser'
  and r.created_at > now() - interval '14 days'
  and jsonb_typeof(v) = 'object'
  and (v ->> 'seg') is not null
group by k
order by max_s desc;

-- 4) O teto de tokens vigente de cada agente, com a estimativa que
--    `relogioParaTeto` deriva dele (90 tok/s + 15s de latência base).
--    Ela é o RELÓGIO, não o custo típico — e a distância entre as duas
--    colunas é o que torna o custo medido necessário.
select agent_type, model, max_tokens,
       ceil(max_tokens / 90.0) + 15 as relogio_derivado_s
from email_agent_configs
where is_active
  and agent_type in ('seletor', 'estruturador', 'assembler_chooser', 'blueprint', 'subject')
order by agent_type;

-- 5) Curador pago DUAS vezes no mesmo e-mail e mesmo batch. Separa o retry
--    legítimo (error → success) da corrida de lease, que é o que o
--    `LEASE_MS` derivado do `maxDuration` existe para impedir.
with dup as (
  select email_id, batch_id
  from email_generation_runs
  where agent = 'assembler_chooser' and email_id is not null and batch_id is not null
  group by email_id, batch_id
  having count(*) > 1
)
select r.status, count(*) as runs, round(sum(r.cost_cents) / 100.0, 2) as usd,
       min(r.created_at)::date as de, max(r.created_at)::date as ate
from email_generation_runs r
join dup on dup.email_id = r.email_id and dup.batch_id = r.batch_id
where r.agent = 'assembler_chooser'
group by r.status
order by runs desc;

-- 6) Jobs da fila: quanto duraram e como ficou a ordem dos e-mails. O job
--    b6d89e4c (24/07) tem o welcome como 2,5,8,6,4,1,3,7 — a ordem em que o
--    PostgREST devolveu, antes de `ordemDosEmails` existir.
select id, status, trigger_source, architect_total, architect_done,
       round(extract(epoch from (coalesce(dispatched_at, updated_at) - created_at))) as dur_s,
       (select string_agg(e ->> 'email_number', ',' order by ord)
        from jsonb_array_elements(emails) with ordinality as t(e, ord)
        where e ->> 'flow_type' = 'welcome')                                          as ordem_do_welcome
from email_dispatch_jobs
order by created_at desc
limit 10;
