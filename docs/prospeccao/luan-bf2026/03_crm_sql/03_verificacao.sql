-- 03 · Verificação. Esperado: A 75, B 119, C 106, D 108, Aguardando 23 (total 431); leads_sem_deal 0; duplicados 0.
select s."order", s.name, count(d.id) as deals
from pipeline_stages s
join pipelines p on p.id = s.pipeline_id and p.name = 'Parceiro Luan · Black Friday 2026' and not p.is_archived
left join deals d on d.stage_id = s.id
group by s."order", s.name order by s."order";

select
  (select count(*) from crm_leads where source = 'parceiro:luan-souza') as leads,
  (select count(*) from deals where source = 'parceiro:luan-souza') as deals,
  (select count(*) from crm_leads l where l.source = 'parceiro:luan-souza' and not exists (select 1 from deals d where d.lead_id = l.id)) as leads_sem_deal,
  (select count(*) from (select created_by_external from crm_leads where source = 'parceiro:luan-souza' group by 1 having count(*) > 1) z) as duplicados,
  (select count(*) from crm_custom_fields where org_id = 'd1ae3cf9-558d-40cc-9272-4a5633894ef8' and entity_type = 'deal') as campos_deal,
  (select count(*) from crm_partners where name = 'Luan Souza') as parceiro;
