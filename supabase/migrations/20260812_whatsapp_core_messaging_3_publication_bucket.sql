-- ============================================================
-- WhatsApp — Núcleo de atendimento · PARTE 3/3: realtime + bucket
--
-- ALTER PUBLICATION pega ShareUpdateExclusiveLock nas tabelas quentes
-- (crm_threads/crm_messages) — por isso roda isolado, por último e
-- com lock_timeout (falha rápida → reaplicar).
--
-- Aplicar DEPOIS das partes 1 e 2. Idempotente.
-- ============================================================

SET lock_timeout = '10s';
SET statement_timeout = '60s';

-- ── Realtime publication ───────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['crm_threads', 'crm_messages'])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END;
$$;

-- ── Storage: bucket privado whatsapp-media ─────────────────────────
-- Acesso só por signed URL gerada server-side (service role) — sem
-- policies de storage adicionais. Limite 100MB (docs, teto da Meta).
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('whatsapp-media', 'whatsapp-media', FALSE, 104857600)
ON CONFLICT (id) DO NOTHING;
