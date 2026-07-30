-- ============================================================
-- Direção fotográfica por variante (jul/2026).
--
-- O agente de imagem decidia o "como fotografar" sozinho, a partir de
-- nicho, posicionamento e um arquétipo de shot derivado por código. O que
-- vinha do cadastro era só o QUE mostrar (`image_brief` do blueprint,
-- `slot_note` do schema) — nada sobre luz, enquadramento, presença de
-- modelo, cenário ou tratamento de cor.
--
-- Resultado prático: cada geração reinventava a fotografia da marca, e a
-- variante que tinha sido desenhada para um still em fundo neutro recebia
-- um lifestyle amplo — ou o contrário.
--
-- Este campo é o BRIEFING do fotógrafo, por variante: entra no TOPO do
-- prompt do agente de imagem, e nicho/posicionamento/cores passam a ser
-- contexto de apoio. O `image_brief` continua dizendo O QUE mostrar; a
-- direção fotográfica diz COMO.
--
-- Escopo (decidido com o Matheus): POR VARIANTE. A direção acompanha o
-- desenho do bloco — é o mesmo lugar onde vive o `design_system`.
--
-- Idempotente. Rollback: DROP COLUMN.
-- ============================================================

ALTER TABLE email_component_variants
  ADD COLUMN IF NOT EXISTS photo_direction TEXT;

COMMENT ON COLUMN email_component_variants.photo_direction IS
  'Direção FOTOGRÁFICA desta variante, escrita para o agente de imagem: luz, enquadramento, distância, presença e pose de modelo, cenário, profundidade, tratamento de cor, o que deixar limpo para a copy. Entra como input principal do prompt de imagem (nicho/posicionamento viram contexto). Diferente de image_brief, que diz O QUE mostrar — aqui é COMO fotografar. NULL/vazio = a seção não entra no prompt.';

-- Verificação: cobertura do briefing fotográfico na biblioteca ativa.
SELECT block_type,
       COUNT(*)                                                          AS ativas,
       COUNT(*) FILTER (WHERE COALESCE(photo_direction, '') <> '')        AS com_direcao_foto,
       COUNT(*) FILTER (WHERE COALESCE(design_system, '') <> '')          AS com_design_system
FROM email_component_variants
WHERE is_active = true
GROUP BY block_type
ORDER BY block_type;
