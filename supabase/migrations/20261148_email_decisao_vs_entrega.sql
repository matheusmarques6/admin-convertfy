-- Trilha B6 (set/2026) — decisão × entregue, por (e-mail, posição).
--
-- Uma FUNÇÃO com o recorte explícito de e-mails, não uma VIEW: a lista de
-- runs por e-mail precisa casar fase 1 pelo BATCH (email_id nulo) e fase 2
-- pelo email_id, exatamente como `agent_studio_latest_runs`, e uma view
-- que fizesse isso para todos os e-mails seria materializada inteira antes
-- do filtro (a lição da 20261127: predicado explícito, uma perna por
-- índice). Quem chama passa os ids; o painel passa um, a métrica dos logs
-- passa a janela.
--
-- A função devolve os DADOS crus por posição (pedido, curador, blueprint,
-- montado, entregue, violações gravadas em `_contrato`, regra pendente).
-- O julgamento — conforme / divergente / não avaliada e o nó responsável —
-- é do módulo puro `shared/conformidade.ts`, para haver UMA régua entre o
-- pipeline e a tela. Nunca `select parsed_output` inteiro: só as chaves.

CREATE OR REPLACE FUNCTION public.email_decisao_vs_entrega(p_email_ids uuid[])
RETURNS TABLE (
  email_id uuid,
  batch_id uuid,
  store_id uuid,
  flow_type text,
  email_number int,
  block_index int,
  section text,
  dispositivo_pedido text,
  papel text,
  requisitos jsonb,
  decisao_presente boolean,
  variante_curador text,
  variante_blueprint text,
  variante_montada text,
  variante_entregue text,
  violacoes jsonb,
  regra_pendente jsonb,
  contrato_presente boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  with emails as (
    select e.id as email_id, e.generation_batch_id as batch_id, e.number as email_number,
           f.store_id, f.flow_type
      from email_flow_emails e
      join email_flows f on f.id = e.flow_id
     where e.id = any (p_email_ids)
  ),
  candidate_runs as (
    select r.id, r.agent, r.created_at, r.parsed_output, r.email_id as resolved_email_id
      from email_generation_runs r
     where r.email_id = any (p_email_ids)
       and r.agent in ('assembler','blueprint','copy')
    union all
    select r.id, r.agent, r.created_at, r.parsed_output, em.email_id
      from email_generation_runs r
      join emails em on em.batch_id is not null and r.batch_id = em.batch_id
     where r.email_id is null
       and r.agent in ('assembler','blueprint','copy')
  ),
  latest as (
    select distinct on (cr.resolved_email_id, cr.agent)
           cr.resolved_email_id as email_id, cr.agent, cr.parsed_output
      from candidate_runs cr
     order by cr.resolved_email_id, cr.agent, cr.created_at desc
  ),
  bp as (
    select em.email_id, b.blocks, b.decisao
      from emails em
      join store_email_blueprints b
        on b.store_id = em.store_id and b.flow_type = em.flow_type and b.email_number = em.email_number
  ),
  ref as (
    select em.email_id, r.slot_map
      from emails em
      join store_email_references r
        on r.store_id = em.store_id and r.flow_type = em.flow_type and r.email_number = em.email_number
  ),
  n_pos as (
    select em.email_id,
           greatest(
             coalesce(jsonb_array_length(bp.blocks), 0),
             coalesce((select max(b.position) from email_blocks b where b.email_id = em.email_id), 0),
             coalesce(jsonb_array_length(bp.decisao -> 'posicoes'), 0)
           ) as n
      from emails em
      left join bp on bp.email_id = em.email_id
  ),
  pos as (
    select em.*, gs.i as block_index
      from emails em
      join n_pos on n_pos.email_id = em.email_id
      cross join lateral generate_series(0, greatest(n_pos.n, 1) - 1) as gs(i)
  )
  select
    pos.email_id,
    pos.batch_id,
    pos.store_id,
    pos.flow_type,
    pos.email_number,
    pos.block_index,
    coalesce(bp.decisao -> 'posicoes' -> pos.block_index ->> 'section', bp.blocks -> pos.block_index ->> 'type') as section,
    bp.decisao -> 'posicoes' -> pos.block_index ->> 'dispositivo' as dispositivo_pedido,
    coalesce(bp.decisao -> 'posicoes' -> pos.block_index ->> 'papel', bp.blocks -> pos.block_index ->> 'papel') as papel,
    bp.decisao -> 'posicoes' -> pos.block_index -> 'requisitos' as requisitos,
    (bp.decisao is not null) as decisao_presente,
    -- `escolhas[].block_index` é o índice da ESTRUTURA do Curador; um bloco
    -- pulado na montagem (`blocks_skipped`, reason missing) some da peça e
    -- as posições seguintes recuam. Colapsa o índice antes de casar com a
    -- posição final (medido em 14/09: e-mail 6b3a7f42 com body pulado —
    -- sem o colapso, cada Curador aparecia deslocado uma posição).
    (select x ->> 'variant_id'
       from jsonb_array_elements(coalesce(ra.parsed_output -> 'escolhas', '[]'::jsonb)) x
      where (x ->> 'block_index')::int
            - (select count(*)
                 from jsonb_array_elements(coalesce(ra.parsed_output -> 'blocks_skipped', '[]'::jsonb)) s
                where (s ->> 'block_index')::int < (x ->> 'block_index')::int)
            = pos.block_index
      limit 1) as variante_curador,
    bp.blocks -> pos.block_index ->> 'variant_id' as variante_blueprint,
    (select s ->> 'variant_id'
       from jsonb_array_elements(coalesce(ref.slot_map, '[]'::jsonb)) s
      where (s ->> 'block_index')::int = pos.block_index
      limit 1) as variante_montada,
    blk.variant_id::text as variante_entregue,
    coalesce((
      select jsonb_agg(v || jsonb_build_object('origem', src.agent))
        from (values ('assembler', ra.parsed_output), ('blueprint', rb.parsed_output), ('copy', rc.parsed_output)) as src(agent, po),
             jsonb_array_elements(coalesce(src.po -> '_contrato' -> 'violacoes', '[]'::jsonb)) v
       where (v ->> 'block_index')::int = pos.block_index
    ), '[]'::jsonb) as violacoes,
    coalesce(ra.parsed_output -> '_contrato' -> 'regra_pendente', '[]'::jsonb) as regra_pendente,
    (ra.parsed_output -> '_contrato') is not null as contrato_presente
  from pos
  left join bp on bp.email_id = pos.email_id
  left join ref on ref.email_id = pos.email_id
  left join email_blocks blk on blk.email_id = pos.email_id and blk.position = pos.block_index + 1
  left join latest ra on ra.email_id = pos.email_id and ra.agent = 'assembler'
  left join latest rb on rb.email_id = pos.email_id and rb.agent = 'blueprint'
  left join latest rc on rc.email_id = pos.email_id and rc.agent = 'copy'
  order by pos.email_id, pos.block_index
$function$;

COMMENT ON FUNCTION public.email_decisao_vs_entrega(uuid[]) IS
  'B6: por (e-mail, posição) — pedido (decisão), curador (escolhas da run assembler), blueprint, montado (slot_map), entregue (email_blocks) e violações de _contrato. O julgamento é de shared/conformidade.ts.';

REVOKE ALL ON FUNCTION public.email_decisao_vs_entrega(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.email_decisao_vs_entrega(uuid[]) TO service_role;
