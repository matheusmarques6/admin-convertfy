-- Resumo por formulário para a LISTA: visitas, envios e negócios da
-- janela (30 dias por padrão) e da janela anterior, num statement só.
--
-- A lista antiga mostrava `views_count`/`submissions_count`, contadores
-- de vida inteira — um formulário parado há seis meses aparecia com os
-- mesmos números de um que recebe verba hoje. O que a tela precisa é o
-- período, e período por formulário no PostgREST seria N+1 consultas
-- (é a regra do inbox: contagem em caminho quente nunca pelo PostgREST).
--
-- `registra_visitas` diz se o formulário GRAVA sessão. Só o formato
-- conversacional grava (`form_sessions`); o clássico só tem o contador
-- de vida inteira. Sem esse booleano a lista mostraria "0 visitas" para
-- a Página de vendas, que tem 467 — zero por não medir é o erro que o
-- dashboard já pagou. A tela usa isto para dizer "—" em vez de 0.
--
-- SECURITY DEFINER com o MESMO escopo de `form_funnel_stats` (20261163):
-- membro da org ou service_role; o usuário do portal é `authenticated`
-- e NÃO passa. Idempotente.

create or replace function public.crm_forms_resumo(
  p_org uuid,
  p_dias integer default 30
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := auth.role();
  v_dias integer := greatest(1, least(coalesce(p_dias, 30), 365));
  v_inicio timestamptz := now() - make_interval(days => v_dias);
  v_inicio_anterior timestamptz := now() - make_interval(days => v_dias * 2);
  v_out jsonb;
begin
  if coalesce(v_role, '') <> 'service_role' then
    if not exists (
      select 1 from org_members m
      where m.org_id = p_org and m.profile_id = auth.uid()
    ) then
      return '[]'::jsonb;
    end if;
  end if;

  with f as (
    select id from crm_forms where org_id = p_org
  ),
  sess as (
    select s.form_id,
           count(*) filter (where s.viewed_at >= v_inicio)::int as visitas,
           count(*) filter (where s.viewed_at >= v_inicio_anterior and s.viewed_at < v_inicio)::int as visitas_anterior,
           count(*)::int as sessoes_total
    from form_sessions s join f on f.id = s.form_id
    group by s.form_id
  ),
  subs as (
    select x.form_id,
           count(*) filter (where x.created_at >= v_inicio)::int as envios,
           count(*) filter (where x.created_at >= v_inicio_anterior and x.created_at < v_inicio)::int as envios_anterior,
           count(*) filter (where x.created_at >= v_inicio and x.deal_id is not null)::int as deals,
           count(*) filter (where x.created_at >= v_inicio_anterior and x.created_at < v_inicio and x.deal_id is not null)::int as deals_anterior
    from crm_form_submissions x join f on f.id = x.form_id
    group by x.form_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'form_id', f.id,
    'registra_visitas', coalesce(sess.sessoes_total, 0) > 0,
    'visitas', coalesce(sess.visitas, 0),
    'visitas_anterior', coalesce(sess.visitas_anterior, 0),
    'envios', coalesce(subs.envios, 0),
    'envios_anterior', coalesce(subs.envios_anterior, 0),
    'deals', coalesce(subs.deals, 0),
    'deals_anterior', coalesce(subs.deals_anterior, 0)
  )), '[]'::jsonb)
  into v_out
  from f
  left join sess on sess.form_id = f.id
  left join subs on subs.form_id = f.id;

  return v_out;
end;
$$;

comment on function public.crm_forms_resumo(uuid, integer) is
  'Visitas/envios/negócios por formulário na janela e na anterior, para a lista. SECURITY DEFINER com escopo por org (membro ou service_role).';

revoke execute on function public.crm_forms_resumo(uuid, integer) from public, anon;
grant execute on function public.crm_forms_resumo(uuid, integer) to authenticated, service_role;
