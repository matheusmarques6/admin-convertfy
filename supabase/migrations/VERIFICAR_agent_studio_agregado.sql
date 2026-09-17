-- VERIFICAR — os agregados do Estúdio contra o dado REAL
--
-- Medido em 17/09 no batch 6c746be0 (Hero Boxers · Welcome 1), que é o
-- caso que motivou a migration 20261165:
--   image: runs_count 11 · failed_count 2 · cost_cents_total 232,1
--          duration_ms_max 288s · duration_ms_total 1495s
--   a linha representativa sozinha dizia US$ 0,254 e 137s.
--
-- 1) O agregado é da TENTATIVA, não do histórico.
--    O mesmo e-mail tem 179 runs de `image` somando todas as gerações; se
--    `runs_count` vier perto disso, a partição por batch_id caiu.
with e as (
  select distinct email_id from email_generation_runs
  where batch_id::text like '6c746be0%' and email_id is not null limit 1
)
select 'agregado da tentativa' as checagem, agent, runs_count, failed_count,
       round(cost_cents_total / 100.0, 3) as usd_total,
       round(cost_cents / 100.0, 3) as usd_da_linha_sozinha,
       duration_ms_max / 1000 as seg_max, duration_ms_total / 1000 as seg_soma,
       error_run_id is not null as aponta_a_run_que_falhou
from agent_studio_latest_runs(array(select email_id from e))
where runs_count > 1 or failed_count > 0;

-- 2) Os filhos, e o recorte por batch.
--    Sem `p_batch_id` o padrão TEM de ser a tentativa mais recente.
with e as (
  select distinct email_id from email_generation_runs
  where batch_id::text like '6c746be0%' and email_id is not null limit 1
)
select 'filhos' as checagem,
  (select count(*) from agent_studio_run_children((select email_id from e), 'image', null)) as sem_batch,
  (select count(*) from agent_studio_run_children((select email_id from e), 'image', null)
     where rotulo is null) as sem_rotulo,
  (select count(*) from agent_studio_run_children((select email_id from e), 'image', null)
     where image_url is not null) as com_miniatura;

-- 3) O bucket `qavision` e a perna da fase 1 continuam de pé.
select 'qavision' as checagem, count(*) as linhas
from agent_studio_latest_runs(array(
  select email_id from email_generation_runs
  where agent = 'qa' and coalesce((parsed_output ->> 'vision_ran')::boolean, false)
    and email_id is not null limit 5
))
where agent = 'qavision';
