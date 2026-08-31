-- =============================================================
-- aplicar_estrutura_email — reordenar/remover blocos numa TRANSAÇÃO.
--
-- Incidente 28/08. `email_blocks` tem UNIQUE (email_id, position) e as duas
-- rotas de reordenação renumeravam UM BLOCO POR VEZ:
--
--   for (i…) update email_blocks set position = i+1 where id = ordem[i]
--
-- Mover o 2º bloco para a posição 1 colide com o 1º, que ainda está lá.
-- Resultado: QUALQUER troca de ordem falhava com 23505 ("Registro
-- duplicado"), tanto na tela do email quanto no painel — e o painel, que
-- usa Promise.all, falhava de forma não determinística.
--
-- Pior que o erro: a rota gravava o HTML ANTES dos blocos, sem transação.
-- No email 6b3a7f42 o documento ficou com a ordem nova e os blocos com a
-- antiga, e a revisão não chegou a ser gravada. A tela disse "erro" e
-- metade tinha sido salva.
--
-- Esta função resolve os dois: renumeração em DUAS PASSADAS (faixa
-- temporária livre) e tudo — delete, posições, HTML, revisão — num único
-- bloco transacional. Ou o email inteiro muda, ou nada muda.
--
-- SECURITY DEFINER porque `email_structure_reviews` tem RLS sem policies
-- (service-role only, por desenho da 20261088) e as rotas são o caminho;
-- search_path fixado, como manda a régua de segurança do projeto.
-- =============================================================

create or replace function public.aplicar_estrutura_email(
  p_email_id    uuid,
  p_ordem       uuid[],
  p_removidos   uuid[]  default '{}',
  -- NULL = não mexer no documento (email sem html_marked, ou documento que
  -- o block-regions recusou editar). Não confundir com string vazia.
  p_html        text    default null,
  p_html_marked text    default null,
  -- NULL = só reordenar (reorder do painel, sem justificativa).
  p_revisao     jsonb   default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total       int;
  v_informados  int;
  v_alcance     text;
  v_store_id    uuid;
  v_flow_type   text;
  v_email_num   int;
  v_revisao_id  uuid;
begin
  -- ── Guarda: a ordem + os removidos são uma PARTIÇÃO exata dos blocos ──
  -- A rota já valida isto, mas a função é chamada por duas rotas e é a
  -- última fronteira antes da escrita. Lista parcial deixaria bloco fora da
  -- renumeração, e a posição viraria um buraco silencioso.
  select count(*) into v_total
  from email_blocks where email_id = p_email_id;

  v_informados := coalesce(array_length(p_ordem, 1), 0)
                + coalesce(array_length(p_removidos, 1), 0);

  if v_informados <> v_total then
    raise exception
      'ordem_incompleta: % bloco(s) informado(s) para % do email',
      v_informados, v_total
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1
    from unnest(p_ordem || p_removidos) as t(id)
    where not exists (
      select 1 from email_blocks b
      where b.id = t.id and b.email_id = p_email_id
    )
  ) then
    raise exception 'bloco_de_outro_email: id fora deste email'
      using errcode = 'check_violation';
  end if;

  -- ── 1. Remoções ──────────────────────────────────────────────────────
  if coalesce(array_length(p_removidos, 1), 0) > 0 then
    delete from email_blocks
    where email_id = p_email_id and id = any(p_removidos);
  end if;

  -- ── 2. Posições, em DUAS passadas ────────────────────────────────────
  -- A primeira joga todo mundo para uma faixa livre (+1000). Sem ela, o
  -- primeiro UPDATE já colide com a posição que o vizinho ainda ocupa —
  -- que é exatamente o bug. A ordem relativa se mantém, então a faixa
  -- nunca colide consigo mesma.
  update email_blocks
  set position = position + 1000
  where email_id = p_email_id;

  update email_blocks b
  set position = o.ord
  from unnest(p_ordem) with ordinality as o(id, ord)
  where b.id = o.id and b.email_id = p_email_id;

  -- ── 3. Documento, por ÚLTIMO ─────────────────────────────────────────
  -- Só muda quando os blocos já mudaram. Era a inversão desta ordem que
  -- deixava o email com duas verdades quando o passo 2 estourava.
  if p_html_marked is not null or p_html is not null then
    update email_flow_emails
    set html_marked = coalesce(p_html_marked, html_marked),
        html        = coalesce(p_html, html),
        updated_at  = now()
    where id = p_email_id;
  end if;

  -- ── 4. Revisão ───────────────────────────────────────────────────────
  if p_revisao is not null then
    v_alcance   := p_revisao->>'alcance';
    v_store_id  := nullif(p_revisao->>'store_id', '')::uuid;
    v_flow_type := p_revisao->>'flow_type';
    v_email_num := (p_revisao->>'email_number')::int;

    -- Uma ativa por alvo: a anterior é DESATIVADA, não apagada.
    update email_structure_reviews
    set is_active = false
    where is_active
      and alcance = v_alcance
      and flow_type = v_flow_type
      and email_number = v_email_num
      and coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = coalesce(v_store_id, '00000000-0000-0000-0000-000000000000'::uuid);

    insert into email_structure_reviews (
      alcance, store_id, flow_type, email_number, email_id,
      ordem_anterior, ordem_nova, blocos_removidos, justificativa,
      para_estruturador, para_curador, para_montador, created_by
    ) values (
      v_alcance, v_store_id, v_flow_type, v_email_num, p_email_id,
      coalesce(
        array(select jsonb_array_elements_text(p_revisao->'ordem_anterior')),
        '{}'
      ),
      coalesce(
        array(select jsonb_array_elements_text(p_revisao->'ordem_nova')),
        '{}'
      ),
      coalesce(
        array(select jsonb_array_elements_text(p_revisao->'blocos_removidos')),
        '{}'
      ),
      p_revisao->>'justificativa',
      coalesce((p_revisao->>'para_estruturador')::boolean, true),
      coalesce((p_revisao->>'para_curador')::boolean, false),
      coalesce((p_revisao->>'para_montador')::boolean, false),
      nullif(p_revisao->>'created_by', '')::uuid
    )
    returning id into v_revisao_id;
  end if;

  return jsonb_build_object(
    'blocos', coalesce(array_length(p_ordem, 1), 0),
    'removidos', coalesce(array_length(p_removidos, 1), 0),
    'html_atualizado', (p_html_marked is not null or p_html is not null),
    'revisao_id', v_revisao_id
  );
end;
$$;

comment on function public.aplicar_estrutura_email is
  'Reordena/remove blocos de um email numa transação: renumeração em duas passadas (o UNIQUE (email_id, position) impede a troca direta), documento por último e revisão humana junto. Ou tudo muda, ou nada muda — incidente 28/08.';

revoke all on function public.aplicar_estrutura_email(
  uuid, uuid[], uuid[], text, text, jsonb
) from public, anon, authenticated;
