-- ============================================================
-- Design System por variante (jul/2026).
--
-- Os campos de "Contexto para a IA" que existiam até aqui — `when_use`,
-- `when_not_use`, `copy_guidance` — servem à ESCOLHA (Curador/Montador) e à
-- COPY (n8n). Nenhum deles fala com quem IMPLEMENTA a variante.
--
-- O agente da hero recebe a região já enxertada e precisa finalizá-la sem
-- desmontar o desenho: quais bandas de fundo são intencionais, qual botão é
-- primário, o que pode encolher no mobile, o que jamais vira link de texto.
-- Isso é conhecimento de QUEM CADASTROU a variante, e até agora não tinha
-- onde morar — virava tentativa de adivinhação a cada geração.
--
-- Escopo deliberado: POR VARIANTE (regras de implementação daquele
-- componente) e consumido SÓ pelo hero_section por enquanto. Validado ali,
-- estende-se aos demais steps de formatação — mesma sequência do enxerto
-- por ID, que começou pela hero e depois virou regra.
--
-- Idempotente. Rollback: DROP COLUMN.
-- ============================================================

ALTER TABLE email_component_variants
  ADD COLUMN IF NOT EXISTS design_system TEXT;

COMMENT ON COLUMN email_component_variants.design_system IS
  'Instruções de DESIGN/implementação desta variante, escritas para o agente que a finaliza (hoje só o hero_section). Diferente de copy_guidance, que orienta a ESCRITA: aqui vão as regras visuais — hierarquia, bandas de fundo intencionais, acabamento dos botões, comportamento no mobile, o que nunca pode ser removido. NULL/vazio = a seção não entra no prompt.';

-- Verificação: quantas variantes ativas já têm design system escrito.
SELECT block_type,
       COUNT(*)                                                        AS ativas,
       COUNT(*) FILTER (WHERE COALESCE(design_system, '') <> '')        AS com_design_system
FROM email_component_variants
WHERE is_active = true
GROUP BY block_type
ORDER BY block_type;
