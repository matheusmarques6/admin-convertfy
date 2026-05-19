-- =============================================
-- Ritual Sessions (Reunião Sexta 14h-16h)
-- =============================================
-- Tracking de sessões do ritual semanal de acompanhamento.
-- Cada loja em Etapa 1 do pipeline é discutida → ações aprovadas → avança pra Etapa 2.

CREATE TABLE IF NOT EXISTS ritual_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,

  -- Status da sessão
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'cancelled')),

  -- Metadados
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  started_by UUID REFERENCES profiles(id),
  participants UUID[] DEFAULT '{}',

  -- Stores discutidas (em ordem de discussão)
  store_ids UUID[] DEFAULT '{}',
  current_store_index INTEGER DEFAULT 0,

  -- Gravação Fathom (upload manual ou link)
  recording_url TEXT,
  recording_filename TEXT,
  recording_uploaded_at TIMESTAMPTZ,

  -- Transcrição (gerada por IA após upload)
  transcript TEXT,
  transcript_status TEXT DEFAULT 'pending' CHECK (transcript_status IN ('pending', 'processing', 'completed', 'failed')),
  transcript_processed_at TIMESTAMPTZ,
  transcript_error TEXT,

  -- Tasks geradas a partir da transcrição
  generated_tasks JSONB DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ritual_sessions_org_week ON ritual_sessions(org_id, week_start);
CREATE INDEX IF NOT EXISTS idx_ritual_sessions_status ON ritual_sessions(status);

ALTER TABLE ritual_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members view ritual" ON ritual_sessions;
CREATE POLICY "Org members view ritual" ON ritual_sessions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = ritual_sessions.org_id AND om.profile_id = auth.uid() AND om.is_active = true));

DROP POLICY IF EXISTS "Org members manage ritual" ON ritual_sessions;
CREATE POLICY "Org members manage ritual" ON ritual_sessions FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = ritual_sessions.org_id AND om.profile_id = auth.uid() AND om.is_active = true))
WITH CHECK (EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = ritual_sessions.org_id AND om.profile_id = auth.uid() AND om.is_active = true));

CREATE OR REPLACE FUNCTION update_ritual_sessions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_ritual_sessions_updated_at ON ritual_sessions;
CREATE TRIGGER trg_ritual_sessions_updated_at BEFORE UPDATE ON ritual_sessions
FOR EACH ROW EXECUTE FUNCTION update_ritual_sessions_updated_at();

-- Diagnóstico por loja dentro de uma sessão
CREATE TABLE IF NOT EXISTS ritual_store_diagnostics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ritual_session_id UUID NOT NULL REFERENCES ritual_sessions(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  pipeline_state_id UUID REFERENCES weekly_pipeline_states(id) ON DELETE SET NULL,

  -- Notas do diagnóstico
  notes TEXT,
  approved_actions JSONB DEFAULT '[]'::jsonb,
  skipped BOOLEAN DEFAULT FALSE,
  skip_reason TEXT,

  -- Chat IA (mensagens trocadas durante o diagnóstico)
  chat_messages JSONB DEFAULT '[]'::jsonb,

  -- Timestamps
  discussed_at TIMESTAMPTZ DEFAULT NOW(),
  duration_seconds INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (ritual_session_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_ritual_diagnostics_session ON ritual_store_diagnostics(ritual_session_id);
CREATE INDEX IF NOT EXISTS idx_ritual_diagnostics_store ON ritual_store_diagnostics(store_id);

ALTER TABLE ritual_store_diagnostics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members view ritual diagnostics" ON ritual_store_diagnostics;
CREATE POLICY "Org members view ritual diagnostics" ON ritual_store_diagnostics FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM ritual_sessions rs JOIN org_members om ON om.org_id = rs.org_id WHERE rs.id = ritual_store_diagnostics.ritual_session_id AND om.profile_id = auth.uid() AND om.is_active = true));

DROP POLICY IF EXISTS "Org members manage ritual diagnostics" ON ritual_store_diagnostics;
CREATE POLICY "Org members manage ritual diagnostics" ON ritual_store_diagnostics FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM ritual_sessions rs JOIN org_members om ON om.org_id = rs.org_id WHERE rs.id = ritual_store_diagnostics.ritual_session_id AND om.profile_id = auth.uid() AND om.is_active = true))
WITH CHECK (EXISTS (SELECT 1 FROM ritual_sessions rs JOIN org_members om ON om.org_id = rs.org_id WHERE rs.id = ritual_store_diagnostics.ritual_session_id AND om.profile_id = auth.uid() AND om.is_active = true));

DROP TRIGGER IF EXISTS trg_ritual_diagnostics_updated_at ON ritual_store_diagnostics;
CREATE TRIGGER trg_ritual_diagnostics_updated_at BEFORE UPDATE ON ritual_store_diagnostics
FOR EACH ROW EXECUTE FUNCTION update_ritual_sessions_updated_at();

-- Bucket pra gravações Fathom
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ritual-recordings', 'ritual-recordings', false, 524288000, ARRAY['video/mp4', 'video/quicktime', 'audio/mpeg', 'audio/mp3', 'audio/wav'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Ritual recordings upload by org" ON storage.objects;
CREATE POLICY "Ritual recordings upload by org" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ritual-recordings' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Ritual recordings read by org" ON storage.objects;
CREATE POLICY "Ritual recordings read by org" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'ritual-recordings' AND auth.uid() IS NOT NULL);

COMMENT ON TABLE ritual_sessions IS
  'Sessões do ritual semanal de acompanhamento (sexta 14h-16h). Discute lojas em Etapa 1.';
COMMENT ON TABLE ritual_store_diagnostics IS
  'Diagnóstico de cada loja dentro de uma sessão de ritual. Captura notas, ações aprovadas, chat IA.';
