-- ============================================================
-- `body 2 - bridge textos linha produtos`: um campo de imagem para DUAS
-- janelas — e o campo descrevendo um artefato que o HTML não usa.
--
-- APLICAR À MÃO. Não roda em deploy: mexe em cadastro da biblioteca, que é
-- decisão editorial, não schema.
--
-- ── O que o HTML dessa variante faz ─────────────────────────────────────
--
--   <div style="position:relative; width:470px; height:360px;">
--     <div style="position:absolute; left:20px;  top:30px; transform:rotate(-4deg);">
--       <div style="background:#ffffff; padding:14px; box-shadow:0 4px 11px …">
--         <img src="https://www.figma.com/api/mcp/asset/d9880f17-…"
--              width="200" height="255" style="…object-fit:cover;…">
--     …e o mesmo bloco à direita, top:70px, rotate(6deg), MESMA url.
--
-- Moldura branca de 14px, inclinação e sombra são CSS. Cada <img> é uma
-- janela de 200 × 255 esperando uma foto NUA. São DUAS.
--
-- ── O que o cadastro pedia ──────────────────────────────────────────────
--
-- Um campo só (`collage_composed`), com image_width/height 470 × 360 e
-- aspect 4:3 — a medida do <div> container, de nenhuma das janelas — e um
-- image_spec pedindo o ativo COMPLETO: "duas fotos de família em molduras
-- brancas de 14px, inclinadas −4° e +6°, sobrepostas e em alturas
-- diferentes, com sombra projetada suave … As rotações e sombras são
-- aplicadas no arquivo". Mais duas linhas de dimensão contraditórias
-- ("3:1, slot 600×200" e depois "4:3, slot 470×360"), resquício de edição.
--
-- Resultado entregue: a colagem 4:3 entra nas duas janelas 200×255 com
-- `object-fit:cover`, então cada uma mostra o MESMO recorte central
-- esticado da colagem inteira, dentro da moldura branca que o HTML desenha
-- por fora. Moldura dentro de moldura, foto irreconhecível. A primeira
-- parte do bloco sai bem porque não depende deste campo.
--
-- ── O que este script faz ───────────────────────────────────────────────
--
-- Troca `collage_composed` por `collage_photo_1` e `collage_photo_2`, uma
-- por moldura, 200 × 255 (4:5), com image_spec REESCRITO sob três regras
-- que o atual viola:
--
--   1. FOTO NUA. Sem moldura, sem inclinação, sem sombra — o HTML põe os
--      três. Pedi-los ao modelo dá moldura dentro de moldura e, no caso da
--      rotação, giro em cima de giro. (Outlook ignora transform/box-shadow,
--      então lá as fotos saem retas e sem sombra — como já saem hoje a
--      moldura e a sombra, que também são CSS. Assar a rotação no arquivo
--      não conserta o Outlook e estraga quem honra o CSS.)
--   2. UMA dimensão só, a da janela: 200 × 255 → 4:5, ativo final
--      400 × 510 (2x).
--   3. SEM a palavra "sobreposta". É ela que faz `hasOverlay`
--      (src/lib/agents/image/overlay-luminance.ts) classificar o campo como
--      recebendo TEXTO por cima e mandar reservar uma faixa limpa do
--      quadro. Aqui quem se sobrepõe são as FOTOS entre si, e não há texto
--      nenhum no slot.
--
-- Os dois campos ficam em GRUPOS separados de geração: `slotGroupKey`
-- (image/slot-groups.ts) corta no primeiro `_<dígitos>`, e "collage_photo_1"
-- não casa esse padrão (o número está no fim) — cada um é âncora de si
-- mesmo, sem dependente. São duas fotos independentes, não uma variação
-- img2img da outra. Custo: o bloco passa a gerar duas imagens (~$0,14 por
-- e-mail em vez de ~$0,07).
--
-- Depende do commit que faz URL de export do Figma virar destino de slot
-- (`isDesignExportUrl` em html/attr-token-vocabulary.ts): sem ele os dois
-- destinos continuam invisíveis e as duas imagens seriam geradas sem lugar.
-- ============================================================

BEGIN;

WITH alvo AS (
  SELECT id, COALESCE(output_schema, '[]'::jsonb) AS schema
  FROM email_component_variants
  WHERE name = 'body 2 - bridge textos linha produtos'
),
-- Os 5 campos de copy ficam INTACTOS, na ordem em que estão.
sem_colagem AS (
  SELECT
    a.id,
    COALESCE(
      jsonb_agg(f ORDER BY ord) FILTER (WHERE f->>'key' <> 'collage_composed'),
      '[]'::jsonb
    ) AS schema
  FROM alvo a, jsonb_array_elements(a.schema) WITH ORDINALITY t(f, ord)
  GROUP BY a.id
)
UPDATE email_component_variants v
SET
  output_schema = s.schema || jsonb_build_array(
    jsonb_build_object(
      'key', 'collage_photo_1',
      'type', 'image',
      'label', 'Foto da moldura esquerda',
      'nature', 'imagem_gerada',
      'example', '',
      'max_len', 0,
      'required', false,
      'guidance', 'Onde fica: moldura da ESQUERDA da colagem (left:20px, inclinada -4deg no HTML), 44px abaixo do primeiro parágrafo. A moldura branca, a inclinação e a sombra são do HTML — a imagem é só a foto.',
      'image_spec', concat_ws(E'\n',
        'Proporção: 4:5. Slot de 200 × 255px. Ativo final 400 × 510px (2x), JPG q80, < 90 KB.',
        'Cena: plano FECHADO de vínculo entre duas pessoas da família — abraço, colo, rostos juntos, mãos no ombro. Enquadramento vertical, cabeças na parte de cima do quadro, corte na altura do peito.',
        'Produto: as pessoas vestem a peça em estampa coordenada com a da outra foto do bloco.',
        'Luz e cor: luz natural de janela vindo da esquerda, tons claros e quentes, pele com textura preservada, sem filtro estourado.',
        'Enquadrar de borda a borda: a foto é recortada por object-fit:cover no e-mail, então nada essencial nos 8% das bordas.',
        'NÃO desenhar moldura, borda branca, inclinação, rotação nem sombra projetada: o HTML aplica os quatro por fora da imagem. A foto entra reta e sangrando até a borda do arquivo.',
        'Sem texto, sem logotipo, sem marca d''água no quadro.'
      ),
      'image_width', 200,
      'image_height', 255,
      'image_aspect', '4:5'
    ),
    jsonb_build_object(
      'key', 'collage_photo_2',
      'type', 'image',
      'label', 'Foto da moldura direita',
      'nature', 'imagem_gerada',
      'example', '',
      'max_len', 0,
      'required', false,
      'guidance', 'Onde fica: moldura da DIREITA da colagem (right:20px, top:70px, inclinada +6deg no HTML), mais abaixo que a da esquerda. A moldura branca, a inclinação e a sombra são do HTML — a imagem é só a foto.',
      'image_spec', concat_ws(E'\n',
        'Proporção: 4:5. Slot de 200 × 255px. Ativo final 400 × 510px (2x), JPG q80, < 90 KB.',
        'Cena: o GRUPO completo da família posado em cena doméstica — sala ou cozinha, todos voltados para a câmera, plano médio de corpo inteiro ou três quartos. É o contraponto aberto do plano fechado da outra foto.',
        'Produto: todos vestem a peça na mesma estampa coordenada da outra foto do bloco.',
        'Luz e cor: mesma luz natural de janela e mesma paleta clara e quente da outra foto — as duas parecem da mesma sessão.',
        'Enquadrar de borda a borda: a foto é recortada por object-fit:cover no e-mail, então nada essencial nos 8% das bordas.',
        'NÃO desenhar moldura, borda branca, inclinação, rotação nem sombra projetada: o HTML aplica os quatro por fora da imagem. A foto entra reta e sangrando até a borda do arquivo.',
        'Sem texto, sem logotipo, sem marca d''água no quadro.'
      ),
      'image_width', 200,
      'image_height', 255,
      'image_aspect', '4:5'
    )
  ),
  updated_at = now()
FROM sem_colagem s
WHERE v.id = s.id;

COMMIT;

-- ── Conferência ─────────────────────────────────────────────────────────
-- Esperado: 5 campos `copy` intactos + collage_photo_1 e collage_photo_2
-- com nature=imagem_gerada, 200x255, aspect 4:5, e nenhum `sobrepost*` no
-- image_spec.
--
-- SELECT f->>'key'          AS key,
--        f->>'nature'       AS nature,
--        f->>'image_width'  AS w,
--        f->>'image_height' AS h,
--        f->>'image_aspect' AS aspect,
--        (f->>'image_spec') ~* 'sobrepost' AS diz_sobreposto
-- FROM email_component_variants v,
--      LATERAL jsonb_array_elements(v.output_schema) WITH ORDINALITY t(f, ord)
-- WHERE v.name = 'body 2 - bridge textos linha produtos'
-- ORDER BY ord;
