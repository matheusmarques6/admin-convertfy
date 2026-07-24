-- ============================================================
-- Memória do Curador: histórico append-only das escolhas de variante por
-- geração (loja × flow × email). Alimenta o Curador com:
--   - o que foi escolhido no email ANTERIOR do mesmo flow/loja (coerência);
--   - as últimas escolhas do MESMO email em OUTRAS lojas do org (variedade).
--
-- Append-only (NÃO faz upsert como store_email_references): guarda o
-- histórico de TODAS as gerações, inclusive regenerações. org_id
-- denormalizado pra escopar o cross-store ao mesmo tenant sem join.
-- ============================================================

CREATE TABLE IF NOT EXISTS email_generation_choices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  org_id uuid,
  flow_type text NOT NULL,
  email_number int NOT NULL,
  -- [{section, variant_id, variant_name}] — snapshot dos nomes na geração.
  choices jsonb NOT NULL DEFAULT '[]'::jsonb,
  batch_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- cross-store: mesmo email, por org, mais recentes primeiro.
CREATE INDEX IF NOT EXISTS idx_egc_slot
  ON email_generation_choices (org_id, flow_type, email_number, created_at DESC);

-- intra-store: email anterior do mesmo flow/loja.
CREATE INDEX IF NOT EXISTS idx_egc_store
  ON email_generation_choices (store_id, flow_type, email_number, created_at DESC);

COMMENT ON TABLE email_generation_choices IS
  'Histórico append-only das escolhas do Curador por geração — memória de coerência (intra-loja) e variedade (cross-loja).';
