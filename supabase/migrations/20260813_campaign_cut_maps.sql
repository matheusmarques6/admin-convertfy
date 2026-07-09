-- ─────────────────────────────────────────────────────────────────────
-- Central de Campanhas — Mapa de Cortes do email (etapa IMPLEMENTAÇÃO)
--
-- Na etapa de implementação do design de campanha, a task "Corte modelo"
-- (slug impl_corte_modelo, seed em campaign-design-bootstrap.service.ts)
-- abre um modal onde o implementador sobe a IMAGEM do email finalizado e
-- marca as "portas" (fatias horizontais contíguas) + áreas especiais.
-- O mapa é ÚNICO POR CAMPANHA (todas as lojas usam o mesmo layout) e é
-- consumido depois pelas tasks "Subir e-mails - <idioma>" (mesma
-- suggestion_id).
--
-- Coordenadas em FRAÇÕES 0..1 da dimensão natural da imagem
-- (independente de resolução; image_natural_w/h permitem reconverter
-- para px no recorte). Shapes em src/types/campaign-cuts.ts.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS campaign_cut_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  suggestion_id UUID NOT NULL REFERENCES campaign_suggestions(id) ON DELETE CASCADE,
  -- Task "Corte modelo" que criou/editou o mapa. Informativo/auditoria.
  task_id UUID,
  -- Asset da imagem do email finalizado (bucket onboarding-visual-assets).
  image_url TEXT,
  image_path TEXT,
  image_filename TEXT,
  image_natural_w INTEGER,
  image_natural_h INTEGER,
  -- Portas: [{ id, label, type, y0, y1 }] — frações 0..1 da ALTURA,
  -- contíguas cobrindo 0..1. Validação estrita no approve
  -- (campaign-cut-map.service.ts::validateCutMap).
  portas JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Áreas especiais: [{ id, label, x, y, w, h }] — frações 0..1.
  special_areas JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Editar um mapa aprovado rebaixa para 'draft' (Tela 2 só lê approved).
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 1 mapa por campanha: chave que a Tela 2 (subir e-mails) lê.
  UNIQUE (suggestion_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_cut_maps_org
  ON campaign_cut_maps(org_id);

-- ── updated_at trigger (reusa a função do campaign_central) ───────────
-- campaign_central_set_updated_at() definida em 20260716_campaign_central.sql.
DROP TRIGGER IF EXISTS trg_campaign_cut_maps_updated ON campaign_cut_maps;
CREATE TRIGGER trg_campaign_cut_maps_updated
  BEFORE UPDATE ON campaign_cut_maps
  FOR EACH ROW EXECUTE FUNCTION campaign_central_set_updated_at();

-- ── RLS (padrão campaign_image_batches: org isolation via org_members) ─
ALTER TABLE campaign_cut_maps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaign_cut_maps_org" ON campaign_cut_maps;
CREATE POLICY "campaign_cut_maps_org" ON campaign_cut_maps
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE profile_id = auth.uid() AND is_active = true)
  );
