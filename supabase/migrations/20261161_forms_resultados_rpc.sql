-- 20261161 — Resultados do formulário: o funil pergunta a pergunta.
--
-- APLICADA EM PRODUÇÃO em 17/09/2026 via MCP.
--
-- É UMA função e não dez consultas do PostgREST pelo mesmo motivo do
-- inbox (`crm_inbox_list_threads`): a tela precisa de contagem por
-- pergunta, por status e por classe de abandono, e cada uma pelo
-- PostgREST seria uma varredura. Aqui é um passe por `form_sessions` e
-- um por `form_session_events`.
--
-- Os predicados são LITERAIS dentro da função — índice parcial não serve
-- query parametrizada (a lição do seq scan de 916 ms no inbox).
--
-- O que a tela lê disto: `viram` menos `responderam`, por pergunta, é a
-- pergunta que faz desistir. É o número que o módulo inteiro existe para
-- produzir.

create or replace function public.form_funnel_stats(
  p_form_id uuid,
  p_desde timestamptz default null,
  p_ate timestamptz default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with janela as (
  select
    coalesce(p_desde, now() - interval '30 days') as inicio,
    coalesce(p_ate, now()) as fim
),
s as (
  select fs.*
  from form_sessions fs, janela j
  where fs.form_id = p_form_id
    and fs.viewed_at >= j.inicio
    and fs.viewed_at <= j.fim
),
totais as (
  select
    count(*)::int as visitas,
    count(*) filter (where status <> 'viewed')::int as comecaram,
    count(*) filter (where contact_captured_at is not null)::int as deram_contato,
    count(*) filter (where completed_at is not null and status = 'completed')::int as concluiram,
    count(*) filter (where status = 'disqualified')::int as desqualificados,
    count(*) filter (where status = 'abandoned')::int as abandonaram,
    count(*) filter (where status = 'abandoned' and contact_captured_at is not null)::int as abandono_com_contato,
    count(*) filter (where recovered)::int as recuperados,
    count(*) filter (where lead_id is not null)::int as viraram_lead,
    -- Mediana do tempo até concluir. A média é distorcida pela aba que
    -- fica aberta a tarde inteira.
    coalesce(
      percentile_cont(0.5) within group (
        order by extract(epoch from (completed_at - viewed_at))
      ) filter (where completed_at is not null),
      0
    )::int as mediana_segundos
  from s
),
vistas as (
  select e.field_ref, count(distinct e.session_id)::int as viram
  from form_session_events e
  join s on s.id = e.session_id
  where e.type = 'viewed_field' and e.field_ref is not null
  group by e.field_ref
),
respondidas as (
  select e.field_ref, count(distinct e.session_id)::int as responderam
  from form_session_events e
  join s on s.id = e.session_id
  where e.type = 'answered' and e.field_ref is not null
  group by e.field_ref
),
tempos as (
  select
    e.field_ref,
    percentile_cont(0.5) within group (
      order by (e.payload->>'ms')::numeric
    )::int as mediana_ms
  from form_session_events e
  join s on s.id = e.session_id
  where e.type = 'answered' and e.field_ref is not null
    and e.payload ? 'ms'
  group by e.field_ref
),
por_pergunta as (
  select coalesce(v.field_ref, r.field_ref) as field_ref,
         coalesce(v.viram, 0) as viram,
         coalesce(r.responderam, 0) as responderam,
         t.mediana_ms
  from vistas v
  full outer join respondidas r on r.field_ref = v.field_ref
  left join tempos t on t.field_ref = coalesce(v.field_ref, r.field_ref)
),
-- Onde as pessoas pararam de fato, pela coluna da sessão. É a leitura
-- que sobrevive quando o evento não chegou (aba fechada antes do lote).
paradas as (
  select coalesce(abandoned_field_ref, current_field_ref) as field_ref, count(*)::int as pararam
  from s
  where completed_at is null
    and coalesce(abandoned_field_ref, current_field_ref) is not null
  group by 1
)
select jsonb_build_object(
  'janela', (select jsonb_build_object('inicio', inicio, 'fim', fim) from janela),
  'totais', (select to_jsonb(t) from totais t),
  'por_pergunta', coalesce(
    (select jsonb_agg(jsonb_build_object(
        'field_ref', p.field_ref,
        'viram', p.viram,
        'responderam', p.responderam,
        'mediana_ms', p.mediana_ms,
        'pararam', coalesce(pa.pararam, 0)
      ))
     from por_pergunta p
     left join paradas pa on pa.field_ref = p.field_ref),
    '[]'::jsonb
  ),
  'paradas_sem_evento', coalesce(
    (select jsonb_agg(jsonb_build_object('field_ref', field_ref, 'pararam', pararam))
     from paradas
     where field_ref not in (select field_ref from por_pergunta where field_ref is not null)),
    '[]'::jsonb
  )
);
$$;

-- `security definer` porque a tela chama com a chave do usuário e as
-- tabelas são fechadas por org; o `p_form_id` é o escopo, e quem não
-- pode ver o formulário não chega aqui (a rota valida antes). `anon` não
-- executa: a RPC devolveria o funil de qualquer formulário a quem tiver
-- a chave pública do browser.
revoke all on function public.form_funnel_stats(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.form_funnel_stats(uuid, timestamptz, timestamptz) to authenticated, service_role;
