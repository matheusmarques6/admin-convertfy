-- 20261162 — A RPC do funil checa a org POR DENTRO.
--
-- APLICADA EM PRODUÇÃO em 17/09/2026 via MCP. Substitui a versão da
-- 20261161 (que fica no repo como o estado anterior).
--
-- `security definer` + `grant execute to authenticated` deixava qualquer
-- autenticado ler o funil de QUALQUER formulário pelo /rest/v1 — e
-- "autenticado" inclui os usuários do portal do cliente, os mesmos 3 que
-- o round 5A fechou nas tabelas. Revogar de `anon` não bastava: a régua é
-- ser membro da org do formulário, não "ter sessão".
--
-- O `service_role` passa direto porque é a rota do admin chamando, e ela
-- já validou o acesso antes (org_members do usuário × org do form). Sem a
-- exceção, a própria tela pararia de funcionar.
--
-- Recusa devolve `null` em vez de erro: quem sondar form_id alheio não
-- descobre se ele existe.
--
-- Provado em produção nos três papéis: service_role recebe, membro da org
-- recebe, usuário do portal NÃO recebe.

create or replace function public.form_funnel_stats(
  p_form_id uuid,
  p_desde timestamptz default null,
  p_ate timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_role text := current_setting('request.jwt.claim.role', true);
  v_resultado jsonb;
begin
  select org_id into v_org from crm_forms where id = p_form_id;
  if v_org is null then
    return null;
  end if;

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
      -- Mediana, não média: a aba que fica aberta a tarde inteira
      -- distorce a média do tempo até concluir.
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
  -- Onde pararam pela COLUNA da sessão: é a leitura que sobrevive quando
  -- o evento não chegou (aba fechada antes do lote sair).
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

revoke all on function public.form_funnel_stats(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.form_funnel_stats(uuid, timestamptz, timestamptz) to authenticated, service_role;
