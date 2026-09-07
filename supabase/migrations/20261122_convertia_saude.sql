-- ════════════════════════════════════════════════════════════════════
-- ConvertIA — saúde: saldo do provedor e lacunas da base
-- ════════════════════════════════════════════════════════════════════
--
-- Motivação (medida em 07/09/2026, com 20 respostas no histórico):
--
--   4 das 20 respostas morreram em HTTP 402 do OpenRouter — sem crédito.
--   As mesmas 402 zeraram os embeddings da base de conhecimento: 124 notas
--   ativas, 0 com vetor, porque `embedTexts` engole a falha em log.warn e o
--   sync continua reportando sucesso.
--
--   Nenhum desses fatos aparecia em tela alguma. O diagnóstico inteiro
--   passou por SQL. É o padrão de falha da casa: degradação silenciosa.
--
-- Duas tabelas, as duas para tornar o silêncio visível.
--
-- ── 1) Saldo do provedor ────────────────────────────────────────────
--
-- O saldo do OpenRouter é ponto único de falha de TODA a ConvertIA (chat,
-- embeddings da base, embeddings das transcrições, agentes de email) e
-- hoje só é conhecido quando alguma coisa quebra. Guardamos o histórico
-- para (a) alertar na transição, não a cada tick, e (b) responder "desde
-- quando" quando algo parar.

CREATE TABLE IF NOT EXISTS ai_provider_balance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'openrouter',
  -- Crédito ainda disponível (limite − usado). NULL quando a consulta
  -- falhou: guardar 0 seria inventar "acabou" a partir de um timeout.
  saldo_usd NUMERIC(12, 4),
  limite_usd NUMERIC(12, 4),
  usado_usd NUMERIC(12, 4),
  -- ok | baixo | esgotado | desconhecido — derivado no serviço, gravado
  -- aqui para a UI não recalcular régua (e não divergir dela).
  situacao TEXT NOT NULL DEFAULT 'desconhecido'
    CHECK (situacao IN ('ok', 'baixo', 'esgotado', 'desconhecido')),
  piso_usd NUMERIC(12, 4),
  erro TEXT,
  checado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_balance_recente
  ON ai_provider_balance(provider, checado_em DESC);

ALTER TABLE ai_provider_balance ENABLE ROW LEVEL SECURITY;

-- Saldo é da CONTA, não de uma organização: qualquer membro autenticado
-- pode LER (é o que o painel mostra), e só o service role escreve. Sem
-- policy de escrita: o cron usa a chave de serviço, que ignora RLS.
DROP POLICY IF EXISTS "ai_provider_balance_leitura" ON ai_provider_balance;
CREATE POLICY "ai_provider_balance_leitura" ON ai_provider_balance
  FOR SELECT TO authenticated
  USING (is_org_member());

COMMENT ON TABLE ai_provider_balance IS
  'ConvertIA: snapshot do saldo do OpenRouter por checagem do cron. saldo_usd NULL = a consulta falhou (ver erro), nunca "acabou".';

-- ── 2) Lacunas da base de conhecimento ──────────────────────────────
--
-- Quando `conhecimento_buscar` devolve zero, hoje o modelo responde de
-- memória e o furo some. Com um advisor ligado isso é pior: a resposta
-- sem lastro sai com a autoridade dele.
--
-- Cada busca vazia vira uma linha aqui. É o insumo de pauta para o vault
-- crescer: a pergunta que a casa não sabe responder por escrito.
--
-- NÃO reusa `ai_knowledge_gaps`: aquela tabela exige `agent_id` NOT NULL
-- referenciando `ai_agents`, de outro subsistema. Preencher com um id
-- fictício para caber é o tipo de gambiarra que ninguém entende depois.

CREATE TABLE IF NOT EXISTS convertia_lacunas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Qual base ficou sem resposta.
  fonte TEXT NOT NULL DEFAULT 'conhecimento'
    CHECK (fonte IN ('conhecimento', 'transcricoes')),
  -- Termo normalizado (minúsculas, sem acento, espaços colapsados) — é a
  -- chave de dedupe. A pergunta crua fica em `consultas`.
  consulta_normalizada TEXT NOT NULL CHECK (char_length(consulta_normalizada) BETWEEN 2 AND 300),
  consultas JSONB NOT NULL DEFAULT '[]'::jsonb,
  frequencia INTEGER NOT NULL DEFAULT 1 CHECK (frequencia > 0),
  -- Só a última: rastrear todas encheria a tabela sem melhorar a decisão.
  ultima_conversa_id UUID REFERENCES ai_chat_conversations(id) ON DELETE SET NULL,
  -- aberta = falta nota; resolvida = alguém escreveu; ignorada = não é
  -- assunto da casa (pergunta fora de escopo não é lacuna).
  status TEXT NOT NULL DEFAULT 'aberta'
    CHECK (status IN ('aberta', 'resolvida', 'ignorada')),
  resolvida_por UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolvida_em TIMESTAMPTZ,
  nota_path TEXT,
  primeira_vez_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultima_vez_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- O dedupe é por (org, fonte, termo): a mesma pergunta repetida sobe a
-- frequência em vez de criar linha nova — é a frequência que diz qual
-- lacuna vale escrever primeiro.
CREATE UNIQUE INDEX IF NOT EXISTS idx_convertia_lacunas_chave
  ON convertia_lacunas(org_id, fonte, consulta_normalizada);

CREATE INDEX IF NOT EXISTS idx_convertia_lacunas_abertas
  ON convertia_lacunas(org_id, status, frequencia DESC, ultima_vez_em DESC);

ALTER TABLE convertia_lacunas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "convertia_lacunas_org_members" ON convertia_lacunas;
CREATE POLICY "convertia_lacunas_org_members" ON convertia_lacunas
  FOR ALL TO authenticated
  USING (is_org_member())
  WITH CHECK (is_org_member());

COMMENT ON TABLE convertia_lacunas IS
  'ConvertIA: pergunta que a base de conhecimento (ou as transcrições) não respondeu. Dedupe por consulta normalizada; frequência ordena a pauta do vault.';

-- ── 3) Registro de lacuna: uma statement, sem corrida ───────────────
--
-- O registro roda dentro do turno do chat, em paralelo com outras tools.
-- "SELECT, senão INSERT" no app duplicaria a linha em corrida — e o
-- UNIQUE acima transformaria isso em erro dentro de uma tool que deveria
-- ser fail-open. ON CONFLICT resolve no banco.

CREATE OR REPLACE FUNCTION convertia_registrar_lacuna(
  p_org_id UUID,
  p_fonte TEXT,
  p_consulta_normalizada TEXT,
  p_consulta_original TEXT,
  p_conversa_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO convertia_lacunas (
    org_id, fonte, consulta_normalizada, consultas, ultima_conversa_id
  ) VALUES (
    p_org_id, p_fonte, p_consulta_normalizada,
    jsonb_build_array(p_consulta_original), p_conversa_id
  )
  ON CONFLICT (org_id, fonte, consulta_normalizada) DO UPDATE SET
    frequencia = convertia_lacunas.frequencia + 1,
    ultima_vez_em = NOW(),
    ultima_conversa_id = COALESCE(EXCLUDED.ultima_conversa_id, convertia_lacunas.ultima_conversa_id),
    -- Guarda as 5 formulações mais recentes: a mesma lacuna perguntada de
    -- cinco jeitos ensina mais sobre o vocabulário de quem pergunta do
    -- que a contagem sozinha. Sem teto, a coluna cresce sem limite.
    consultas = (
      SELECT jsonb_agg(v) FROM (
        SELECT v FROM jsonb_array_elements(
          jsonb_build_array(EXCLUDED.consultas -> 0) || convertia_lacunas.consultas
        ) AS t(v) LIMIT 5
      ) s
    ),
    -- Lacuna que volta a ser perguntada depois de "resolvida" reabre: ou
    -- a nota não ficou boa, ou não cobriu o caso.
    status = CASE WHEN convertia_lacunas.status = 'ignorada' THEN 'ignorada' ELSE 'aberta' END
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION convertia_registrar_lacuna IS
  'Registra (ou incrementa) uma busca sem resultado na base. ON CONFLICT porque roda dentro do turno, em paralelo com outras tools.';

REVOKE ALL ON FUNCTION convertia_registrar_lacuna(UUID, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION convertia_registrar_lacuna(UUID, TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;
