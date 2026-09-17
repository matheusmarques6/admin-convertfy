-- Leque do Curador — acompanhamento pós-deploy (16/09)
--
-- O leque nasce DESLIGADO (`email_generation_settings.curador_leque_mode`,
-- migration 20261158). Estas queries respondem, nesta ordem: ele está
-- ligado? quantas chamadas fez? o prefixo cacheou? a saída encolheu o
-- bastante para pagar as N chamadas?
--
-- A pergunta que decide é a ÚLTIMA. A conta medida em 15/09, no caminho de
-- hoje (run 29c3f906): entrada a preço cheio 38.370 · escrita de cache
-- 56.906 (×1,25) · saída 11.933 (×5) = US$ 1,69. Para o leque empatar, a
-- saída precisa cair para ~6.800 tokens (−43%) OU o prefixo precisa ser
-- lido pelas 5 posições seguintes. Sem `tokens_cache` > 0 da 2ª posição em
-- diante, o leque é puro prejuízo: o prefixo passa a ser pago 6 vezes.

-- 0. O gate.
select org_id, curador_leque_mode, curador_vault_mode, estruturador_mode, seletor_mode
from email_generation_settings;

-- 1. Quais runs rodaram pelo leque, e quantas chamadas cada uma fez.
select
  r.created_at,
  r.batch_id,
  r.model,
  (r.parsed_output->'leque'->>'chamadas')::int as chamadas,
  jsonb_array_length(coalesce(r.parsed_output->'leque'->'posicoes', '[]'::jsonb)) as posicoes,
  jsonb_array_length(coalesce(r.parsed_output->'leque'->'falhas', '[]'::jsonb)) as falhas,
  jsonb_array_length(coalesce(r.parsed_output->'leque'->'ajustes', '[]'::jsonb)) as ajustes,
  r.parsed_output->>'leque_indisponivel' as indisponivel,
  round(r.cost_cents::numeric / 100, 4) as usd,
  r.tokens_input,
  r.tokens_output
from email_generation_runs r
where r.agent = 'assembler_chooser'
  and r.created_at > now() - interval '14 days'
order by r.created_at desc
limit 30;

-- 2. O cache POR POSIÇÃO. `tokens_cache` deve ser ~0 na posicao_0 (escrita)
--    e alto de posicao_1 em diante (leitura). Se for zero em todas, o
--    prefixo não está cacheando e o leque não se paga.
select
  r.created_at,
  r.batch_id,
  e.k as etapa,
  (e.v->>'tokens_input')::int as entrada,
  (e.v->>'tokens_output')::int as saida,
  (e.v->>'tokens_cache')::int as cache_lido,
  (e.v->>'tokens_cache_escrita')::int as cache_escrito,
  (e.v->>'seg')::int as seg
from email_generation_runs r
cross join lateral jsonb_each(coalesce(r.parsed_output->'consumo_por_chamada', '{}'::jsonb)) as e(k, v)
where r.agent = 'assembler_chooser'
  and jsonb_typeof(e.v) = 'object'
  and r.created_at > now() - interval '14 days'
order by r.created_at desc, e.k
limit 100;

-- 3. **A conta que decide.** Saída total por run, leque × caminho de hoje.
--    O leque só se paga se a coluna `saida` dele ficar abaixo de ~6.800 OU
--    se `cache_lido` for alto (coluna acima).
select
  case when r.parsed_output->'leque' is not null and r.parsed_output->'leque' <> 'null'::jsonb
       then 'leque' else 'chamada unica' end as via,
  count(*) as runs,
  round(avg(r.tokens_output)) as saida_media,
  round(avg(r.tokens_input)) as entrada_media,
  round(avg(r.cost_cents)::numeric / 100, 3) as usd_medio,
  round(avg((r.parsed_output->>'voltas')::numeric), 1) as voltas_media
from email_generation_runs r
where r.agent = 'assembler_chooser'
  and r.status = 'success'
  and r.created_at > now() - interval '30 days'
group by 1;

-- 4. Onde o leque perdeu posição, e por quê. `falhas` é chamada que não
--    aconteceu (relógio/rede/provedor) e NÃO é lacuna de biblioteca;
--    `ajustes` é o código desfazendo repetição com a reserva.
select
  r.created_at,
  r.batch_id,
  f.value->>'block_index' as posicao,
  f.value->>'erro' as erro
from email_generation_runs r
cross join lateral jsonb_array_elements(coalesce(r.parsed_output->'leque'->'falhas', '[]'::jsonb)) as f
where r.agent = 'assembler_chooser' and r.created_at > now() - interval '14 days'
order by r.created_at desc;

-- 5. A janela de e-mails recentes (Fase 3), que roda em SHADOW: o que ela
--    teria bloqueado e onde precisou ser afrouxada por escassez. As
--    afrouxadas viram pauta `biblioteca_escassa` no vault a partir de 3
--    ocorrências (chave por flow × seção).
select
  r.created_at,
  r.batch_id,
  r.parsed_output->'janela'->'bloqueadas_por_posicao' as bloqueadas,
  r.parsed_output->'janela'->'afrouxadas' as afrouxadas
from email_generation_runs r
where r.agent = 'assembler_chooser'
  and r.parsed_output->'janela' is not null
  and r.created_at > now() - interval '14 days'
order by r.created_at desc
limit 30;

-- 6. As 9 chaves do contrato de telemetria, que o caminho do VAULT não
--    gravava (gravava 2). Zero linhas aqui = contrato cumprido.
select r.created_at, r.batch_id, r.status, k as chave_faltante
from email_generation_runs r
cross join lateral unnest(array[
  'catalog_variants','attempts','ranking','motivos','invalid_ids',
  'retyped_positions','empty_blocks','candidates_excluded_unfillable','ranking_detalhado'
]) as k
where r.agent = 'assembler_chooser'
  and r.created_at > now() - interval '14 days'
  and not (r.parsed_output ? k)
order by r.created_at desc;

-- ─────────────────────────────────────────────────────────────────────
-- 8. A DURABILIDADE (16/09): quanto foi retomado, e quanto foi perdido.
--
-- O leque grava cada posição assim que ela fecha
-- (`curador-leque-progresso.ts`), então uma função morta no meio deixa o
-- trabalho gravado e a invocação seguinte continua de onde parou. Estas
-- duas linhas dizem se isso está acontecendo:
--
--   `retomadas` > 0  → houve morte no meio E a retomada funcionou (a
--                      decisão não foi repaga).
--   run `running` velha SEM run seguinte no mesmo batch → morreu e
--                      ninguém voltou: o job não foi re-tentado.
--
-- A segunda é a que denuncia regressão. Com `source: "retomavel"` o
-- dispatch NÃO settla o e-mail (ele volta para `pending`), então a
-- ausência de uma segunda run no mesmo batch significa que o job esgotou
-- as tentativas ou que o cron parou de rodar.
select
  r.created_at,
  r.batch_id,
  r.email_id,
  r.status,
  jsonb_array_length(coalesce(r.parsed_output -> 'leque' -> 'retomadas', '[]'::jsonb)) as posicoes_retomadas,
  (r.parsed_output -> 'leque' ->> 'chamadas')::int as chamadas,
  jsonb_array_length(coalesce(r.parsed_output -> 'leque' -> 'posicoes', '[]'::jsonb)) as posicoes,
  (r.parsed_output -> 'leque' ->> 'teto_por_posicao')::int as teto_por_posicao,
  -- Gravação parcial que sobrou: a run morreu sem fechar.
  (r.parsed_output -> 'leque' ->> 'parcial')::boolean as morreu_no_meio,
  round(r.cost_cents / 100.0, 2) as usd
from email_generation_runs r
where r.agent = 'assembler_chooser'
  and r.created_at > now() - interval '14 days'
  and r.parsed_output ? 'leque'
order by r.created_at desc;

-- 9. Peças que NÃO fecharam: de quem foi a culpa.
--
-- `lacuna_causa` separa o que antes era um rótulo só. `biblioteca` é
-- pedido de cadastro; `relogio` é chamada que não aconteceu — e essa NÃO
-- marca o e-mail como `failed`, NÃO vira pauta no vault e volta para a
-- fila. Linha com `relogio` e sem uma run seguinte no mesmo batch é o
-- sinal de que a retomada não está acontecendo.
select
  r.created_at,
  r.batch_id,
  r.parsed_output ->> 'lacuna_causa' as causa,
  (r.parsed_output ->> 'lacuna_biblioteca')::boolean as conta_como_biblioteca,
  jsonb_array_length(coalesce(r.parsed_output -> 'posicoes_sem_variante', '[]'::jsonb)) as posicoes_vazias,
  r.parsed_output -> 'posicoes_sem_variante' as detalhe
from email_generation_runs r
where r.agent = 'assembler'
  and r.created_at > now() - interval '14 days'
  and r.parsed_output ? 'lacuna_causa'
order by r.created_at desc;
