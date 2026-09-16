-- Uma notificação de "onboarding travado" por pessoa e por onboarding
--
-- O incidente de set/2026 (17.611 não lidas, 15.465 com mais de 7 dias)
-- foi resolvido com `upsert_onboarding_stuck_notifications`: UPDATE
-- primeiro, INSERT só quando nenhuma linha foi tocada. A função está
-- correta e **para** de criar duplicatas — mas ela nunca consolidou as
-- que já existiam, e pior: o UPDATE alcança TODAS as cópias do par, dá
-- `ROW_COUNT = 3`, e as três seguem sendo renovadas com `created_at =
-- now()` a cada rodada do cron. Elas nunca envelhecem e nunca somem.
--
-- Medido em 16/09: 905 linhas não lidas para **307 pares** (usuário ×
-- onboarding), e **297 desses pares têm cópias gravadas no MESMO
-- instante**, ao microssegundo — a assinatura de linhas legadas sendo
-- renovadas juntas, não de uma notificação por dia. O contador de
-- retorno da função também mentia: `v_touched` somava 3 onde tocou um
-- par só.
--
-- A lição é a mesma da 20261119 (`invoices.asaas_id`) e da 20261132
-- (`client_subscriptions.source_deal_id`): **checar antes sem tratar o
-- conflito depois é o padrão que duplica**. O remédio é o índice.

-- 1) Consolida o que já existe: fica a linha MAIS RECENTE de cada par
--    (é a que tem o `days_stuck` atualizado), as outras somem.
delete from notifications n
using notifications m
where n.type = 'onboarding_stuck'
  and m.type = 'onboarding_stuck'
  and n.read = false
  and m.read = false
  and n.user_id = m.user_id
  and (n.metadata->>'onboarding_id') is not null
  and (n.metadata->>'onboarding_id') = (m.metadata->>'onboarding_id')
  and (n.created_at, n.id) < (m.created_at, m.id);

-- 2) Impede a volta. Parcial pelos dois lados: só a não lida disputa a
--    unicidade — a lida é histórico e pode repetir —, e a chave do JSONB
--    é LITERAL, que é o que permite ao índice ser usado (regra da casa
--    desde o incidente do inbox).
create unique index if not exists uniq_notifications_onboarding_stuck
  on notifications (user_id, (metadata->>'onboarding_id'))
  where type = 'onboarding_stuck' and read = false;

-- 3) A função passa a tratar o conflito em vez de só evitá-lo, e a
--    contar o par, não as cópias.
create or replace function public.upsert_onboarding_stuck_notifications(
  p_user_ids uuid[],
  p_onboarding_id uuid,
  p_title text,
  p_body text,
  p_link text,
  p_days_stuck integer
) returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_touched integer := 0;
  v_updated integer;
  uid uuid;
begin
  foreach uid in array coalesce(p_user_ids, array[]::uuid[]) loop
    update notifications
       set title = p_title,
           body = p_body,
           link = p_link,
           created_at = now(),
           metadata = coalesce(metadata, '{}'::jsonb)
                      || jsonb_build_object('days_stuck', p_days_stuck)
     where user_id = uid
       and read = false
       and type = 'onboarding_stuck'
       and (metadata->>'onboarding_id') = p_onboarding_id::text;
    get diagnostics v_updated = row_count;

    if v_updated = 0 then
      begin
        insert into notifications (user_id, title, body, type, link, metadata, read)
        values (uid, p_title, p_body, 'onboarding_stuck', p_link,
                jsonb_build_object('onboarding_id', p_onboarding_id::text,
                                   'days_stuck', p_days_stuck),
                false);
      exception when unique_violation then
        -- Outra execução do cron inseriu entre o UPDATE e o INSERT.
        -- Adotar o que passou primeiro é o padrão da casa; criar uma
        -- segunda linha seria refazer o defeito que este índice desfaz.
        update notifications
           set title = p_title, body = p_body, link = p_link, created_at = now(),
               metadata = coalesce(metadata, '{}'::jsonb)
                          || jsonb_build_object('days_stuck', p_days_stuck)
         where user_id = uid
           and read = false
           and type = 'onboarding_stuck'
           and (metadata->>'onboarding_id') = p_onboarding_id::text;
      end;
    end if;

    -- Conta o PAR, não as cópias: com linhas duplicadas o `row_count`
    -- devolvia 3 e o log do cron reportava três vezes o trabalho feito.
    v_touched := v_touched + 1;
  end loop;
  return v_touched;
end;
$function$;

-- A função nasce fechada a `anon`, como as demais RPCs desde 16/09.
revoke execute on function public.upsert_onboarding_stuck_notifications(uuid[], uuid, text, text, text, integer)
  from public, anon;
grant execute on function public.upsert_onboarding_stuck_notifications(uuid[], uuid, text, text, text, integer)
  to authenticated, service_role;

-- Verificação: `pares` e `linhas` têm de ser iguais.
-- Medido depois de aplicar em 16/09: 905 linhas → **307**, uma por par.
-- select count(*) as pares, sum(n) as linhas from (
--   select user_id, metadata->>'onboarding_id' as onb, count(*) as n
--   from notifications where type = 'onboarding_stuck' and read = false
--   group by 1, 2
-- ) g;
