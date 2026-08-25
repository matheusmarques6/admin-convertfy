-- 20261080 — agent_studio_latest_runs enxerga a fase 1 (runs batch-scoped)
--
-- Os agentes de fase 1 (assembler_chooser, assembler, blueprint, subject)
-- gravavam 100% das runs com email_id NULL — a função só filtrava por
-- email_id e essas runs NUNCA voltavam: a aba Execuções mostrava os 4 nós
-- como "pulado" mesmo com run success no banco.
--
-- O app passou a gravar email_id/flow_id nessas runs (mesmo deploy). Esta
-- migration cobre o HISTÓRICO: runs antigas com email_id NULL são casadas
-- pelo batch_id → generation_batch_id do email.
--
-- Limite conhecido (best-effort, documentado): um batch antigo pode cobrir
-- mais de um email (ex.: regeração de flow inteiro) e a run não diz de qual
-- é — nesse caso a run aparece em TODOS os emails do batch. Impreciso, mas
-- melhor que o "pulado" falso. Runs novas têm email_id exato e nunca caem
-- neste braço (o DISTINCT ON prefere a run mais recente, que é a nova).
--
-- Assinatura e shape de retorno INALTERADOS — rollback = reaplicar 20261073.

create or replace function public.agent_studio_latest_runs(p_email_ids uuid[])
returns table(
  run_id uuid,
  email_id uuid,
  agent text,
  model text,
  status text,
  tokens_input integer,
  tokens_output integer,
  cost_cents numeric,
  duration_ms integer,
  retry_count integer,
  error_message text,
  created_at timestamp with time zone
)
language sql
stable security definer
set search_path to 'public'
as $function$
  with emails as (
    select e.id as email_id, e.generation_batch_id
    from email_flow_emails e
    where e.id = any (p_email_ids)
  ),
  candidate_runs as (
    -- Runs ligadas direto ao email (fase 2 sempre; fase 1 pós-correção).
    select r.*, r.email_id as resolved_email_id
    from email_generation_runs r
    where r.email_id = any (p_email_ids)
      and r.agent <> 'component_test'

    union all

    -- Histórico da fase 1: email_id NULL, casado pelo batch do email.
    select r.*, em.email_id as resolved_email_id
    from email_generation_runs r
    join emails em
      on em.generation_batch_id is not null
     and r.batch_id = em.generation_batch_id
    where r.email_id is null
      and r.agent <> 'component_test'
  )
  select distinct on (cr.resolved_email_id, bucket.agent_bucket)
    cr.id as run_id,
    cr.resolved_email_id as email_id,
    bucket.agent_bucket as agent,
    cr.model,
    cr.status,
    cr.tokens_input,
    cr.tokens_output,
    cr.cost_cents,
    cr.duration_ms,
    cr.retry_count,
    cr.error_message,
    cr.created_at
  from candidate_runs cr
  cross join lateral (
    select case
      when cr.agent = 'qa'
        and coalesce((cr.parsed_output ->> 'vision_ran')::boolean, false)
        then 'qavision'
      else cr.agent
    end as agent_bucket
  ) bucket
  order by cr.resolved_email_id, bucket.agent_bucket, cr.created_at desc
$function$;
