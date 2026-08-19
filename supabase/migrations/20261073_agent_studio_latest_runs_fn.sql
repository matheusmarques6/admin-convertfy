-- =============================================================
-- Estúdio de Agentes — última run por agente, por email (ago/2026)
--
-- A aba Execuções (`GET /api/admin/agents/executions`) projeta no canvas
-- a run MAIS RECENTE de cada agente de um email. Fazer isso via PostgREST
-- exigia puxar todas as runs dos emails listados com um teto global
-- (4.000 linhas) e agrupar em JS — e um email regenerado muitas vezes
-- (caso real: 439 runs num único email) pode empurrar a última run de um
-- agente antigo pra fora do teto, mostrando o nó como "pulado" à toa.
--
-- Esta função resolve no banco com DISTINCT ON, usando o índice
-- idx_gen_runs_email (email_id, created_at DESC). QA Vision é derivado
-- igual à view v_email_generation_logs: agent='qa' + vision_ran=true no
-- parsed_output — vira bucket 'qavision' já aqui, pra run de QA "normal"
-- e a de vision não se atropelarem no DISTINCT.
--
-- SECURITY: definer + search_path fixo; execução restrita a
-- service_role (a rota usa createAdminClient — nenhum papel anônimo
-- ou autenticado chama isso direto).
-- =============================================================

create or replace function public.agent_studio_latest_runs(p_email_ids uuid[])
returns table (
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
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (r.email_id, bucket.agent_bucket)
    r.id as run_id,
    r.email_id,
    bucket.agent_bucket as agent,
    r.model,
    r.status,
    r.tokens_input,
    r.tokens_output,
    r.cost_cents,
    r.duration_ms,
    r.retry_count,
    r.error_message,
    r.created_at
  from email_generation_runs r
  cross join lateral (
    select case
      when r.agent = 'qa'
        and coalesce((r.parsed_output ->> 'vision_ran')::boolean, false)
        then 'qavision'
      else r.agent
    end as agent_bucket
  ) bucket
  where r.email_id = any (p_email_ids)
    and r.agent <> 'component_test'
  order by r.email_id, bucket.agent_bucket, r.created_at desc
$$;

revoke all on function public.agent_studio_latest_runs(uuid[]) from public;
revoke all on function public.agent_studio_latest_runs(uuid[]) from anon;
revoke all on function public.agent_studio_latest_runs(uuid[]) from authenticated;
grant execute on function public.agent_studio_latest_runs(uuid[]) to service_role;
