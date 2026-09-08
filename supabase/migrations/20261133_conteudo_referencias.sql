-- ============================================================================
-- Referências do Estúdio de Carrosséis (set/2026).
--
-- A ConvertIA escrevia carrosséis só com REGRA (pilares, moldes, limites,
-- compliance): nunca tinha visto um carrossel bom da casa. O material
-- existe — 9 carrosséis reais já sincronizados em `conteudo_ig_media` com
-- legenda e métricas (o melhor: 23 salvamentos, 19 compartilhamentos) — e
-- os que o time gosta chegam por upload. Esta tabela guarda a REFERÊNCIA:
-- os slides (imagens no Storage), a copy transcrita por slide, a legenda,
-- por que funciona e as métricas quando é post real. Servida à IA como
-- exemplo de ESTILO em gerar_estrutura/headlines/legenda/chat.
--
-- `ig_media_id` liga ao post real (SET NULL: apagar o cache do Instagram
-- não pode apagar a referência que alguém curou). UNIQUE parcial por
-- (org, ig_media_id): importar o mesmo post duas vezes é clique duplo, não
-- duas referências.
--
-- RLS: TO authenticated + escopo por org (regra do incidente ago/2026).
-- ============================================================================

CREATE TABLE IF NOT EXISTS conteudo_referencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  origem TEXT NOT NULL CHECK (origem IN ('instagram', 'upload')),
  ig_media_id UUID REFERENCES conteudo_ig_media(id) ON DELETE SET NULL,
  permalink TEXT,
  -- [{ordem, imagemUrl, tipo?, titulo?, corpo?}] — copy transcrita por slide
  slides JSONB NOT NULL DEFAULT '[]'::jsonb,
  legenda TEXT,
  palavra_chave TEXT,
  pilar TEXT,
  molde TEXT,
  -- ["bullet", …] — o que faz a peça funcionar (IA propõe, humano edita)
  por_que_funciona JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- {reach, saved, shares, follows, comments} quando é post real
  metricas JSONB,
  -- 1..3: quais entram primeiro no prompt quando há mais do que cabe
  peso INTEGER NOT NULL DEFAULT 1 CHECK (peso BETWEEN 1 AND 3),
  ativa BOOLEAN NOT NULL DEFAULT true,
  -- 'pendente' até a IA transcrever; 'lida' com copy; 'erro' com a mensagem
  transcricao TEXT NOT NULL DEFAULT 'pendente' CHECK (transcricao IN ('pendente', 'lida', 'erro')),
  transcricao_erro TEXT,
  criado_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conteudo_referencias_org
  ON conteudo_referencias(org_id, ativa, peso DESC, criado_em DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_conteudo_referencias_ig_media
  ON conteudo_referencias(org_id, ig_media_id)
  WHERE ig_media_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_conteudo_referencias_touch ON conteudo_referencias;
CREATE TRIGGER trg_conteudo_referencias_touch
  BEFORE UPDATE ON conteudo_referencias
  FOR EACH ROW EXECUTE FUNCTION conteudo_touch_atualizado_em();

ALTER TABLE conteudo_referencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conteudo_referencias_org ON conteudo_referencias;
CREATE POLICY conteudo_referencias_org ON conteudo_referencias FOR ALL TO authenticated
  USING (is_admin() OR org_id IN (
    SELECT om.org_id FROM org_members om
    WHERE om.profile_id = auth.uid() AND om.is_active = true))
  WITH CHECK (is_admin() OR org_id IN (
    SELECT om.org_id FROM org_members om
    WHERE om.profile_id = auth.uid() AND om.is_active = true));
