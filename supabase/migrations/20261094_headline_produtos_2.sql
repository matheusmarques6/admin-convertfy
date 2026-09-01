-- =============================================================
-- O example da headline da "produtos 2" usava " / " como quebra de linha.
--
-- Incidente Innova Bay (01/09): o bloco saiu com o título do TEMPLATE —
-- "THREE INGREDIENTS. ZERO FILLERS." — numa loja que vende medidor de
-- energia e scanner OBD. A copy existia: o n8n devolveu "ONE PLUG. REAL
-- SAVINGS. NO GUESSING." e ela está gravada em `email_blocks.content`.
-- O que falhou foi a ÂNCORA.
--
-- O HTML da variante escreve `Three<br>Ingredients.<br>Zero Fillers.`, e o
-- merge costura nós separados por <br> — casaria. Mas o `example`
-- cadastrado é "\tTHREE / INGREDIENTS. / ZERO FILLERS.": quem cadastrou
-- usou " / " para INDICAR a quebra de linha. O merge ancora pelo texto
-- literal, as barras não existem no HTML, e o campo virou `sem_lugar:
-- nao_encontrado` — copy paga, gerada e jogada fora.
--
-- Corrigido no CADASTRO, não no código: das 42 variantes ativas esta é a
-- ÚNICA com " / " no example (conferido em 01/09). Afrouxar a régua de
-- casamento para tolerar separador por causa de um caso isolado abriria a
-- porta para casar frase errada em todos os outros.
-- =============================================================

UPDATE email_component_variants
SET output_schema = (
      SELECT jsonb_agg(
        CASE
          WHEN f->>'key' = 'headline'
            THEN jsonb_set(f, '{example}', '"Three Ingredients. Zero Fillers."'::jsonb)
          ELSE f
        END
        ORDER BY ord
      )
      FROM jsonb_array_elements(output_schema) WITH ORDINALITY t(f, ord)
    ),
    updated_at = now()
WHERE id = '8ef65206-2f01-408f-ab07-c17f57cc136c'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(output_schema) f
    WHERE f->>'key' = 'headline' AND f->>'example' LIKE '%/%'
  );
