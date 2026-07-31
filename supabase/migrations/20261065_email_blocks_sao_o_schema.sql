-- ============================================================
-- O BLOCO É O SCHEMA.
--
-- `email_blocks` era uma linha com block_type, label, position e um
-- `content` vazio — não sabia qual variante representava nem quais campos
-- devia conter. O vínculo bloco↔variante existia só em tempo de execução,
-- por CASAMENTO DE ÍNDICE (`bpBlocks[position-1]`, guardado pela igualdade
-- de `type`), refeito de forma independente no dispatch e no callback. E o
-- schema viajava por fora, num array `component_variants` no nível do email
-- que o n8n nunca cruzava com o bloco.
--
-- Resultado prático (welcome do Luxe Lift): o n8n gerava a copy a partir do
-- bloco (tipo/label/purpose) e devolvia `{headline, subhead, cta}` — o
-- vocabulário do tag-registry, não as keys do schema. Como só existe UM
-- `cta`, o segundo botão nunca teve fonte: `hero_cta_2_label` voltava vazio,
-- o agente de hero via slot sem valor e removia a linha. O email saiu sem o
-- botão, com cada etapa funcionando como projetada.
--
-- Agora a linha É a instância da variante naquele email:
--   variant_id — qual variante, sem adivinhação por índice;
--   fields     — o snapshot do schema (BlueprintBlockField[]), que é o que
--                foi pedido ao n8n e o que o callback cobra de volta.
--
-- Sem backfill retroativo: bloco com `fields` vazio é resolvido do blueprint
-- no próximo dispatch E GRAVADO (auto-cura). O caminho antigo morre sozinho
-- quando o último bloco for tocado, e cada uso dele sai em log.
--
-- Rollback: DROP das duas colunas (o código antigo não as lê).
-- ============================================================

ALTER TABLE email_blocks
  ADD COLUMN IF NOT EXISTS variant_id UUID,
  ADD COLUMN IF NOT EXISTS fields JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN email_blocks.variant_id IS
  'Variante da biblioteca (email_component_variants) que este bloco instancia. NULL = bloco sem variante casada — hoje isso é erro de CURADORIA, não um modo de operação: sem variante não há schema, e sem schema o n8n não tem contrato de copy.';

COMMENT ON COLUMN email_blocks.fields IS
  'Snapshot do schema DESTE bloco (BlueprintBlockField[]: key, label, type, nature, max_len, required, example, guidance, tag, source). É o contrato de copy enviado ao n8n e cobrado no callback — content é chaveado por fields[].key. Refrescado a cada dispatch: o que está gravado aqui tem de ser byte a byte o que foi enviado.';

-- Índice para o callback resolver o bloco pelo id sem varrer o email.
-- (email_blocks.id já é PK; este é o caminho do dispatch por email.)
CREATE INDEX IF NOT EXISTS idx_email_blocks_email_position
  ON email_blocks (email_id, position);

-- Verificação.
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='email_blocks'
      AND column_name IN ('variant_id','fields'))                AS colunas_ok,
  (SELECT count(*) FROM email_blocks)                            AS blocos_total,
  (SELECT count(*) FROM email_blocks
    WHERE jsonb_array_length(COALESCE(fields,'[]'::jsonb)) > 0)  AS blocos_com_schema;
