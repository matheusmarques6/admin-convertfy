-- DIAGNÓSTICO — leitura semanal do validador TEXTUAL do contrato (14/09).
-- Só leitura. Roda enquanto `contrato_textual = 'shadow'`: diz quantas
-- gerações teriam sido reprovadas se o gate estivesse em `on`, e por quê.
-- Ligar o gate é decisão de quem lê isto, não de código.

-- 1) Runs `copy` dos últimos 7 dias com o validador ligado, por desfecho.
select
  date_trunc('day', r.created_at) as dia,
  r.parsed_output->'_contrato'->>'modo' as modo,
  (r.parsed_output->'_contrato'->>'decisao_presente')::boolean as decisao_presente,
  count(*) as runs,
  count(*) filter (where (r.parsed_output->'_contrato'->>'ok')::boolean = false) as teriam_reprovado,
  count(*) filter (where jsonb_array_length(coalesce(r.parsed_output->'_contrato'->'violacoes', '[]'::jsonb)) > 0) as com_violacao
from email_generation_runs r
where r.agent = 'copy'
  and r.created_at > now() - interval '7 days'
  and r.parsed_output ? '_contrato'
group by 1, 2, 3
order by 1 desc, 2;

-- 2) Violações por tipo e campo (o que o n8n mais erra).
select
  v->>'tipo' as tipo,
  v->>'severidade' as severidade,
  v->>'campo' as campo,
  count(*) as ocorrencias,
  min(left(v->>'evidencia', 60)) as exemplo
from email_generation_runs r
cross join lateral jsonb_array_elements(coalesce(r.parsed_output->'_contrato'->'violacoes', '[]'::jsonb)) v
where r.agent = 'copy'
  and r.created_at > now() - interval '7 days'
group by 1, 2, 3
order by ocorrencias desc;

-- 3) Issues `contrato_*` no HTML final (qa_issues), por tipo — o que
--    sobreviveu ao merge e à formatação.
select
  i->>'type' as tipo,
  i->>'severity' as severidade,
  count(*) as emails
from email_flow_emails e
cross join lateral jsonb_array_elements(coalesce(e.qa_issues, '[]'::jsonb)) i
where e.updated_at > now() - interval '7 days'
  and i->>'type' like 'contrato_%'
group by 1, 2
order by emails desc;

-- 4) E-mails já reprovados pelo gate em `on` (deve ser 0 enquanto shadow).
select id, store_id, failure_reason, failed_at
from email_flow_emails
where failure_reason = 'copy_contrato'
order by failed_at desc
limit 50;
