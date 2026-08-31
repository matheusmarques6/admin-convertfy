-- =============================================================
-- DIAGNÓSTICO (não é migration — rodar à mão no SQL Editor)
--
-- Quais variantes ATIVAS têm texto de exemplo no HTML que NENHUM campo do
-- output_schema endereça? Esse texto sai no email do cliente exatamente
-- como está: sem campo no schema ele não entra em `email_blocks.fields`,
-- não vai no payload do n8n, não volta como copy, não é ancorado pelo
-- `copy_merge` e nenhum agente de formatação tem alçada para tocá-lo.
--
-- Foi assim que o Welcome 1 da Innova Bay (28/08) saiu com três selos
-- "SELO 1 / OFF 1", "SELO 2 / OFF 2", "SELO 3 / OFF 3" sobre os cards,
-- com o run reportando 56/56 campos mergeados e `sem_lugar: []`.
--
-- A régua canônica é `orphanTextFragments` (src/lib/agents/html/
-- anchor-match.ts), que roda no cadastro (aba Componentes) e na geração
-- (parsed_output.texto_orfao do run copy_merge). Este SQL é a versão de
-- varredura: sem parser de HTML, procura o VOCABULÁRIO de exemplo da
-- biblioteca no texto visível e desconta o que já é `example` de algum
-- campo. Serve para priorizar o conserto do acervo — o veredito de cada
-- variante é o painel da aba Componentes.
-- =============================================================

WITH ativas AS (
  SELECT
    v.id,
    v.name,
    v.block_type,
    -- Texto visível aproximado. As tags viram "§" (e NÃO espaço) para que o
    -- casamento nunca atravesse a fronteira de um elemento: sem isso o
    -- padrão engolia "Section Title" + "Section Copy Line 1" num trecho só
    -- e nenhum `example` batia — falso positivo garantido.
    regexp_replace(
      regexp_replace(
        regexp_replace(v.html, '<!--.*?-->', '§', 'g'),
        '<[^>]*>', '§', 'g'
      ),
      '[ \t\r\n]+', ' ', 'g'
    ) AS visivel,
    COALESCE(v.output_schema, '[]'::jsonb) AS schema
  FROM email_component_variants v
  WHERE v.is_active IS NOT FALSE
),
achados AS (
  SELECT
    a.id, a.name, a.block_type, a.schema,
    trim(m[1]) AS trecho
  FROM ativas a,
  LATERAL regexp_matches(
    a.visivel,
    '(SELO\s*\d|OFF\s*\d|Lorem ipsum[^§]{0,60}|Product Name\s*\d?|Product\s*\d\s*Feature\s*\d|Section (?:Title|Copy)[^§]{0,30}|CTA\s*\d|Verified Buyer\s*\d?|Name\.\s*\d|[A-Z_]*_AQUI|X{4,}|LOGO HERE)',
    'g'
  ) m
)
SELECT
  a.block_type                     AS secao,
  a.name                           AS variante,
  a.id                             AS variante_id,
  count(*)                         AS ocorrencias,
  array_agg(DISTINCT a.trecho ORDER BY a.trecho) AS trechos_sem_campo
FROM achados a
-- Token da PLATAFORMA (SCREAMING_SNAKE) fica fora: quem resolve
-- NOME_DA_MARCA / TEXTO_DE_PREHEADER_AQUI é o structural fill e o Montador,
-- não o schema. Mesma regra do `ehTokenDePlataforma` no código — sem ela,
-- 14 das 42 variantes ativas viram pendência que não tem ação.
WHERE a.trecho !~ '^[A-Z][A-Z0-9_]*$'
-- Desconta o que JÁ é example de algum campo: aí existe contrato e o merge
-- escreve por cima. Whitespace colapsado dos DOIS lados — o example é
-- digitado à mão e "CTA  2" (com dois espaços) não pode virar pendência.
  AND NOT EXISTS (
  SELECT 1
  FROM jsonb_array_elements(a.schema) f
  WHERE regexp_replace(lower(COALESCE(f->>'example', '')), '\s+', ' ', 'g')
        LIKE '%' || regexp_replace(lower(a.trecho), '\s+', ' ', 'g') || '%'
)
GROUP BY a.block_type, a.name, a.id
ORDER BY count(*) DESC, a.block_type, a.name;
