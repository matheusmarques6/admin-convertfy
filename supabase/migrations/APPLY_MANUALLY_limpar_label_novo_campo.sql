-- ============================================================
-- Zera o rótulo "Novo campo" no output_schema das variantes.
--
-- O editor preenchia `label: "Novo campo"` ao adicionar um campo, e
-- ninguém corrigia depois: 184 campos em 23 variantes ativas chegaram
-- assim. O rótulo NÃO é decorativo — ele viaja para o n8n
-- (`block-copy-schema.ts`) e para o Montador
-- (`component-assembler.service.ts`), então a IA lia "este campo se
-- chama Novo campo" no lugar do papel real do slot.
--
-- A correção é ZERAR, não inventar: com o label vazio os dois
-- consumidores caem na `key` (`f.label || key`), que é sempre
-- significativa e não pode divergir do endereço `{{UPPER(key)}}`.
-- O editor deixou de pedir o rótulo pelo mesmo motivo.
--
-- Não apaga campo nenhum. Ordem dos campos preservada (WITH ORDINALITY).
-- Idempotente.
-- ============================================================

UPDATE email_component_variants v
SET output_schema = (
  SELECT jsonb_agg(
           CASE WHEN f->>'label' = 'Novo campo'
                THEN jsonb_set(f, '{label}', '""'::jsonb)
                ELSE f
           END
           ORDER BY ord
         )
  FROM jsonb_array_elements(v.output_schema) WITH ORDINALITY AS t(f, ord)
)
WHERE v.output_schema @> '[{"label":"Novo campo"}]'::jsonb;

-- Confere: tem de voltar 0.
SELECT count(*) AS ainda_com_rotulo_novo_campo
FROM email_component_variants v,
     jsonb_array_elements(coalesce(v.output_schema, '[]'::jsonb)) f
WHERE f->>'label' = 'Novo campo';
