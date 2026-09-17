-- DIAGNOSTICO (leitura, nunca aplicar): o cache de prompt pegou? (14/09)
--
-- O que se espera depois do deploy dos passos 2-6:
--   * Curador: `tokens_cache_escrita` > 0 na PRIMEIRA chamada do lote e
--     `tokens_cache` ≈ tamanho do prefixo (system + global + loja + e-mail)
--     na escolha; nos irmãos, `tokens_cache` ≈ system + global + loja;
--   * uma escrita por prefixo por lote (o gate de prefixo);
--   * `shortlist_fonte = 'codigo'` quando toda posição tem ≤ 5 elegíveis;
--   * Estruturador: `refs_descartadas_por_toque` não vazio no welcome-1.
-- Zero em `tokens_cache` com `tokens_cache_escrita` também zero = o provedor
-- não reportou (campo ausente), não "nenhum acerto".

-- 1. Curador, por chamada (últimos 7 dias)
select created_at, email_id, model, cost_cents,
  parsed_output->'consumo_por_chamada' as consumo,
  parsed_output->>'shortlist_fonte' as shortlist_fonte,
  parsed_output->'shortlist_limiar' as limiar,
  parsed_output->'finalistas_por_posicao' as finalistas,
  parsed_output->'elegiveis_por_posicao' as elegiveis
from email_generation_runs
where agent = 'assembler_chooser' and created_at > now() - interval '7 days'
order by created_at desc;

-- 2. Estruturador e Seletor: cache e vault por toque
select agent, created_at, email_id, model, cost_cents,
  input_vars->'tokens_cache' as tokens_cache,
  input_vars->'tokens_cache_escrita' as tokens_cache_escrita,
  input_vars->>'vault_por_toque' as vault_por_toque,
  input_vars->'refs_do_toque' as refs_do_toque,
  input_vars->'refs_descartadas_por_toque' as refs_descartadas,
  input_vars->'aprendizados_descartados_por_toque' as aprendizados_descartados
from email_generation_runs
where agent in ('estruturador', 'seletor') and created_at > now() - interval '7 days'
order by created_at desc;

-- 3. Cadeia de formatação: cache por step
select agent, created_at, email_id, model, cost_cents,
  parsed_output->'cache' as cache
from email_generation_runs
where agent in ('hero_section', 'color_format', 'typography', 'text_format', 'image_format', 'qa')
  and created_at > now() - interval '7 days'
order by created_at desc;

-- 4. Escritas por prefixo e por lote (o gate): mais de UMA escrita do mesmo
--    agente no mesmo batch com o mesmo modelo é a assinatura de irmãos que
--    dispararam juntos.
--
--    ATENÇÃO (16/09): a chave `escolha` só existe no caminho de HOJE. Com o
--    leque ligado as chaves viram `posicao_0..N`, e ler só `escolha`
--    devolveria zero em silêncio — zero é o resultado BOM esperado aqui, e
--    a leitura pós-deploy confirmaria a mudança por acidente. Por isso a
--    soma percorre TODAS as chaves de `consumo_por_chamada`.
select batch_id, agent, model,
  count(*) filter (
    where coalesce(
      (select sum((v->>'tokens_cache_escrita')::int)
         from jsonb_each(coalesce(parsed_output->'consumo_por_chamada', '{}'::jsonb)) as e(k, v)
        where jsonb_typeof(v) = 'object'),
      (input_vars->>'tokens_cache_escrita')::int,
      0
    ) > 0
  ) as chamadas_com_escrita,
  count(*) as runs,
  round(sum(cost_cents)::numeric / 100, 2) as usd
from email_generation_runs
where created_at > now() - interval '7 days'
  and agent in ('assembler_chooser', 'estruturador', 'seletor')
group by 1, 2, 3
order by max(created_at) desc;
