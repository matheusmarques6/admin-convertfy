-- ============================================================================
-- Conteúdo: banco de ideias, pipeline de Reels e assuntos em alta (set/2026).
--
-- As rotas /admin/conteudo/reels e /admin/conteudo/ideias eram placeholders
-- "em breve" — nenhuma tabela, nenhuma rota. O desenho aprovado (Claude
-- Design) define três coisas que precisam de estado:
--
-- 1. BANCO DE IDEIAS  — o que ainda não virou conteúdo, venha do time, das
--    trends ou da ConvertIA. Tem voto do time (quem acha que rende) SEPARADO
--    do score da IA: são julgamentos diferentes e a tela mostra os dois.
-- 2. PIPELINE DE REELS — ideia → roteiro → gravar → editar → agendado →
--    publicado. É um kanban: a ETAPA é coluna e a POSIÇÃO é a ordem dentro
--    dela, porque arrastar tem de ser estável entre sessões.
-- 3. ASSUNTOS EM ALTA — o painel "Em alta". **Não existe integração com a
--    API de trends do TikTok**; o que alimenta isto é a ConvertIA com busca
--    na web, e por isso `fonte_url` é obrigatório na prática (a tela mostra
--    o link) e `fonte` diz de onde veio. Inventar "TikTok Trends conectada"
--    seria a métrica inventada que este módulo evita.
--
-- Cadência por perfil (os "slots vazios" do Calendário) NÃO ganha tabela:
-- vive em `crm_channels.config.conteudo.cadencia`, ao lado da meta semanal
-- que já mora lá.
--
-- RLS: TO authenticated + escopo por org (regra do incidente ago/2026).
-- ============================================================================

-- ── Banco de ideias ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conteudo_ideias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  -- Classificação: NULL enquanto a IA não classificou. A tela conta os
  -- "sem funil" em vez de chutar um — é a mesma regra do pilar dos posts.
  funil TEXT CHECK (funil IN ('topo', 'meio', 'fundo')),
  formato TEXT CHECK (formato IN ('Carrossel', 'Reels', 'Vídeo', 'Imagem')),
  pilar TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  -- De onde veio: time (anotada à mão), convertia, trend, dashboard (post
  -- que performou), inbox (pergunta de cliente), cs (call).
  fonte TEXT NOT NULL DEFAULT 'time'
    CHECK (fonte IN ('time', 'convertia', 'trend', 'dashboard', 'inbox', 'cs')),
  -- O rótulo que a tela mostra ("ConvertIA · trend", "Dashboard · top post").
  fonte_detalhe TEXT,
  -- Score da IA (0..100). NULL = ainda não avaliada; a tela mostra o traço.
  score INTEGER CHECK (score BETWEEN 0 AND 100),
  -- Por que a IA gosta (texto do drawer). Sem avaliação, fica NULL.
  por_que TEXT,
  -- Molde sugerido ("Talking head 45s"), do vocabulário do Estúdio.
  molde TEXT,
  status TEXT NOT NULL DEFAULT 'banco'
    CHECK (status IN ('banco', 'enviada', 'arquivada')),
  -- Para onde foi quando saiu do banco.
  reel_id UUID,
  documento_id UUID REFERENCES conteudo_documentos(id) ON DELETE SET NULL,
  trend_id UUID,
  criado_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A ordenação da tela é score DESC (e votos, resolvido em código porque é
-- agregado). O índice serve a lista padrão: banco da org, mais forte primeiro.
CREATE INDEX IF NOT EXISTS idx_conteudo_ideias_org
  ON conteudo_ideias(org_id, status, score DESC NULLS LAST, criado_em DESC);

-- Voto do time: uma linha por pessoa por ideia. Contagem é COUNT, nunca uma
-- coluna incrementada — contador desnormalizado diverge na primeira corrida.
CREATE TABLE IF NOT EXISTS conteudo_ideia_votos (
  ideia_id UUID NOT NULL REFERENCES conteudo_ideias(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ideia_id, profile_id)
);

-- ── Pipeline de Reels ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conteudo_reels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  funil TEXT NOT NULL CHECK (funil IN ('topo', 'meio', 'fundo')),
  etapa TEXT NOT NULL DEFAULT 'ideias'
    CHECK (etapa IN ('ideias', 'roteiro', 'gravar', 'editar', 'agendado', 'publicado')),
  -- Tema/trend que originou ("Objetos falantes", "Plaquinhas").
  tema TEXT,
  -- Como vai ser gravado ("Talking head", "Plaquinhas", "Screen record + voz").
  formato TEXT,
  duracao_s INTEGER CHECK (duracao_s IS NULL OR duracao_s BETWEEN 1 AND 3600),
  score INTEGER CHECK (score BETWEEN 0 AND 100),
  -- Roteiro em blocos: [{papel, texto, segundos}]. Vazio até escrever.
  roteiro JSONB NOT NULL DEFAULT '[]'::jsonb,
  responsavel_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- Perfil que publica (canal do Instagram).
  canal_id UUID REFERENCES crm_channels(id) ON DELETE SET NULL,
  agendado_para TIMESTAMPTZ,
  publicado_em TIMESTAMPTZ,
  -- Quando publicado, o post real: as métricas da coluna PUBLICADO saem
  -- DAQUI (views, leads), nunca de número digitado.
  ig_media_id UUID REFERENCES conteudo_ig_media(id) ON DELETE SET NULL,
  -- Ordem dentro da coluna. Fracionário para inserir entre dois sem
  -- reescrever a coluna inteira a cada arrasto.
  posicao DOUBLE PRECISION NOT NULL DEFAULT 0,
  ideia_id UUID REFERENCES conteudo_ideias(id) ON DELETE SET NULL,
  criado_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conteudo_reels_org
  ON conteudo_reels(org_id, etapa, posicao, criado_em DESC);

-- A meta por funil é semanal: a consulta do progresso filtra por publicação
-- ou agendamento na janela.
CREATE INDEX IF NOT EXISTS idx_conteudo_reels_semana
  ON conteudo_reels(org_id, funil, publicado_em DESC NULLS LAST);

-- ── Assuntos em alta ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conteudo_trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  dificuldade TEXT NOT NULL DEFAULT 'medio'
    CHECK (dificuldade IN ('facil', 'medio', 'dificil')),
  categoria TEXT NOT NULL DEFAULT 'viral'
    CHECK (categoria IN ('viral', 'venda', 'educativo')),
  -- "Como usar: …" — a ponte entre o assunto e o negócio da casa.
  como_usar TEXT NOT NULL,
  -- Procedência. 'web' = ConvertIA com busca na internet (com o link);
  -- 'manual' = alguém digitou. NÃO existe fonte 'tiktok_api' aqui porque
  -- não existe essa integração.
  fonte TEXT NOT NULL DEFAULT 'web' CHECK (fonte IN ('web', 'manual')),
  -- O link que sustenta o assunto. Fonte de busca sem URL conferida é
  -- exatamente o que `verificarFontes` da triagem existe para impedir.
  fonte_url TEXT,
  fonte_titulo TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  -- Quando a rodada que gerou este assunto rodou (o "atualizado há 2h").
  gerado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conteudo_trends_org
  ON conteudo_trends(org_id, ativo, score DESC, gerado_em DESC);

-- Mesmo assunto gerado de novo é atualização, não duplicata na tela.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_conteudo_trends_titulo
  ON conteudo_trends(org_id, lower(titulo));

-- FK tardia: reels e ideias se apontam nos dois sentidos.
ALTER TABLE conteudo_ideias
  DROP CONSTRAINT IF EXISTS conteudo_ideias_reel_id_fkey;
ALTER TABLE conteudo_ideias
  ADD CONSTRAINT conteudo_ideias_reel_id_fkey
  FOREIGN KEY (reel_id) REFERENCES conteudo_reels(id) ON DELETE SET NULL;

ALTER TABLE conteudo_ideias
  DROP CONSTRAINT IF EXISTS conteudo_ideias_trend_id_fkey;
ALTER TABLE conteudo_ideias
  ADD CONSTRAINT conteudo_ideias_trend_id_fkey
  FOREIGN KEY (trend_id) REFERENCES conteudo_trends(id) ON DELETE SET NULL;

-- ── atualizado_em ──────────────────────────────────────────────────────────
-- `clock_timestamp()`, não `now()`: `now()` é o início da TRANSAÇÃO e não
-- anda dentro dela, e este carimbo detecta escrita concorrente.

DROP TRIGGER IF EXISTS trg_conteudo_ideias_touch ON conteudo_ideias;
CREATE TRIGGER trg_conteudo_ideias_touch
  BEFORE UPDATE ON conteudo_ideias
  FOR EACH ROW EXECUTE FUNCTION conteudo_touch_atualizado_em();

DROP TRIGGER IF EXISTS trg_conteudo_reels_touch ON conteudo_reels;
CREATE TRIGGER trg_conteudo_reels_touch
  BEFORE UPDATE ON conteudo_reels
  FOR EACH ROW EXECUTE FUNCTION conteudo_touch_atualizado_em();

DROP TRIGGER IF EXISTS trg_conteudo_trends_touch ON conteudo_trends;
CREATE TRIGGER trg_conteudo_trends_touch
  BEFORE UPDATE ON conteudo_trends
  FOR EACH ROW EXECUTE FUNCTION conteudo_touch_atualizado_em();

-- ── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE conteudo_ideias ENABLE ROW LEVEL SECURITY;
ALTER TABLE conteudo_ideia_votos ENABLE ROW LEVEL SECURITY;
ALTER TABLE conteudo_reels ENABLE ROW LEVEL SECURITY;
ALTER TABLE conteudo_trends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conteudo_ideias_org ON conteudo_ideias;
CREATE POLICY conteudo_ideias_org ON conteudo_ideias FOR ALL TO authenticated
  USING (is_admin() OR org_id IN (
    SELECT om.org_id FROM org_members om
    WHERE om.profile_id = auth.uid() AND om.is_active = true))
  WITH CHECK (is_admin() OR org_id IN (
    SELECT om.org_id FROM org_members om
    WHERE om.profile_id = auth.uid() AND om.is_active = true));

DROP POLICY IF EXISTS conteudo_reels_org ON conteudo_reels;
CREATE POLICY conteudo_reels_org ON conteudo_reels FOR ALL TO authenticated
  USING (is_admin() OR org_id IN (
    SELECT om.org_id FROM org_members om
    WHERE om.profile_id = auth.uid() AND om.is_active = true))
  WITH CHECK (is_admin() OR org_id IN (
    SELECT om.org_id FROM org_members om
    WHERE om.profile_id = auth.uid() AND om.is_active = true));

DROP POLICY IF EXISTS conteudo_trends_org ON conteudo_trends;
CREATE POLICY conteudo_trends_org ON conteudo_trends FOR ALL TO authenticated
  USING (is_admin() OR org_id IN (
    SELECT om.org_id FROM org_members om
    WHERE om.profile_id = auth.uid() AND om.is_active = true))
  WITH CHECK (is_admin() OR org_id IN (
    SELECT om.org_id FROM org_members om
    WHERE om.profile_id = auth.uid() AND om.is_active = true));

-- O voto não tem org_id próprio: o escopo vem da ideia. Escrever só o
-- PRÓPRIO voto (`profile_id = auth.uid()`) — sem isso, um membro poderia
-- votar em nome de outro e o ranking do time deixaria de ser do time.
DROP POLICY IF EXISTS conteudo_ideia_votos_org ON conteudo_ideia_votos;
CREATE POLICY conteudo_ideia_votos_org ON conteudo_ideia_votos FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM conteudo_ideias i
    WHERE i.id = conteudo_ideia_votos.ideia_id
      AND (is_admin() OR i.org_id IN (
        SELECT om.org_id FROM org_members om
        WHERE om.profile_id = auth.uid() AND om.is_active = true))))
  WITH CHECK (profile_id = auth.uid() AND EXISTS (
    SELECT 1 FROM conteudo_ideias i
    WHERE i.id = conteudo_ideia_votos.ideia_id
      AND (is_admin() OR i.org_id IN (
        SELECT om.org_id FROM org_members om
        WHERE om.profile_id = auth.uid() AND om.is_active = true))));
