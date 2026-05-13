-- Tutorial CMS — paginas publicas via tutorial_token
-- Seed da pipeline (com 7 colunas + templates JSONB) acontece no
-- service `onboarding-bootstrap.service.ts` (idempotente, lazy por org).

CREATE TABLE IF NOT EXISTS tutorial_pages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','published')),
  current_version INTEGER DEFAULT 1,
  created_by UUID REFERENCES profiles(id),
  updated_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, slug)
);

CREATE TABLE IF NOT EXISTS tutorial_blocks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id UUID NOT NULL REFERENCES tutorial_pages(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('text','video','image','step','code','faq','cta_whatsapp')),
  position INTEGER NOT NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(page_id, position)
);

CREATE INDEX IF NOT EXISTS idx_tutorial_blocks_page ON tutorial_blocks(page_id, position);

ALTER TABLE tutorial_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutorial_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tut_pages_select" ON tutorial_pages;
CREATE POLICY "tut_pages_select" ON tutorial_pages FOR SELECT USING (
  org_id IN (SELECT org_id FROM org_members WHERE profile_id=auth.uid() AND is_active=true)
);
DROP POLICY IF EXISTS "tut_pages_manage" ON tutorial_pages;
CREATE POLICY "tut_pages_manage" ON tutorial_pages FOR ALL USING (
  EXISTS (SELECT 1 FROM org_members WHERE profile_id=auth.uid() AND org_id=tutorial_pages.org_id AND role IN ('owner','manager','coo','ops') AND is_active=true)
);

DROP POLICY IF EXISTS "tut_blocks_all" ON tutorial_blocks;
CREATE POLICY "tut_blocks_all" ON tutorial_blocks FOR ALL USING (
  page_id IN (SELECT id FROM tutorial_pages WHERE org_id IN (SELECT org_id FROM org_members WHERE profile_id=auth.uid() AND is_active=true))
);

DROP TRIGGER IF EXISTS trg_tut_pages_updated ON tutorial_pages;
CREATE TRIGGER trg_tut_pages_updated BEFORE UPDATE ON tutorial_pages FOR EACH ROW EXECUTE FUNCTION onboarding_set_updated_at();
DROP TRIGGER IF EXISTS trg_tut_blocks_updated ON tutorial_blocks;
CREATE TRIGGER trg_tut_blocks_updated BEFORE UPDATE ON tutorial_blocks FOR EACH ROW EXECUTE FUNCTION onboarding_set_updated_at();
