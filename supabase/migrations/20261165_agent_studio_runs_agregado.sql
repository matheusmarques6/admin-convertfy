-- 20261165 — a linha representativa passa a carregar a SOMA da tentativa
--
-- ── O defeito medido (17/09) ──────────────────────────────────────────
--
-- `agent_studio_latest_runs` faz DISTINCT ON (email, bucket): UMA run por
-- agente. Mas o agente de imagem grava uma run POR CAMPO. No batch
-- 6c746be0 (Hero Boxers · Welcome 1) havia 11 runs de `image` somando
-- US$ 2,321 e 1.495s — e a aba Execuções mostrava US$ 0,254 e 137s, que é
-- o da última. Em 14 dias: 180 de 210 runs invisíveis (86%), US$ 39,78 de
-- US$ 46,38, e SEIS falhas de geração de imagem que nunca apareceram em
-- tela nenhuma.
--
-- Como `AgentExecution.cost_cents` soma essas runs visíveis, o custo total
-- da execução estava ~US$ 2 abaixo do real em toda peça com imagem.
--
-- ── O que muda, e o que NÃO muda ──────────────────────────────────────
--
-- O DISTINCT ON FICA. Ele existe pelo motivo bom (um e-mail regenerado 439
-- vezes perdia a run de um agente pro corte global) e a linha escolhida é
-- a mesma de antes. O que muda é que ela passa a carregar a soma da
-- própria tentativa em vez de fingir que era a única.
--
-- A partição do agregado é (email, bucket, BATCH_ID), com o batch_id vindo
-- da PRÓPRIA run — não do e-mail. É isso que impede o histórico de 439
-- gerações de virar "esta execução custou US$ 900": o agregado é da
-- TENTATIVA. E como a partição sai da run escolhida, a perna `union all`
-- da fase 1 (email_id NULL casado pelo batch) continua funcionando sem
-- premissa nova sobre generation_batch_id.
--
-- `error_run_id` / `error_message_first` não são enfeite: com a linha
-- representativa `success` e failed_count = 1, o nó pintaria VERDE
-- escondendo a imagem quebrada — que é exatamente o defeito das 6 falhas
-- invisíveis. Eles apontam o nó para a run que falhou.
--
-- NOTA: batch_id nulo cairia todo numa partição só. Na prática não pega —
-- a fase 2 sempre tem batch (vem do generation_batch_id do e-mail) e a
-- perna da fase 1 é batch-casada por construção. Não "otimizar" a
-- partição tirando o batch_id.
--
-- `create or replace` NÃO aceita mudança no `returns table`, então é
-- drop+create — e o drop APAGA OS GRANTS (20261073:69-72), que por isso
-- são repetidos no fim. Sem eles a aba morre com `permission denied` em
-- produção e não em teste.
--
-- Segundo consumidor da mesma função: `conformidade.service.ts`. Colunas
-- novas são compatíveis (ele lê por nome), mas os dois vão no mesmo deploy.

drop function if exists public.agent_studio_latest_runs(uuid[]);

create function public.agent_studio_latest_runs(p_email_ids uuid[])
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
  created_at timestamp with time zone,
  batch_id uuid,
  runs_count integer,
  failed_count integer,
  cost_cents_total numeric,
  tokens_input_total bigint,
  tokens_output_total bigint,
  duration_ms_max integer,
  duration_ms_total bigint,
  error_run_id uuid,
  error_message_first text
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
  ),
  com_bucket as (
    select cr.*, bucket.agent_bucket
    from candidate_runs cr
    cross join lateral (
      select case
        when cr.agent = 'qa'
          and coalesce((cr.parsed_output ->> 'vision_ran')::boolean, false)
          then 'qavision'
        else cr.agent
      end as agent_bucket
    ) bucket
  ),
  agregado as (
    select
      cb.*,
      count(*) over w as w_runs_count,
      count(*) filter (where cb.status = 'error') over w as w_failed_count,
      sum(coalesce(cb.cost_cents, 0)) over w as w_cost_total,
      sum(coalesce(cb.tokens_input, 0)) over w as w_tokens_in_total,
      sum(coalesce(cb.tokens_output, 0)) over w as w_tokens_out_total,
      max(coalesce(cb.duration_ms, 0)) over w as w_duration_max,
      sum(coalesce(cb.duration_ms, 0)) over w as w_duration_total,
      -- A PRIMEIRA run com erro da tentativa (e não a última run qualquer):
      -- é para ela que o nó aponta quando failed_count > 0.
      --
      -- `array_agg ... filter` e não `first_value ... filter`: FILTER só é
      -- implementado para window functions AGREGADAS (0A000). A ordem vem
      -- do frame `w_err`, que é ordenado e unbounded dos dois lados.
      (array_agg(cb.id) filter (where cb.status = 'error') over w_err)[1] as w_error_run_id,
      (array_agg(cb.error_message) filter (where cb.status = 'error') over w_err)[1] as w_error_message
    from com_bucket cb
    window
      w as (partition by cb.resolved_email_id, cb.agent_bucket, cb.batch_id),
      w_err as (
        partition by cb.resolved_email_id, cb.agent_bucket, cb.batch_id
        order by cb.created_at asc
        rows between unbounded preceding and unbounded following
      )
  )
  select distinct on (a.resolved_email_id, a.agent_bucket)
    a.id as run_id,
    a.resolved_email_id as email_id,
    a.agent_bucket as agent,
    a.model,
    a.status,
    a.tokens_input,
    a.tokens_output,
    a.cost_cents,
    a.duration_ms,
    a.retry_count,
    a.error_message,
    a.created_at,
    a.batch_id,
    a.w_runs_count::integer as runs_count,
    a.w_failed_count::integer as failed_count,
    a.w_cost_total as cost_cents_total,
    a.w_tokens_in_total as tokens_input_total,
    a.w_tokens_out_total as tokens_output_total,
    a.w_duration_max::integer as duration_ms_max,
    a.w_duration_total as duration_ms_total,
    a.w_error_run_id as error_run_id,
    a.w_error_message as error_message_first
  from agregado a
  order by a.resolved_email_id, a.agent_bucket, a.created_at desc
$function$;

revoke all on function public.agent_studio_latest_runs(uuid[]) from public;
revoke all on function public.agent_studio_latest_runs(uuid[]) from anon;
revoke all on function public.agent_studio_latest_runs(uuid[]) from authenticated;
grant execute on function public.agent_studio_latest_runs(uuid[]) to service_role;


-- ── Os FILHOS de um nó, sob demanda ───────────────────────────────────
--
-- Só é chamada quando o operador abre o leque de um nó. Fica fora da
-- listagem de propósito: o SSE da aba roda de 2 em 2 segundos e a
-- arquitetura inteira foi desenhada para que uma conexão ociosa custe duas
-- varreduras de índice e zero byte no cliente (agent-executions.service).
-- Trazer 180 filhos em todo evento, para um nó que talvez ninguém clique,
-- é o padrão que custou 372 min de CPU no incidente do inbox.
--
-- O rótulo é derivado NO BANCO para o parsed_output nunca cruzar a rede
-- inteiro (o do assembler_chooser tem 41 KB). Cobre os três tipos de run
-- `image` que o runner grava: slot (fieldKey), avatar de depoimento (que
-- NÃO tem fieldKey) e a `skipped` única do agente desligado.

create or replace function public.agent_studio_run_children(
  p_email_id uuid,
  p_agent text,
  p_batch_id uuid default null
)
returns table(
  run_id uuid,
  agent text,
  status text,
  model text,
  created_at timestamp with time zone,
  duration_ms integer,
  cost_cents numeric,
  tokens_input integer,
  tokens_output integer,
  retry_count integer,
  error_message text,
  rotulo text,
  sub_rotulo text,
  image_url text
)
language sql
stable security definer
set search_path to 'public'
as $function$
  with emails as (
    select e.id as email_id, e.generation_batch_id
    from email_flow_emails e
    where e.id = p_email_id
  ),
  candidate_runs as (
    select r.*
    from email_generation_runs r
    where r.email_id = p_email_id
      and r.agent <> 'component_test'

    union all

    select r.*
    from email_generation_runs r
    join emails em
      on em.generation_batch_id is not null
     and r.batch_id = em.generation_batch_id
    where r.email_id is null
      and r.agent <> 'component_test'
  ),
  com_bucket as (
    select cr.*, bucket.agent_bucket
    from candidate_runs cr
    cross join lateral (
      select case
        when cr.agent = 'qa'
          and coalesce((cr.parsed_output ->> 'vision_ran')::boolean, false)
          then 'qavision'
        else cr.agent
      end as agent_bucket
    ) bucket
    where bucket.agent_bucket = p_agent
  ),
  -- Sem batch explícito, o padrão é o da TENTATIVA mais recente — nunca o
  -- histórico. Medido no e-mail da Hero Boxers: sem este recorte a função
  -- devolvia 179 runs de `image` (todas as gerações) em vez das 11 da
  -- geração corrente. É o mesmo defeito que a partição do agregado existe
  -- para impedir, entrando pela porta dos filhos.
  alvo as (
    select coalesce(
      p_batch_id,
      (select cb.batch_id from com_bucket cb order by cb.created_at desc limit 1)
    ) as batch_id
  )
  select
    cr.id as run_id,
    cr.agent,
    cr.status,
    cr.model,
    cr.created_at,
    cr.duration_ms,
    cr.cost_cents,
    cr.tokens_input,
    cr.tokens_output,
    cr.retry_count,
    cr.error_message,
    coalesce(
      nullif(cr.parsed_output ->> 'fieldKey', ''),
      case
        when cr.parsed_output ->> 'kind' = 'testimonial_avatar'
          then 'avatar ' || coalesce(cr.parsed_output ->> 'itemIndex', '?')
        else null
      end,
      nullif(cr.parsed_output ->> 'blockId', ''),
      cr.agent
    ) as rotulo,
    coalesce(
      nullif(cr.parsed_output ->> 'role', ''),
      nullif(cr.parsed_output ->> 'groupKey', ''),
      nullif(cr.parsed_output ->> 'skip_reason', '')
    ) as sub_rotulo,
    nullif(cr.parsed_output ->> 'imageUrl', '') as image_url
  from com_bucket cr
  cross join alvo a
  where cr.batch_id is not distinct from a.batch_id
  order by cr.created_at asc
$function$;

revoke all on function public.agent_studio_run_children(uuid, text, uuid) from public;
revoke all on function public.agent_studio_run_children(uuid, text, uuid) from anon;
revoke all on function public.agent_studio_run_children(uuid, text, uuid) from authenticated;
grant execute on function public.agent_studio_run_children(uuid, text, uuid) to service_role;
