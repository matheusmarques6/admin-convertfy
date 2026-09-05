-- ============================================================================
-- Módulo Transcrições (set/2026) — biblioteca de vídeo/áudio virada texto
-- pesquisável, com timestamps, locutores e ponte para a base da ConvertIA.
--
--   transcricoes_colecoes    árvore de coleções (pasta), jargão e modelo
--   transcricoes             a peça: origem, estado do pipeline, texto
--   transcricoes_blocos      a fala com início/fim e locutor (fonte da busca)
--   transcricoes_locutores   de/para do rótulo do provedor para o nome humano
--   transcricoes_chunks      recorte semântico + embedding (recuperação)
--   transcricoes_regras      sugestão de coleção por padrão no título/URL
--   transcricoes_worker      heartbeat do worker (rodapé "fila sincronizada")
--
-- Nomes prefixados: a especificação usa `colecoes`/`blocos`/`chunks` crus,
-- mas o schema público tem ~200 tabelas e TODO módulo daqui prefixa
-- (crm_*, conteudo_*, ai_*, email_*). `chunks` cru colidiria com a próxima
-- base vetorial que aparecer.
--
-- SEM campo de confiança, de propósito: o endpoint de transcrição não
-- devolve confiança por bloco (o que existe em verbose_json é `avg_logprob`,
-- log-probabilidade de token, que não é porcentagem de acerto). Derivar
-- "96% de confiança" dali seria uma métrica inventada — pior que nenhuma,
-- porque leva a decidir com base nela.
--
-- RLS: toda policy declara TO authenticated + escopo por org (regra do
-- incidente ago/2026 — "a API valida" não protege o /rest/v1 direto).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ── Coleções ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS transcricoes_colecoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  pai_id UUID REFERENCES transcricoes_colecoes(id) ON DELETE CASCADE,
  -- Faísca: só o que está aqui entra na recuperação da ConvertIA.
  na_base_de_conhecimento BOOLEAN NOT NULL DEFAULT false,
  -- Jargão do curso; vira `phraseList` na chamada de transcrição. É o
  -- parâmetro que mais afeta qualidade: sem ele "Omnisend" vira "omni send"
  -- e a busca nunca encontra.
  phrase_list TEXT[] NOT NULL DEFAULT '{}',
  modelo TEXT NOT NULL DEFAULT 'microsoft/mai-transcribe-2',
  -- 'inbox' = a coleção reservada "Não organizadas" (1 por org).
  reservada TEXT CHECK (reservada IS NULL OR reservada IN ('inbox')),
  ordem INTEGER NOT NULL DEFAULT 0,
  criado_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tr_colecoes_org ON transcricoes_colecoes(org_id, ordem, nome);
CREATE INDEX IF NOT EXISTS idx_tr_colecoes_pai ON transcricoes_colecoes(pai_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tr_colecoes_reservada
  ON transcricoes_colecoes(org_id, reservada) WHERE reservada IS NOT NULL;

-- ── Transcrição ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS transcricoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  colecao_id UUID REFERENCES transcricoes_colecoes(id) ON DELETE SET NULL,

  titulo TEXT NOT NULL,
  plataforma TEXT NOT NULL CHECK (plataforma IN ('youtube', 'instagram', 'tiktok', 'upload')),
  canal TEXT,
  url_original TEXT,
  -- Sem rastreadores, youtu.be expandido, sem fragmento: é a chave de dedupe.
  url_normalizada TEXT,
  publicado_em TIMESTAMPTZ,
  duracao_seg INTEGER,

  thumb_path TEXT,
  media_path TEXT,
  -- Caminho do áudio extraído; guardado para retomar da transcrição sem
  -- rebaixar nem reconverter.
  audio_path TEXT,
  audio_bytes BIGINT,
  idioma TEXT NOT NULL DEFAULT 'pt-BR',
  -- Modelo REALMENTE usado (o painel de informações lê daqui, nunca fixo).
  modelo TEXT,

  status TEXT NOT NULL DEFAULT 'processando'
    CHECK (status IN ('aguardando', 'processando', 'pronta', 'erro')),
  -- 0 baixando · 1 extraindo áudio · 2 transcrevendo · 3 indexando
  etapa SMALLINT NOT NULL DEFAULT 0 CHECK (etapa BETWEEN 0 AND 3),
  -- NULL quando a etapa não é mensurável (a transcrição é uma chamada só).
  progresso SMALLINT CHECK (progresso IS NULL OR progresso BETWEEN 0 AND 100),
  erro_msg TEXT,
  erro_codigo TEXT,
  tentativas SMALLINT NOT NULL DEFAULT 0,
  -- Backoff exponencial: bloqueio de IP em plataforma é rotina, não exceção.
  proxima_tentativa_em TIMESTAMPTZ,
  -- Claim atômico: dois workers não podem processar a mesma linha.
  claim_token UUID,
  claim_expira_em TIMESTAMPTZ,

  locutores_qtd INTEGER,
  texto_completo TEXT,
  -- [{ s, titulo }] — marcadores da barra do player e índice navegável.
  topicos JSONB,
  tags TEXT[] NOT NULL DEFAULT '{}',

  custo_usd NUMERIC(10, 5),
  tempo_processamento_seg INTEGER,
  -- Estado da indexação para a ConvertIA (independente do status geral).
  indexado_em TIMESTAMPTZ,

  criado_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluido_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tr_org_criado ON transcricoes(org_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_tr_status ON transcricoes(status, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_tr_colecao ON transcricoes(colecao_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tr_url_norm
  ON transcricoes(org_id, url_normalizada) WHERE url_normalizada IS NOT NULL;
-- Fila do worker: o que está esperando vez, na ordem de chegada.
CREATE INDEX IF NOT EXISTS idx_tr_fila
  ON transcricoes(status, proxima_tentativa_em NULLS FIRST, criado_em)
  WHERE status IN ('aguardando', 'processando');
CREATE INDEX IF NOT EXISTS idx_tr_titulo_trgm
  ON transcricoes USING gin (titulo gin_trgm_ops);

-- ── Blocos de fala ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS transcricoes_blocos (
  id BIGSERIAL PRIMARY KEY,
  transcricao_id UUID NOT NULL REFERENCES transcricoes(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  s NUMERIC NOT NULL,
  fim NUMERIC NOT NULL,
  -- Rótulo ORIGINAL do provedor (speaker_0). O nome humano vive em
  -- transcricoes_locutores, para que renomear não reescreva N mil linhas.
  locutor TEXT,
  texto TEXT NOT NULL,
  editado BOOLEAN NOT NULL DEFAULT false,
  editado_em TIMESTAMPTZ,
  editado_por UUID REFERENCES profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_tr_blocos_ordem ON transcricoes_blocos(transcricao_id, s);
CREATE INDEX IF NOT EXISTS idx_tr_blocos_fts
  ON transcricoes_blocos USING gin (to_tsvector('portuguese', texto));
CREATE INDEX IF NOT EXISTS idx_tr_blocos_org ON transcricoes_blocos(org_id);

-- ── Locutores ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS transcricoes_locutores (
  id BIGSERIAL PRIMARY KEY,
  transcricao_id UUID NOT NULL REFERENCES transcricoes(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- O que o provedor devolveu; nunca é reescrito, para que reprocessar
  -- consiga remapear os nomes que o humano deu.
  rotulo_original TEXT NOT NULL,
  nome TEXT NOT NULL,
  cor SMALLINT NOT NULL DEFAULT 0,
  UNIQUE (transcricao_id, rotulo_original)
);

-- ── Chunks + embeddings ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS transcricoes_chunks (
  id BIGSERIAL PRIMARY KEY,
  transcricao_id UUID NOT NULL REFERENCES transcricoes(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  s NUMERIC NOT NULL,
  fim NUMERIC NOT NULL,
  -- Linha gerada por LLM situando o trecho na aula. "e aí você aumenta pra
  -- 3 dias" é inútil sem saber que o assunto era carrinho abandonado; o
  -- embedding é feito sobre contexto + texto por causa disso.
  contexto TEXT,
  texto TEXT NOT NULL,
  embedding vector(1536),
  -- Editar uma fala marca os chunks que cobrem o intervalo: sem isso a
  -- base de conhecimento diverge do texto na tela, em silêncio.
  desatualizado BOOLEAN NOT NULL DEFAULT false,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tr_chunks_transcricao ON transcricoes_chunks(transcricao_id, s);
CREATE INDEX IF NOT EXISTS idx_tr_chunks_pendentes
  ON transcricoes_chunks(org_id) WHERE embedding IS NULL OR desatualizado = true;

-- ── Regras de sugestão de coleção ───────────────────────────────────────
-- A heurística (aula/academy, klaviyo/shopify, reel/tiktok, call/ritual)
-- não vive hardcoded no componente: o time muda o vocabulário sem deploy.

CREATE TABLE IF NOT EXISTS transcricoes_regras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Termos casados sem acento e sem caixa contra título + canal + URL.
  termos TEXT[] NOT NULL,
  colecao_id UUID NOT NULL REFERENCES transcricoes_colecoes(id) ON DELETE CASCADE,
  -- Plataforma opcional: "reel" só sugere se vier do Instagram.
  plataforma TEXT CHECK (plataforma IS NULL OR plataforma IN ('youtube', 'instagram', 'tiktok', 'upload')),
  prioridade INTEGER NOT NULL DEFAULT 0,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tr_regras_org ON transcricoes_regras(org_id, prioridade DESC);

-- ── Heartbeat do worker ─────────────────────────────────────────────────
-- O rodapé "Fila sincronizada às HH:MM" precisa de um fato, não de um
-- relógio no cliente. Heartbeat velho = o rodapé avisa que o serviço caiu.

CREATE TABLE IF NOT EXISTS transcricoes_worker (
  id TEXT PRIMARY KEY,
  visto_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  versao TEXT,
  em_processamento INTEGER NOT NULL DEFAULT 0,
  detalhe JSONB
);

-- ── Carimbo de atualização ──────────────────────────────────────────────
-- clock_timestamp() e não now(): now() é o início da TRANSAÇÃO e não anda
-- dentro dela (mesma armadilha do módulo Conteúdo).

CREATE OR REPLACE FUNCTION transcricoes_touch_atualizado_em()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  NEW.atualizado_em = clock_timestamp();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_tr_colecoes_touch ON transcricoes_colecoes;
CREATE TRIGGER trg_tr_colecoes_touch BEFORE UPDATE ON transcricoes_colecoes
  FOR EACH ROW EXECUTE FUNCTION transcricoes_touch_atualizado_em();

-- ── RLS ─────────────────────────────────────────────────────────────────

DO $do$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'transcricoes_colecoes', 'transcricoes', 'transcricoes_blocos',
    'transcricoes_locutores', 'transcricoes_chunks', 'transcricoes_regras'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_org', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated
         USING (is_admin() OR org_id IN (
           SELECT om.org_id FROM org_members om
           WHERE om.profile_id = auth.uid() AND om.is_active = true))
         WITH CHECK (is_admin() OR org_id IN (
           SELECT om.org_id FROM org_members om
           WHERE om.profile_id = auth.uid() AND om.is_active = true))',
      t || '_org', t);
  END LOOP;
END $do$;

-- O heartbeat não tem org: é infraestrutura, leitura para autenticado e
-- escrita só pelo service role (que ignora RLS).
ALTER TABLE transcricoes_worker ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS transcricoes_worker_read ON transcricoes_worker;
CREATE POLICY transcricoes_worker_read ON transcricoes_worker
  FOR SELECT TO authenticated USING (is_org_member());

-- ── Busca semântica nos chunks ──────────────────────────────────────────
-- SECURITY INVOKER: a RLS da tabela continua valendo, então a função não
-- vaza chunk de outra org mesmo chamada com a anon key.

CREATE OR REPLACE FUNCTION transcricoes_busca_semantica(
  query_embedding vector(1536),
  p_org_id UUID,
  match_count INTEGER DEFAULT 12,
  p_colecao_ids UUID[] DEFAULT NULL,
  somente_base BOOLEAN DEFAULT false
)
RETURNS TABLE (
  chunk_id BIGINT,
  transcricao_id UUID,
  titulo TEXT,
  s NUMERIC,
  fim NUMERIC,
  contexto TEXT,
  texto TEXT,
  similaridade DOUBLE PRECISION
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
  SELECT c.id, c.transcricao_id, t.titulo, c.s, c.fim, c.contexto, c.texto,
         1 - (c.embedding <=> query_embedding) AS similaridade
  FROM transcricoes_chunks c
  JOIN transcricoes t ON t.id = c.transcricao_id
  LEFT JOIN transcricoes_colecoes col ON col.id = t.colecao_id
  WHERE c.org_id = p_org_id
    AND c.embedding IS NOT NULL
    AND t.status = 'pronta'
    AND (p_colecao_ids IS NULL OR t.colecao_id = ANY (p_colecao_ids))
    AND (NOT somente_base OR col.na_base_de_conhecimento = true)
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$fn$;

-- ── Buckets ─────────────────────────────────────────────────────────────
-- Mídia privada (4 GB, o limite do upload resumível). Thumbs em bucket
-- próprio e privado: URL assinada é o que a biblioteca serve.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'transcricoes-media', 'transcricoes-media', false, 4294967296,
  ARRAY['video/mp4','video/quicktime','video/x-matroska','video/webm',
        'audio/mpeg','audio/mp4','audio/x-m4a','audio/wav','audio/x-wav','audio/flac','audio/ogg',
        'application/octet-stream']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'transcricoes-thumbs', 'transcricoes-thumbs', false, 5242880,
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Leitura/escrita pelo membro da org; o caminho começa com `org-<uuid>/`.
DO $do$
DECLARE b TEXT;
BEGIN
  FOREACH b IN ARRAY ARRAY['transcricoes-media', 'transcricoes-thumbs'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', b || '_rw');
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects FOR ALL TO authenticated
         USING (bucket_id = %L AND (
           is_admin() OR EXISTS (
             SELECT 1 FROM org_members om
             WHERE om.profile_id = auth.uid() AND om.is_active = true
               AND split_part(name, ''/'', 1) = ''org-'' || om.org_id::text)))
         WITH CHECK (bucket_id = %L AND (
           is_admin() OR EXISTS (
             SELECT 1 FROM org_members om
             WHERE om.profile_id = auth.uid() AND om.is_active = true
               AND split_part(name, ''/'', 1) = ''org-'' || om.org_id::text)))',
      b || '_rw', b, b);
  END LOOP;
END $do$;

-- ── Realtime ────────────────────────────────────────────────────────────
-- Só a tabela `transcricoes`: o card acompanha etapa/progresso/erro. Blocos
-- e chunks mudam em lote e não têm consumidor ao vivo.

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'transcricoes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE transcricoes;
  END IF;
END $do$;

-- ============================================================================
-- RPCs (migration 20261122_transcricoes_rpcs, mantidas aqui para o arquivo
-- ser replayável de ponta a ponta).
-- ============================================================================

-- Contagem direta por coleção (a recursiva é somada na aplicação: um SQL
-- recursivo por nó daria N+1 consultas numa árvore de três níveis).
CREATE OR REPLACE FUNCTION transcricoes_contagem_por_colecao(p_org_id UUID)
RETURNS TABLE (colecao_id UUID, total BIGINT)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $fn$
  SELECT t.colecao_id, count(*)::bigint
  FROM transcricoes t
  WHERE t.org_id = p_org_id AND t.colecao_id IS NOT NULL
  GROUP BY t.colecao_id;
$fn$;

-- Busca EXATA dentro das falas. Em `blocos` e não em `texto_completo` de
-- propósito: o bloco já carrega o `s`, então o timestamp sai de graça — e o
-- requisito é devolver o offset em segundos, não só o id do item.
CREATE OR REPLACE FUNCTION transcricoes_busca_exata(
  p_org_id UUID, p_termo TEXT, p_limite INTEGER DEFAULT 40, p_colecao_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  transcricao_id UUID, titulo TEXT, plataforma TEXT, thumb_path TEXT,
  bloco_id BIGINT, s NUMERIC, locutor TEXT, trecho TEXT, rank REAL
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $fn$
  WITH q AS (SELECT websearch_to_tsquery('portuguese', p_termo) AS tsq)
  SELECT b.transcricao_id, t.titulo, t.plataforma, t.thumb_path, b.id, b.s, b.locutor,
         ts_headline('portuguese', b.texto, q.tsq,
           'StartSel=<mark>, StopSel=</mark>, MaxWords=42, MinWords=18, ShortWord=3, MaxFragments=1'),
         ts_rank(to_tsvector('portuguese', b.texto), q.tsq)
  FROM transcricoes_blocos b
  JOIN transcricoes t ON t.id = b.transcricao_id
  CROSS JOIN q
  WHERE b.org_id = p_org_id
    AND q.tsq IS NOT NULL
    AND to_tsvector('portuguese', b.texto) @@ q.tsq
    AND (p_colecao_ids IS NULL OR t.colecao_id = ANY (p_colecao_ids))
  ORDER BY ts_rank(to_tsvector('portuguese', b.texto), q.tsq) DESC, b.s ASC
  LIMIT p_limite;
$fn$;

-- Total de trechos (o contador do rodapé dos filtros sai daqui).
CREATE OR REPLACE FUNCTION transcricoes_conta_trechos(
  p_org_id UUID, p_termo TEXT, p_colecao_ids UUID[] DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $fn$
  WITH q AS (SELECT websearch_to_tsquery('portuguese', p_termo) AS tsq)
  SELECT count(*)::bigint
  FROM transcricoes_blocos b
  JOIN transcricoes t ON t.id = b.transcricao_id
  CROSS JOIN q
  WHERE b.org_id = p_org_id
    AND q.tsq IS NOT NULL
    AND to_tsvector('portuguese', b.texto) @@ q.tsq
    AND (p_colecao_ids IS NULL OR t.colecao_id = ANY (p_colecao_ids));
$fn$;

-- Claim atômico da fila. Sem isso, dois workers (ou duas execuções do cron
-- que se sobrepõem) processam a mesma linha e a transcrição é cobrada duas
-- vezes.
CREATE OR REPLACE FUNCTION transcricoes_claim(
  p_token UUID, p_ttl_seg INTEGER DEFAULT 900, p_limite INTEGER DEFAULT 1
)
RETURNS SETOF transcricoes
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
  UPDATE transcricoes SET
    claim_token = p_token,
    claim_expira_em = now() + make_interval(secs => p_ttl_seg),
    status = 'processando'
  WHERE id IN (
    SELECT t.id FROM transcricoes t
    WHERE t.status IN ('aguardando', 'processando')
      AND (t.proxima_tentativa_em IS NULL OR t.proxima_tentativa_em <= now())
      AND (t.claim_token IS NULL OR t.claim_expira_em IS NULL OR t.claim_expira_em < now())
    ORDER BY t.criado_em ASC
    LIMIT p_limite
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$fn$;

REVOKE ALL ON FUNCTION transcricoes_claim(UUID, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
