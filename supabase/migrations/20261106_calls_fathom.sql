-- =============================================
-- Calls de alinhamento: conserto do registro + integração Fathom
-- =============================================
--
-- (1) BUG: store_feedback_calls.client_id era NOT NULL, mas
--     client_stores.client_id é NULLABLE desde 20260224 (loja avulsa /
--     loja fallback do onboarding). Registrar call numa loja sem
--     cliente vinculado quebrava com 23502 — é o "registrar call não
--     funciona" da Gestão de Carteira. A call é da LOJA; o cliente é
--     denormalização de conveniência.
--
-- (2) Fathom: colunas para guardar o que a call produziu (resumo,
--     itens de ação estruturados, participantes, link e id da
--     gravação). O texto livre de `notes`/`action_items` continua
--     valendo — as colunas novas são aditivas.

ALTER TABLE store_feedback_calls ALTER COLUMN client_id DROP NOT NULL;

COMMENT ON COLUMN store_feedback_calls.client_id IS
  'Cliente da loja no momento da call (denormalizado). NULL quando a loja não tem cliente vinculado — a call pertence à LOJA.';

-- ── Integração Fathom ──────────────────────────────────────────────
ALTER TABLE store_feedback_calls
  ADD COLUMN IF NOT EXISTS fathom_recording_id TEXT,
  ADD COLUMN IF NOT EXISTS fathom_url TEXT,
  ADD COLUMN IF NOT EXISTS fathom_share_url TEXT,
  -- Resumo em markdown, como o Fathom devolve (default_summary)
  ADD COLUMN IF NOT EXISTS summary_markdown TEXT,
  -- [{description, completed, assignee, playback_url, timestamp}]
  ADD COLUMN IF NOT EXISTS action_items_json JSONB,
  -- [{name, email, is_external}]
  ADD COLUMN IF NOT EXISTS participants JSONB,
  -- Transcrição completa (texto) — opcional, pode ser grande
  ADD COLUMN IF NOT EXISTS transcript TEXT,
  ADD COLUMN IF NOT EXISTS fathom_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN store_feedback_calls.fathom_recording_id IS
  'recording_id da gravação no Fathom — chave de deduplicação (uma call por gravação).';
COMMENT ON COLUMN store_feedback_calls.action_items_json IS
  'Itens de ação estruturados vindos do Fathom + marcados manualmente. Alimentam a pauta da próxima reunião e os próximos passos do relatório mensal.';

-- Uma call por gravação do Fathom (reimportar o mesmo link atualiza,
-- não duplica). Parcial: calls manuais (sem Fathom) não competem.
CREATE UNIQUE INDEX IF NOT EXISTS idx_store_feedback_calls_fathom_recording
  ON store_feedback_calls(fathom_recording_id)
  WHERE fathom_recording_id IS NOT NULL;

-- Pauta da próxima reunião varre as calls recentes da loja
CREATE INDEX IF NOT EXISTS idx_store_feedback_calls_store_conducted
  ON store_feedback_calls(store_id, conducted_at DESC);
