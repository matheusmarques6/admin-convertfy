-- DIAGNÓSTICO — Semana 2 do plano de set/2026 (Passos 11, 13, 14, 15, 16) + Passo 19
-- Leitura pós-deploy. Cada bloco responde a uma pergunta do "ficou correto se".
-- Rodar um bloco por vez no SQL Editor (o MCP devolve só o ÚLTIMO statement).

-- ── Passo 11 · resgate e lacuna de biblioteca ───────────────────────────
-- E-mails reprovados na fase 1 por lacuna, com o dispositivo pedido.
select e.id as email_id, e.failure_reason, e.failed_at,
       r.parsed_output->'posicoes_sem_variante' as posicoes_sem_variante,
       r.parsed_output->'resgates' as resgates
from email_flow_emails e
join lateral (
  select parsed_output from email_generation_runs
  where email_id = e.id and agent = 'assembler' order by created_at desc limit 1
) r on true
where e.failure_reason = 'lacuna_biblioteca'
order by e.failed_at desc limit 50;

-- Propostas de lacuna que nasceram com UMA ocorrência (limiar 1).
select chave, violacao, secao, ocorrencias, status, primeira_vez, ultima_vez
from vault_propostas
where violacao = 'lacuna_biblioteca'
order by ultima_vez desc;

-- Resgates que recusaram variante de dispositivo descartado (últimos 7 dias).
select created_at, store_id, email_id,
       parsed_output->'resgates'->>'recusados_por_dispositivo' as recusados,
       parsed_output->'resgates'->>'tentados' as tentados
from email_generation_runs
where agent = 'assembler' and created_at > now() - interval '7 days'
  and (parsed_output->'resgates'->>'recusados_por_dispositivo')::int > 0
order by created_at desc;

-- ── Passo 15 · QA com a decisão ─────────────────────────────────────────
-- Claims do LLM filtradas por cobertura da decisão.
select created_at, email_id,
       jsonb_array_length(coalesce(parsed_output->'claims_filtrados','[]'::jsonb)) as filtradas,
       parsed_output->'claims_filtrados' as detalhe
from email_generation_runs
where agent = 'qa' and created_at > now() - interval '7 days'
  and jsonb_array_length(coalesce(parsed_output->'claims_filtrados','[]'::jsonb)) > 0
order by created_at desc;

-- Issues sem dono (deve ser ZERO depois do deploy).
select e.id, i->>'type' as tipo, i->>'severity' as sev
from email_flow_emails e, jsonb_array_elements(coalesce(e.qa_issues,'[]'::jsonb)) i
where e.updated_at > now() - interval '7 days' and (i->>'no_responsavel') is null
limit 50;

-- Issues por dono (7 dias).
select i->>'no_responsavel' as dono, i->>'type' as tipo, count(*)
from email_flow_emails e, jsonb_array_elements(coalesce(e.qa_issues,'[]'::jsonb)) i
where e.updated_at > now() - interval '7 days'
group by 1, 2 order by 3 desc;

-- ── Passo 14 · Cores & Botões ───────────────────────────────────────────
-- Divergência contrato × heurística (é o teste de regressão do "não viu body-3").
select created_at, email_id,
       parsed_output->'cta_inventario_divergente' as divergentes,
       parsed_output->'ajustes_de_cor' as ajustes,
       parsed_output->'plano_descartes' as descartes,
       parsed_output->>'fallback' as fallback
from email_generation_runs
where agent = 'color_format' and created_at > now() - interval '7 days'
order by created_at desc limit 30;

-- Tokens de entrada do color_format ANTES × DEPOIS da retirada da pesquisa
-- (esperado ~30% menor).
select date_trunc('day', created_at) as dia, avg(tokens_input)::int as tokens_input_medio, count(*)
from email_generation_runs
where agent = 'color_format' and model <> 'deterministic' and created_at > now() - interval '30 days'
group by 1 order by 1;

-- line-height corrigidos pelo pós-processador (run lint_envio).
select created_at, email_id, a->>'id' as fix, (a->>'n')::int as n
from email_generation_runs r, jsonb_array_elements(coalesce(r.parsed_output->'aplicados','[]'::jsonb)) a
where r.agent = 'lint_envio' and r.created_at > now() - interval '7 days' and a->>'id' = 'line_height_corrigido'
order by created_at desc;

-- ── Passo 13 · payload do n8n ───────────────────────────────────────────
-- Exemplos removidos pela régua de claims no dispatch.
select created_at, store_id,
       parsed_output->'exemplos_removidos' as exemplos_removidos,
       parsed_output->>'payload_version' as payload_version
from email_generation_runs
where agent = 'copy_dispatch' and created_at > now() - interval '7 days'
order by created_at desc limit 20;

-- O n8n já ecoa copy_prompt_version? (avisos = flow anterior ao v3.2)
select created_at, email_id, parsed_output->>'copy_prompt_version' as versao, parsed_output->'avisos' as avisos
from email_generation_runs
where agent = 'copy' and created_at > now() - interval '7 days'
order by created_at desc limit 30;

-- copy_fit: nada mais inventado; comparativas que foram ao modelo.
select created_at, email_id,
       parsed_output->>'com_ausente' as com_ausente,
       parsed_output->'por_codigo' as por_codigo
from email_generation_runs
where agent = 'copy_fit' and created_at > now() - interval '7 days'
order by created_at desc limit 30;

-- ── Passo 16 · cupom e políticas ────────────────────────────────────────
-- Notas de cupom na run qa (sem token = cupom_nao_conferido).
select created_at, email_id, parsed_output->'notas' as notas
from email_generation_runs
where agent = 'qa' and created_at > now() - interval '7 days' and parsed_output ? 'notas'
order by created_at desc limit 30;

-- Políticas capturadas por loja.
select id, store_name, store_url,
       politicas->'troca'->>'dias' as troca_dias,
       politicas->'frete'->>'gratis' as frete_gratis,
       politicas->'frete'->>'prazo' as frete_prazo,
       politicas->>'fonte' as fonte,
       politicas->>'capturado_em' as capturado_em,
       jsonb_array_length(coalesce(politicas->'erros','[]'::jsonb)) as erros
from client_stores
where politicas is not null
order by capturado_em desc;

-- Insumos de política chegando ao Seletor.
select created_at, store_id, email_id,
       parsed_output->'_seletor'->>'insumos_de_politica' as insumos_de_politica
from email_generation_runs
where agent = 'seletor' and created_at > now() - interval '7 days'
  and (parsed_output->'_seletor'->>'insumos_de_politica')::int > 0
order by created_at desc;

-- ── Passo 19 · o dispositivo pedido virou filtro (15/09) ────────────────
-- Candidatas fora por serem de OUTRA forma, e posições que caíram por isso.
-- `fora_do_dispositivo` alto com `dispositivo_indisponivel` em ZERO é o
-- esperado: o filtro trabalhou e ainda havia a forma pedida na seção.
select r.batch_id, r.email_id, r.created_at,
       r.parsed_output->'resgates'->>'tentados'                 as tentados,
       r.parsed_output->'resgates'->>'fora_do_dispositivo'      as fora_do_dispositivo,
       r.parsed_output->'resgates'->>'recusados_por_dispositivo' as recusados_por_descarte,
       r.parsed_output->'resgates'->>'dispositivo_indisponivel' as caiu_por_falta_da_forma
from email_generation_runs r
where r.agent = 'assembler' and r.status = 'success'
  and r.created_at > now() - interval '14 days'
  and coalesce(r.parsed_output->'resgates'->>'fora_do_dispositivo', '0') <> '0'
order by r.created_at desc limit 50;

-- A lacuna NOMEADA: qual dispositivo a decisão pediu e a biblioteca não tem.
-- Cada linha aqui é um pedido de cadastro (Componentes → Gerar anatomia).
select p->>'section' as secao, p->>'dispositivo_pedido' as dispositivo_pedido,
       count(*) as posicoes, max(r.created_at) as ultima_vez
from email_generation_runs r,
     lateral jsonb_array_elements(coalesce(r.parsed_output->'posicoes_sem_variante','[]'::jsonb)) p
where r.agent = 'assembler'
  and p->>'motivo' = 'dispositivo_indisponivel'
  and r.created_at > now() - interval '30 days'
group by 1, 2 order by posicoes desc;

-- Cobertura da biblioteca por seção — é o que decide se o filtro pode
-- derrubar uma posição. `sem_dispositivo` > 0 é cadastro pendente da B3:
-- essas variantes passam pelo filtro (fail-open) e mascaram a lacuna.
select coalesce(block_type,'(sem seção)') as secao, count(*) as ativas,
       count(*) filter (where dispositivo is null) as sem_dispositivo,
       string_agg(distinct dispositivo, ', ' order by dispositivo) as dispositivos
from email_component_variants where is_active group by 1 order by 1;
