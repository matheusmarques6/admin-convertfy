-- O escopo da RPC do funil passa a ler o papel como a plataforma lê.
--
-- A versão anterior (20261162) lia SÓ `current_setting('request.jwt.claim.role')`
-- — a GUC por claim, que o PostgREST ≥ 11 só popula com `db-use-legacy-gucs`
-- ligado. O `auth.role()` do próprio Supabase faz `coalesce` entre ela e o
-- `request.jwt.claims` em JSON justamente porque a primeira pode sumir.
--
-- O modo de falha, se ela sumir, é o pior possível: o papel vira NULL, a
-- checagem cai no ramo de membro, `auth.uid()` também é NULL para a chave de
-- serviço, e a função devolve NULL. A aba Resultados ficaria VAZIA para
-- sempre, sem erro em lugar nenhum — o `data: null, error: null` do
-- PostgREST não distingue "não autorizado" de "nenhuma sessão ainda".
--
-- `auth.role()` é a MESMA fonte que o `auth.uid()` usado logo abaixo, então
-- as duas metades da checagem passam a concordar por construção.
--
-- Idempotente: só substitui o corpo da função.

create or replace function public.form_funnel_stats(
  p_form_id uuid,
  p_desde timestamptz default null,
  p_ate timestamptz default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_role text := auth.role();
  v_resultado jsonb;
begin
  select org_id into v_org from crm_forms where id = p_form_id;
  if v_org is null then
    return null;
  end if;

  -- `security definer` roda como o dono, então a RLS não protege nada aqui
  -- dentro: quem escopa é esta checagem. O usuário do PORTAL também é
  -- `authenticated` — por isso a régua é ser membro da org, não estar logado.
  if coalesce(v_role, '') <> 'service_role' then
    if not exists (
      select 1 from org_members m
      where m.org_id = v_org and m.profile_id = auth.uid()
    ) then
      return null;
    end if;
  end if;

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
    from form_session_events e join s on s.id = e.session_id
    where e.type = 'viewed_field' and e.field_ref is not null
    group by e.field_ref
  ),
  respondidas as (
    select e.field_ref, count(distinct e.session_id)::int as responderam
    from form_session_events e join s on s.id = e.session_id
    where e.type = 'answered' and e.field_ref is not null
    group by e.field_ref
  ),
  tempos as (
    select e.field_ref,
           percentile_cont(0.5) within group (order by (e.payload->>'ms')::numeric)::int as mediana_ms
    from form_session_events e join s on s.id = e.session_id
    where e.type = 'answered' and e.field_ref is not null and e.payload ? 'ms'
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
          'field_ref', p.field_ref, 'viram', p.viram, 'responderam', p.responderam,
          'mediana_ms', p.mediana_ms, 'pararam', coalesce(pa.pararam, 0)))
       from por_pergunta p left join paradas pa on pa.field_ref = p.field_ref),
      '[]'::jsonb),
    'paradas_sem_evento', coalesce(
      (select jsonb_agg(jsonb_build_object('field_ref', field_ref, 'pararam', pararam))
       from paradas where field_ref not in (select field_ref from por_pergunta where field_ref is not null)),
      '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$$;

comment on function public.form_funnel_stats(uuid, timestamptz, timestamptz) is
  'Funil do formulário por pergunta. SECURITY DEFINER com escopo por org lido de auth.role()/auth.uid() — o usuário do portal é authenticated e NÃO passa.';
