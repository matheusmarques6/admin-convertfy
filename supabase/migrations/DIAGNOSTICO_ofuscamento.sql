-- DIAGNÓSTICO — ofuscamento no catálogo de variantes (15/09)
--
-- Não é migration: são as queries que MEDIRAM o problema, guardadas para
-- comparar o antes com o depois. Rode cada bloco no SQL Editor.
--
-- O retrato de 15/09, antes das mudanças (45 dias de escolhas, 37 variantes
-- ativas):
--
--   · 8 de 37 variantes ativas NUNCA foram escolhidas
--   · footer_nav      89 · 0 · 0   → 100% num bloco
--   · offer_sem_cupom 19 · 0       → 100%
--   · hero_lineup      5 · 0       → 100%
--   · hero_oferta_cupom      43 · 9 · 8 · 4 · 0  → 67% no líder
--   · products_grade_sem_preco 24 · 10 · 2 · 1 · 0 → 65%
--   · reviews_com_credencial  36 · 34 · 10 → 45% (saudável)
--
-- O que os três casos de 100% têm em comum: são exatamente aqueles em que o
-- ranking por eixos chega ao EMPATE e passa a decidir pelo desempate — e o
-- desempate lia uma lista que só continha quem já tinha sido escolhido.
--
-- Duas hipóteses CAÍRAM na medição, registradas para ninguém repeti-las:
--   · "a com menos campos ganha": 0-6 campos → média 6,9 escolhas;
--     7-12 → 17,0; 13-18 → 19,6; 19+ → 2,8. É o oposto.
--   · "o primeiro da lista ganha": falha em 3 de 11 dispositivos
--     (hero_pergunta, products_galeria e products_unico_oferta elegem o 2º).

-- ── 1. Concentração por dispositivo ─────────────────────────────────────
-- O número a acompanhar: a coluna `concentracao_pct` dos que hoje estão em
-- 100 deve CAIR. Se não cair, o desempate por uso não está chegando ao
-- prompt — confira `parsed_output->'catalogo_chars_por_variante'` na run.
with escolhas as (
  select (e->>'variant_id')::uuid as vid
  from email_generation_runs r,
       lateral jsonb_array_elements(coalesce(r.parsed_output->'escolhas','[]'::jsonb)) e
  where r.agent in ('assembler','assembler_chooser')
    and r.created_at > now() - interval '45 days'
    and jsonb_typeof(r.parsed_output->'escolhas') = 'array'
    and (e->>'variant_id') ~ '^[0-9a-f-]{36}$'
),
cnt as (select vid, count(*) n from escolhas group by vid),
por_variante as (
  select c.dispositivo, c.name, coalesce(k.n, 0) as escolhas
  from email_component_variants c
  left join cnt k on k.vid = c.id
  where c.is_active and c.dispositivo is not null
)
select dispositivo,
       count(*)                                   as variantes,
       sum(escolhas)                              as escolhas_total,
       max(escolhas)                              as lider,
       case when sum(escolhas) > 0
            then round(100.0 * max(escolhas) / sum(escolhas))
       end                                        as concentracao_pct,
       count(*) filter (where escolhas = 0)       as nunca_escolhidas,
       string_agg(name || ' ' || escolhas, ' · ' order by escolhas desc) as placar
from por_variante
group by dispositivo
having count(*) > 1
order by concentracao_pct desc nulls last, dispositivo;

-- ── 2. Variantes que nunca foram escolhidas ─────────────────────────────
-- Cair de 8 é o sinal de que a específica deixou de ser ofuscada. Variante
-- nova entra aqui até ser escolhida uma vez — compare pela DATA de
-- cadastro antes de concluir.
with escolhas as (
  select (e->>'variant_id')::uuid as vid
  from email_generation_runs r,
       lateral jsonb_array_elements(coalesce(r.parsed_output->'escolhas','[]'::jsonb)) e
  where r.agent in ('assembler','assembler_chooser')
    and r.created_at > now() - interval '45 days'
    and jsonb_typeof(r.parsed_output->'escolhas') = 'array'
    and (e->>'variant_id') ~ '^[0-9a-f-]{36}$'
)
select c.block_type, c.dispositivo, c.name, c.created_at::date as cadastrada_em
from email_component_variants c
where c.is_active
  and c.id not in (select vid from escolhas)
order by c.block_type, c.name;

-- ── 3. O custo do índice, por variante ──────────────────────────────────
-- É esta a medida que diz se a biblioteca pode crescer. O teto de 15.000
-- chars no TOTAL era comentário e um teste sobre fixture sintético: em
-- 15/09 a produção estava em 16.255 chars (37 variantes, 439 por linha) e
-- nada media, avisava ou cortava. Um teto no total ainda proibiria
-- cadastrar, que é o contrário do que se quer.
select r.created_at,
       r.parsed_output->>'catalogo_chars'              as chars,
       r.parsed_output->>'catalogo_chars_por_variante' as chars_por_variante,
       jsonb_array_length(coalesce(r.parsed_output->'catalogo_linhas_longas','[]'::jsonb)) as linhas_longas,
       r.parsed_output->'catalogo_linhas_longas'       as quais
from email_generation_runs r
where r.agent = 'assembler_chooser'
  and r.parsed_output ? 'catalogo_chars_por_variante'
order by r.created_at desc
limit 20;

-- ── 4. A cauda: quanto das notas das finalistas foi servido ─────────────
-- Antes do extrato: 3 finalistas × 6.524 chars = 19.572 por posição, e um
-- grupo de 5 (abaixo do limiar de shortlist, todas viram finalistas) dava
-- 32.620. Medido nas 40 notas ativas, 67% disso era design system, direção
-- fotográfica e orientações de copy — material de OUTROS agentes, que já
-- está no banco nas colunas próprias.
select r.created_at,
       r.parsed_output->'progressive_disclosure'->>'notes_chars' as cauda_chars,
       jsonb_array_length(coalesce(r.parsed_output->'progressive_disclosure'->'notes_opened','[]'::jsonb)) as notas_servidas,
       jsonb_array_length(coalesce(r.parsed_output->'progressive_disclosure'->'notes_sem_orcamento','[]'::jsonb)) as cortadas_por_orcamento
from email_generation_runs r
where r.agent = 'assembler_chooser'
  and r.parsed_output->'progressive_disclosure' ? 'notes_chars'
order by r.created_at desc
limit 20;

-- ── 5. Generalidade medida (as duas violações novas) ────────────────────
-- `proibicao_violada` só dispara contra quem DECLAROU algo — a variante de
-- eixos vazios era matematicamente incapaz de aparecer no medidor. Estas
-- duas são a contrapartida; MEDEM, não eliminam.
select v->>'tipo' as tipo, count(*) as ocorrencias,
       count(distinct v->>'variant_id') as variantes,
       min(r.created_at) as primeira, max(r.created_at) as ultima
from email_generation_runs r,
     lateral jsonb_array_elements(coalesce(r.parsed_output->'violacoes','[]'::jsonb)) v
where r.agent = 'assembler_chooser'
  and r.created_at > now() - interval '30 days'
  and v->>'tipo' in ('generica_sobre_especifica','sem_eixos','proibicao_violada')
group by 1
order by 2 desc;

-- ── 6. Duplicatas no dispositivo (worklist de curadoria) ────────────────
-- Não é defeito de código: escolher sempre a mesma entre duas iguais está
-- CERTO. Aparece também na aba Conhecimento. O par de 15/09 era
-- `hero_lineup`: as duas descrições dizem literalmente a mesma coisa
-- ("rotina, kit ou linha completa", "descoberta e educação", "amplitude do
-- catálogo") e o placar era 5 × 0.
select r.created_at, r.parsed_output->'duplicatas_no_dispositivo' as pares
from email_generation_runs r
where r.agent = 'assembler_chooser'
  and jsonb_array_length(coalesce(r.parsed_output->'duplicatas_no_dispositivo','[]'::jsonb)) > 0
order by r.created_at desc
limit 5;

-- ── 7. Variante ATIVA sem dispositivo (15/09) ───────────────────────────
-- O pior estado da biblioteca e o único que ninguém enxergava: o filtro é
-- fail-open, então ela nunca é eliminada e concorre em TODA posição da
-- seção; e `capacidadePorSecao` só conta as classificadas, então o
-- Estruturador nunca consegue pedi-la. Custa e não compete — e no resgate
-- ganhava o desempate por ter zero usos (corrigido: +75 quando a posição
-- pede dispositivo).
--
-- Retrato de 15/09, ANTES: 8 de 45 ativas — as 8 heroes cadastradas naquele
-- dia. DEPOIS de classificar: 0.
select block_type, count(*) as ativas_sem_dispositivo,
       string_agg(name, ', ' order by name) as quais
from email_component_variants
where is_active and dispositivo is null
group by block_type
order by 2 desc;

-- Pool efetivo por dispositivo de hero: é ele que cruza o limiar de 5 da
-- shortlist (`limiarSemChamada`). Em 15/09, depois de classificar:
-- hero_oferta_cupom 10 · hero_apresentacao 3 · hero_lineup 2 · hero_pergunta 2.
-- Acima de 5 a chamada ao modelo LIGA para o e-mail inteiro.
select block_type, coalesce(dispositivo, '(sem dispositivo)') as dispositivo,
       count(*) as variantes,
       case when count(*) > 5 then 'chama o modelo' else 'resolve no código' end as shortlist
from email_component_variants
where is_active
group by block_type, dispositivo
order by block_type, count(*) desc;
