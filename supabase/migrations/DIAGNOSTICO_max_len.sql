-- DIAGNÓSTICO (não é migration — rodar à mão no SQL Editor).
-- Auditoria dos `max_len` da biblioteca (09/09): o copy_fit descartou os
-- dois melhores reviews do batch 644d86c5 (`ainda_acima_do_limite`, max
-- 190) — os que tinham idade e cintura. 190 chars para um depoimento é
-- menor que as citações das referências do Figma.
--
-- 1) Campos de copy cujo max_len é menor que a mediana do EXAMPLE do mesmo
--    grupo de chave (review/quote/body/description/title): o limite está
--    abaixo do que a própria arte mostra.
with campos as (
  select v.id as variant_id, v.name, v.block_type,
         f->>'key' as key, (f->>'max_len')::int as max_len,
         length(coalesce(f->>'example','')) as example_len,
         case
           when f->>'key' ~* '(review|testimonial|quote)' then 'review'
           when f->>'key' ~* '(body|copy|description|paragraph)' then 'body'
           when f->>'key' ~* '(title|headline|subhead)' then 'title'
           else 'outro' end as grupo
  from email_component_variants v,
       jsonb_array_elements(coalesce(v.output_schema,'[]'::jsonb)) f
  where v.is_active and coalesce(f->>'type','') <> 'image'
), mediana as (
  select grupo, percentile_cont(0.5) within group (order by example_len) as med_example
  from campos where example_len > 0 group by grupo
)
select c.block_type, c.name, c.key, c.max_len, c.example_len, m.grupo, round(m.med_example) as mediana_do_grupo
from campos c join mediana m using (grupo)
where c.max_len > 0 and c.max_len < m.med_example
order by c.block_type, c.name, c.key;

-- 2) Reviews com max_len < 260 (proposta: subir para ~260 — as citações das
--    referências têm 200–260 chars com idade/contexto).
select v.name, f->>'key' as key, (f->>'max_len')::int as max_len
from email_component_variants v, jsonb_array_elements(coalesce(v.output_schema,'[]'::jsonb)) f
where v.is_active and f->>'key' ~* '(review|testimonial)_\d+_(quote|body)' and (f->>'max_len')::int < 260
order by v.name, key;

-- 3) Quanto o copy_fit descartou por limite nos últimos 14 dias, por chave.
select r.parsed_output->'de_para' as de_para
from email_generation_runs r
where r.agent = 'copy_fit' and r.created_at > now() - interval '14 days'
  and jsonb_path_exists(r.parsed_output, '$.de_para[*] ? (@.motivo == "ainda_acima_do_limite")')
order by r.created_at desc limit 20;
