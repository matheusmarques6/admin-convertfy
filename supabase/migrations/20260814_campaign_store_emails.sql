-- ─────────────────────────────────────────────────────────────────────
-- Central de Campanhas — Emails por LOJA (etapa IMPLEMENTAÇÃO, Tela 2)
--
-- As tasks "Subir e-mails - <idioma>" (slugs impl_subir_ptbr/en/outras)
-- abrem um modal onde o implementador registra a IMAGEM do email de CADA
-- loja da campanha (import automático do Figma ou upload manual em massa)
-- e baixa as fatias cortadas nas MESMAS frações do mapa de cortes
-- aprovado (campaign_cut_maps, 20260813).
--
-- A linha é campanha×loja (as 3 tasks de idioma compartilham o progresso)
-- — por isso NÃO há task_id aqui.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS campaign_store_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  suggestion_id UUID NOT NULL REFERENCES campaign_suggestions(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  -- Asset da imagem do email da loja (bucket onboarding-visual-assets).
  image_url TEXT,
  image_path TEXT,
  image_filename TEXT,
  image_natural_w INTEGER,
  image_natural_h INTEGER,
  -- Origem da imagem: import do Figma ou upload manual.
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('figma', 'manual')),
  -- Node do frame no Figma quando source='figma' (re-export/diagnóstico).
  figma_node_id TEXT,
  -- pendente → andamento (automático no 1º upsert de imagem) → concluida
  -- (só via PATCH explícito do implementador).
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'andamento', 'concluida')),
  -- Ids de CutPort (campaign_cut_maps.portas) já baixados pelo implementador.
  -- Ids órfãos após reaprovação do mapa são simplesmente ignorados na UI.
  downloaded_ports JSONB NOT NULL DEFAULT '[]'::jsonb,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 1 email por campanha×loja: chave do upsert de import/upload.
  UNIQUE (suggestion_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_store_emails_org
  ON campaign_store_emails(org_id);
CREATE INDEX IF NOT EXISTS idx_campaign_store_emails_suggestion
  ON campaign_store_emails(suggestion_id);

-- ── updated_at trigger (reusa a função do campaign_central) ───────────
-- campaign_central_set_updated_at() definida em 20260716_campaign_central.sql.
DROP TRIGGER IF EXISTS trg_campaign_store_emails_updated ON campaign_store_emails;
CREATE TRIGGER trg_campaign_store_emails_updated
  BEFORE UPDATE ON campaign_store_emails
  FOR EACH ROW EXECUTE FUNCTION campaign_central_set_updated_at();

-- ── RLS (padrão campaign_cut_maps: org isolation via org_members) ─────
ALTER TABLE campaign_store_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaign_store_emails_org" ON campaign_store_emails;
CREATE POLICY "campaign_store_emails_org" ON campaign_store_emails
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE profile_id = auth.uid() AND is_active = true)
  );
