-- ═══════════════════════════════════════════════════════════════════
-- Biblioteca de componentes — novas dimensões do editor de variantes
-- (maquete "Geração de Emails" · aba Componentes)
--
-- Adiciona a `email_component_variants`:
--   • objectives/tones  — novas dimensões de matching (substituem
--     niche_affinity/positioning/mood; as antigas ficam DEPRECADAS e
--     serão dropadas em migration futura, após validação do novo
--     matching em produção)
--   • when_use / when_not_use / copy_guidance — contexto para a IA
--     (Curador escolhe melhor; Copy escreve melhor)
--   • long_description — notas de implementação (Outlook quirks etc.);
--     `description` continua sendo a descrição curta
--   • product_slots — nº de produtos que o bloco comporta (grade 2x2 = 4)
--   • output_schema — campos que a IA gera para o bloco:
--     [{key,label,type,max_len,required,example,guidance}] com
--     type ∈ text_short|text_long|number|url|image|boolean
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE email_component_variants
  ADD COLUMN IF NOT EXISTS objectives TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tones TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS when_use TEXT,
  ADD COLUMN IF NOT EXISTS when_not_use TEXT,
  ADD COLUMN IF NOT EXISTS copy_guidance TEXT,
  ADD COLUMN IF NOT EXISTS long_description TEXT,
  ADD COLUMN IF NOT EXISTS product_slots INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_schema JSONB NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_ecv_objectives
  ON email_component_variants USING GIN (objectives);
CREATE INDEX IF NOT EXISTS idx_ecv_tones
  ON email_component_variants USING GIN (tones);

-- Backfill mood (4 chaves EN do briefing) → tones (6 rótulos PT da maquete).
-- Objectives não têm origem equivalente — ficam '{}' (wildcard no matching).
UPDATE email_component_variants
SET tones = (
  SELECT COALESCE(array_agg(DISTINCT t), '{}')
  FROM (
    SELECT CASE m
      WHEN 'formal'    THEN 'Premium'
      WHEN 'casual'    THEN 'Descontraído'
      WHEN 'afetivo'   THEN 'Amigável'
      WHEN 'divertido' THEN 'Descontraído'
    END AS t
    FROM unnest(mood) AS m
  ) s
  WHERE t IS NOT NULL
)
WHERE tones = '{}' AND mood <> '{}';

COMMENT ON COLUMN email_component_variants.objectives IS
  'Objetivos de email compatíveis (rótulos PT, ex. Promoção/Boas-vindas). Vazio = wildcard.';
COMMENT ON COLUMN email_component_variants.tones IS
  'Tons compatíveis (rótulos PT, ex. Urgente/Premium). Vazio = wildcard.';
COMMENT ON COLUMN email_component_variants.output_schema IS
  'Campos que a IA gera para este bloco: [{key,label,type,max_len,required,example,guidance}].';
COMMENT ON COLUMN email_component_variants.niche_affinity IS
  'DEPRECADO (jul/2026): substituído por objectives/tones. Remoção futura.';
COMMENT ON COLUMN email_component_variants.positioning IS
  'DEPRECADO (jul/2026): substituído por objectives/tones. Remoção futura.';
COMMENT ON COLUMN email_component_variants.mood IS
  'DEPRECADO (jul/2026): substituído por objectives/tones. Remoção futura.';
