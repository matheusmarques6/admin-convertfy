-- DADOS — 17/09/2026
-- O `example` é o ENDEREÇO: markdown nele deixa o campo sem âncora
-- ============================================================================
--
-- SINTOMA (Innova Bay nova · welcome, e-mail 6b3a7f42, batch e6853f56):
-- o bloco de oferta saiu com `xx% OFF!` no lugar da porcentagem.
--
--   copy do n8n     at checkout for **10% off** your order
--   HTML entregue   at checkout for <strong ...>xx% OFF!</strong>
--   example         at checkout for **xx% OFF!**
--
-- O campo EXISTE (`cart_coupon_condition`) e a copy CHEGOU CERTA. O merge é
-- que não gravou: `normalizeForMatch` (a régua dos dois lados) não remove
-- marcação markdown, então o example normalizado (`…for **xx% off!**`) nunca
-- casa o HTML normalizado (`…for xx% off!` — o `<strong>` vira vão
-- costurado). Sem âncora, o example fica na tela.
--
-- A run reportou isso com precisão e ninguém lia:
--   merged: 55 / slots_total: 56
--   sem_lugar: [{ key: "cart_coupon_condition", motivo: "nao_encontrado" }]
--
-- ALCANCE MEDIDO (17/09): UMA variante ativa tem markdown no example. As
-- outras com `xx%`/`XXXX%` (`hero section 3`, `hero section 5`, `offer 3`,
-- `produto 15`) ancoram normalmente — a porcentagem de exemplo delas é
-- worklist de cadastro, não defeito de âncora.
--
--   select v.id, v.name, f->>'key', f->>'example'
--     from email_component_variants v,
--          lateral jsonb_array_elements(v.output_schema) f
--    where v.is_active and f->>'example' ~ '\*\*';
--
-- O que muda: o example passa a ser A FRASE QUE ESTÁ NO HTML, sem os `**`.
-- Endereçado por ID — há nome repetido na biblioteca ("body 21" ×2).
--
--   body 20 · cart_coupon_condition
--     de:   at checkout for **xx% OFF!**
--     para: at checkout for xx% OFF!
--
-- Idempotente: o `case` só troca o campo alvo e o `where` já não casa depois
-- de aplicado.
-- ============================================================================

update email_component_variants v
set output_schema = (
      select jsonb_agg(
               case when f->>'key' = 'cart_coupon_condition'
                    then jsonb_set(f, '{example}', '"at checkout for xx% OFF!"'::jsonb)
                    else f
               end
               order by idx
             )
        from jsonb_array_elements(v.output_schema) with ordinality as t(f, idx)
    ),
    updated_at = now()
where v.id = 'd2d50046-f27b-42dc-92c6-9c0e83dd57cc'
  and exists (
        select 1 from jsonb_array_elements(v.output_schema) f
         where f->>'key' = 'cart_coupon_condition'
           and f->>'example' = 'at checkout for **xx% OFF!**'
      );

-- Conferência: tem de voltar UMA linha, com o example sem asterisco.
--
--   select f->>'key', f->>'example'
--     from email_component_variants v,
--          lateral jsonb_array_elements(v.output_schema) f
--    where v.id = 'd2d50046-f27b-42dc-92c6-9c0e83dd57cc'
--      and f->>'key' = 'cart_coupon_condition';

-- ROLLBACK
--
--   update email_component_variants v
--   set output_schema = (
--         select jsonb_agg(
--                  case when f->>'key' = 'cart_coupon_condition'
--                       then jsonb_set(f, '{example}', '"at checkout for **xx% OFF!**"'::jsonb)
--                       else f
--                  end
--                  order by idx
--                )
--           from jsonb_array_elements(v.output_schema) with ordinality as t(f, idx)
--       )
--   where v.id = 'd2d50046-f27b-42dc-92c6-9c0e83dd57cc';
