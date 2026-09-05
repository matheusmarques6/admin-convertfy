-- ============================================================================
-- Módulo Conteúdo (Dashboard Social + Estúdio de Carrosséis) — persistência
-- real. Substitui o localStorage/mock da primeira entrega (set/2026).
--
--   conteudo_documentos      carrossel do Estúdio (dados JSONB = Documento)
--   conteudo_brand_kits      brand kit por canal Instagram da org
--   conteudo_meus_templates  templates criados a partir de inspiração
--   conteudo_agenda          "Enviar para o calendário" (1 por documento)
--   conteudo_ig_media        mídias do Instagram + insights (cache/histórico)
--   conteudo_ig_daily        insights diários da conta (alcance, visitas…)
--
-- Perfil = canal Instagram (`crm_channels.type = 'instagram'`). Não existe
-- perfil fixo: quem conecta um canal ganha um perfil no módulo.
--
-- RLS: toda policy declara TO authenticated + escopo por org (regra do
-- incidente ago/2026 — "a API valida" não protege o /rest/v1).
-- ============================================================================

CREATE TABLE IF NOT EXISTS conteudo_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES crm_channels(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'pronto', 'agendado', 'publicado')),
  template_id TEXT,
  dados JSONB NOT NULL,
  criado_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conteudo_documentos_org
  ON conteudo_documentos(org_id, atualizado_em DESC);

CREATE TABLE IF NOT EXISTS conteudo_brand_kits (
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES crm_channels(id) ON DELETE CASCADE,
  kit JSONB NOT NULL,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, channel_id)
);

CREATE TABLE IF NOT EXISTS conteudo_meus_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  template_base TEXT,
  -- [{tipo, slotImagem, descricao?}] — a estrutura lida da inspiração
  estrutura JSONB NOT NULL,
  fidelidade INTEGER,
  usos INTEGER NOT NULL DEFAULT 0,
  criado_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conteudo_meus_templates_org
  ON conteudo_meus_templates(org_id, criado_em DESC);

CREATE TABLE IF NOT EXISTS conteudo_agenda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  documento_id UUID NOT NULL UNIQUE REFERENCES conteudo_documentos(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES crm_channels(id) ON DELETE SET NULL,
  data DATE NOT NULL,
  hora TIME NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conteudo_agenda_org_data ON conteudo_agenda(org_id, data);

CREATE TABLE IF NOT EXISTS conteudo_ig_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES crm_channels(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL,
  media_type TEXT,          -- IMAGE | VIDEO | CAROUSEL_ALBUM
  media_product_type TEXT,  -- FEED | REELS
  caption TEXT,
  permalink TEXT,
  media_url TEXT,
  thumbnail_url TEXT,
  published_at TIMESTAMPTZ,
  children_count INTEGER,   -- slides do carrossel
  like_count INTEGER,
  comments_count INTEGER,
  -- insights da mídia (Graph API /{media}/insights); NULL = não disponível
  reach INTEGER,
  saved INTEGER,
  shares INTEGER,
  follows INTEGER,
  profile_visits INTEGER,
  total_interactions INTEGER,
  views INTEGER,
  insights_at TIMESTAMPTZ,
  insights_error TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- classificação da casa (humana ou herdada do documento do Estúdio)
  pilar TEXT,
  molde TEXT,
  palavra_chave TEXT,
  documento_id UUID REFERENCES conteudo_documentos(id) ON DELETE SET NULL,
  UNIQUE (channel_id, media_id)
);
CREATE INDEX IF NOT EXISTS idx_conteudo_ig_media_org_pub
  ON conteudo_ig_media(org_id, published_at DESC);

CREATE TABLE IF NOT EXISTS conteudo_ig_daily (
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES crm_channels(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  reach INTEGER,
  profile_views INTEGER,
  follower_count INTEGER,
  accounts_engaged INTEGER,
  total_interactions INTEGER,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, day)
);
CREATE INDEX IF NOT EXISTS idx_conteudo_ig_daily_org_day ON conteudo_ig_daily(org_id, day);

-- ── updated_at ──────────────────────────────────────────────────────────
-- clock_timestamp() e não now(): `now()` é o início da TRANSAÇÃO e não anda
-- dentro dela. O `atualizado_em` é a versão que o editor usa para detectar
-- conflito de salvamento — precisa avançar a cada UPDATE, sempre.
CREATE OR REPLACE FUNCTION conteudo_touch_atualizado_em()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.atualizado_em = clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conteudo_documentos_touch ON conteudo_documentos;
CREATE TRIGGER trg_conteudo_documentos_touch
  BEFORE UPDATE ON conteudo_documentos
  FOR EACH ROW EXECUTE FUNCTION conteudo_touch_atualizado_em();

DROP TRIGGER IF EXISTS trg_conteudo_agenda_touch ON conteudo_agenda;
CREATE TRIGGER trg_conteudo_agenda_touch
  BEFORE UPDATE ON conteudo_agenda
  FOR EACH ROW EXECUTE FUNCTION conteudo_touch_atualizado_em();

DROP TRIGGER IF EXISTS trg_conteudo_brand_kits_touch ON conteudo_brand_kits;
CREATE TRIGGER trg_conteudo_brand_kits_touch
  BEFORE UPDATE ON conteudo_brand_kits
  FOR EACH ROW EXECUTE FUNCTION conteudo_touch_atualizado_em();

-- ── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE conteudo_documentos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE conteudo_brand_kits     ENABLE ROW LEVEL SECURITY;
ALTER TABLE conteudo_meus_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE conteudo_agenda         ENABLE ROW LEVEL SECURITY;
ALTER TABLE conteudo_ig_media       ENABLE ROW LEVEL SECURITY;
ALTER TABLE conteudo_ig_daily       ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'conteudo_documentos', 'conteudo_brand_kits', 'conteudo_meus_templates',
    'conteudo_agenda', 'conteudo_ig_media', 'conteudo_ig_daily'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_org', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated
         USING (is_admin() OR org_id IN (
           SELECT om.org_id FROM org_members om
           WHERE om.profile_id = auth.uid() AND om.is_active = true))
         WITH CHECK (is_admin() OR org_id IN (
           SELECT om.org_id FROM org_members om
           WHERE om.profile_id = auth.uid() AND om.is_active = true))',
      t || '_org', t
    );
  END LOOP;
END $$;
