-- ============================================================
-- CONSOLIDADO — Épico CM (Curador, Montador e Hero), 2026-07-30.
--
-- Aplicar UMA vez no SQL Editor do Supabase, NA ORDEM ABAIXO, junto com o
-- deploy do código. Todas idempotentes: rodar de novo não causa erro.
--
-- Por que não dá para adiar nenhuma das bloqueantes:
--   20261052 — a migration 20261004 gravou o prompt ANTIGO do Curador no
--              banco. O código novo carrega esse prompt, não encontra
--              {{catalogo}} e falha com `catalogo_ausente` ANTES de invocar
--              o modelo. Toda geração morre na fase 1.
--   20261056 — o carregamento da variante da hero seleciona
--              `rendered_html_source_sha`. Sem a coluna a query falha, a
--              variante vem null, o enxerto não acontece e o agente de hero
--              roda sem referência.
--   20261055 — a listagem de logs seleciona as colunas de curadoria
--              derivadas nesta view.
--
-- Rollback: cada arquivo original tem a instrução no cabeçalho.
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- >>> 20261052_curador_ranking_catalogo.sql
-- BLOQUEANTE — sem isso o Curador falha com catalogo_ausente em TODA geração
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- Story CM-3 — o Curador rankeia até 3 por posição sobre o catálogo INTEIRO.
--
-- O que muda:
--   1. O pré-filtro determinístico (score objectives×3 / tones×2 / density×1,
--      top-8 por posição) SAIU do código. Ele decidia quem o LLM podia ver a
--      partir de três campos categóricos, antes de qualquer leitura de marca.
--   2. O catálogo da biblioteca passa a ir no SYSTEM prompt, na var
--      {{catalogo}}, em ordem estável — prefixo idêntico entre lojas, logo
--      cacheável (cache_control no OpenRouter para modelos Anthropic).
--   3. O output deixa de ser uma escolha por posição e passa a ser um
--      RANKING de até 3, em ordem de preferência, com `motivo` só na 1ª.
--   4. O `output_schema` (campos_copy) SAI do Curador: virou insumo
--      exclusivo do Montador (CM-4), que decide viabilidade de dados.
--
-- Corte seco: zera os prompts da config ativa para os defaults novos in-code
-- assumirem, e sobe max_tokens (12 posições × 3 UUIDs + 12 motivos ≈ 2,5k de
-- output; 2048 estouraria). Editar na aba Agentes volta a sobrescrever — mas
-- o system PRECISA conter {{catalogo}}: sem ele o serviço falha explicitamente
-- em vez de deixar o Curador escolher no vazio.
--
-- Rollback: reativar a versão anterior da row (histórico preservado por
-- versão) e reverter o código.
-- ============================================================

UPDATE email_agent_configs
SET system_prompt = '',
    user_template = '',
    max_tokens = 8192
WHERE agent_type = 'assembler_chooser'
  AND is_active = true;

-- Verificação
SELECT agent_type, model, temperature, max_tokens,
       length(system_prompt) AS system_chars,
       length(user_template) AS user_chars
FROM email_agent_configs
WHERE agent_type = 'assembler_chooser' AND is_active = true;


-- ─────────────────────────────────────────────────────────────
-- >>> 20261053_montador_selecao_conjunto.sql
-- Sem isso o Montador recebe o prompt de montagem com vars vazias e gera lixo caro
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- Story CM-4 — o Montador deixa de montar e passa a ESCOLHER.
--
-- Desde o CM-2 o documento é concatenado por código; o passo B do LLM tinha
-- ficado sem função. Agora ele ganha o papel que justifica a segunda passada:
-- recebe os até 3 finalistas de TODAS as posições de uma vez e escolhe UMA
-- por posição, olhando o EMAIL INTEIRO.
--
-- O que muda:
--   1. Prompt reescrito do zero. Sai toda instrução de montagem de HTML
--      (slots de imagem, tags canônicas, marcadores de bloco, container
--      600px, CSS variables, blocos sem variante). Entra o critério de
--      CONJUNTO, com as três razões fechadas para sair do rank 1 do Curador:
--      conjunto, viabilidade e histórico.
--   2. `motivo` é OBRIGATÓRIO quando rank != 1 e PROIBIDO quando rank = 1 —
--      mantém o output curto e evita justificativa inventada para confirmar
--      o óbvio.
--   3. max_tokens 16384 -> 2048: o output virou um JSON de ~500 tokens.
--   4. O `output_schema` das variantes passa a ser insumo EXCLUSIVO dele
--      (saiu do Curador na CM-3): é o que revela que um bloco vai exigir
--      campo obrigatório de cupom ou mais slots de produto do que a loja tem.
--
-- Modelo mantido em anthropic/claude-opus-4.8: ele se justificava por gerar
-- 40KB de HTML, e agora faz a decisão mais nobre do pipeline com output
-- curto — o custo cai sozinho. Se a telemetria de `desvios` mostrar que ele
-- quase sempre confirma o Curador, aí sim vale testar um modelo menor.
--
-- Corte seco: zera os prompts para os defaults novos in-code assumirem.
-- Rollback: reativar a versão anterior da row e reverter o código.
-- ============================================================

UPDATE email_agent_configs
SET system_prompt = '',
    user_template = '',
    max_tokens = 2048
WHERE agent_type = 'assembler'
  AND is_active = true;

-- Verificação
SELECT agent_type, model, temperature, max_tokens,
       length(system_prompt) AS system_chars,
       length(user_template) AS user_chars
FROM email_agent_configs
WHERE agent_type IN ('assembler_chooser', 'assembler') AND is_active = true
ORDER BY agent_type;


-- ─────────────────────────────────────────────────────────────
-- >>> 20261054_hero_report.sql
-- Opcional (o prompt do hero já está vazio desde a 20261049), mas idempotente
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- Story CM-5 — a hero passa a declarar o que descartou, e o modo `full_doc`
-- sai de cena.
--
-- O que muda no agente:
--   1. O contrato de output vira único: fragmento entre <CFY_HERO_OUTPUT>,
--      mais um relatório JSON entre <CFY_HERO_REPORT> com o que foi
--      descartado (imagem ausente, campos sem copy, linhas removidas, logo
--      escolhida). Hoje, quando ele apaga uma linha de CTA por falta de copy
--      — comportamento CORRETO e previsto no <empty_slot_rule> — ninguém
--      fica sabendo.
--   2. O modo `full_doc`, em que o agente devolvia o DOCUMENTO INTEIRO
--      quando a região não era localizável, foi REMOVIDO. Ele existia porque
--      o Montador LLM emitia marcadores malformados; com a montagem por
--      código (CM-2) os marcadores são sempre válidos. Manter um caminho que
--      autoriza a reescrita do email todo, para um fallback sem causa, era a
--      maior superfície de risco da cadeia.
--   3. O modo `montador` do prompt passa a ser declarado como fallback de
--      reference LEGADA (gravada antes do CM-2), não como caminho comum.
--
-- O relatório é OPCIONAL no parser: ausência ou JSON quebrado registram
-- `hero_report_missing` e o fragmento vale do mesmo jeito. Observabilidade
-- não derruba entrega.
--
-- Corte seco: zera os prompts para os defaults novos in-code assumirem.
-- Rollback: reativar a versão anterior da row e reverter o código.
-- ============================================================

UPDATE email_agent_configs
SET system_prompt = '',
    user_template = ''
WHERE agent_type = 'hero_section'
  AND is_active = true;

-- Verificação
SELECT agent_type, model, temperature, max_tokens,
       length(system_prompt) AS system_chars,
       length(user_template) AS user_chars
FROM email_agent_configs
WHERE agent_type = 'hero_section' AND is_active = true;


-- ─────────────────────────────────────────────────────────────
-- >>> 20261055_curation_signals_view.sql
-- BLOQUEANTE para a página de logs — a API pede colunas que só existem aqui
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- Story CM-7 — sinais de curadoria na listagem de logs.
--
-- A página de logs mostra `parsed_output` como JSON cru no drawer de
-- detalhe. Dados importantes já existem lá e ninguém vê: o
-- `candidates_excluded_untagged` (variantes ativas que ficaram fora do pool
-- por não ter placeholder) está gravado desde o épico Taguedor e nunca foi
-- exibido.
--
-- A listagem NÃO seleciona `parsed_output` de propósito: ele carrega
-- snapshots de HTML e pesaria dezenas de KB por linha. Então os sinais são
-- derivados aqui, na view, como colunas escalares — mesmo padrão que o
-- `is_qa_vision` já usa.
--
-- Nada aqui é erro: o email foi entregue. São sinais de CURADORIA —
-- biblioteca incompleta para uma seção, exemplo de acabamento velho,
-- ranking sendo corrigido. Por isso viram selo na linha, não notificação.
--
-- Idempotente (CREATE OR REPLACE). Rollback: recriar a view sem as 4
-- colunas finais.
-- ============================================================

CREATE OR REPLACE VIEW v_email_generation_logs AS
SELECT
  r.id,
  r.created_at,
  r.batch_id,
  r.agent,
  r.model,
  r.status,
  r.tokens_input,
  r.tokens_output,
  r.cost_cents,
  r.duration_ms,
  r.retry_count,
  r.error_message,
  r.input_vars,
  r.parsed_output,
  r.store_id,
  s.store_name,
  r.email_id,
  e.name        AS email_name,
  e.number      AS email_position,
  r.flow_id,
  f.flow_type,
  -- QA Vision derivado: marca runs de agent='qa' que executaram
  -- vision check (subetapa). qa.chain.ts grava parsed_output.vision_ran
  -- a partir desta migration. Rows antigas ficam false.
  (r.agent = 'qa' AND COALESCE((r.parsed_output->>'vision_ran')::boolean, false))
    AS is_qa_vision,

  -- ── Sinais de curadoria (CM-7) ────────────────────────────────────
  -- Todos com COALESCE + jsonb_typeof: run antigo sem o campo, ou com o
  -- campo em outro tipo, resolve para 0/false em vez de quebrar a view.

  -- Posições que saíram do email: sem variante na biblioteca (montagem) ou
  -- sem finalista válido depois do retry (Curador).
  CASE
    WHEN jsonb_typeof(r.parsed_output->'blocks_skipped') = 'array'
      THEN jsonb_array_length(r.parsed_output->'blocks_skipped')
    WHEN jsonb_typeof(r.parsed_output->'empty_blocks') = 'array'
      THEN jsonb_array_length(r.parsed_output->'empty_blocks')
    ELSE 0
  END AS curation_skipped_blocks,

  -- Variantes ativas SEM {{PLACEHOLDER}} no HTML efetivo: impreenchíveis
  -- pelo pipeline, ficam fora do pool. O objeto é {block_type: [nomes]} —
  -- soma os nomes de todos os tipos.
  CASE
    WHEN jsonb_typeof(r.parsed_output->'candidates_excluded_untagged') = 'object'
      THEN (
        SELECT COALESCE(SUM(
          CASE WHEN jsonb_typeof(v.value) = 'array'
            THEN jsonb_array_length(v.value) ELSE 0 END
        ), 0)
        FROM jsonb_each(r.parsed_output->'candidates_excluded_untagged') AS v
      )
    ELSE 0
  END AS curation_excluded_untagged,

  -- Posições em que o Montador não ficou com o 1º do Curador. Mede se o
  -- Curador está rankeando bem — não é problema por si.
  CASE
    WHEN jsonb_typeof(r.parsed_output->'desvios') = 'number'
      THEN (r.parsed_output->>'desvios')::int
    ELSE 0
  END AS curation_rank_deviations,

  -- Exemplo renderizado da variante descartado por estar desatualizado
  -- (hash de origem — CM-6). Enquanto aquela story não roda, fica sempre
  -- false: o campo não existe.
  COALESCE(
    (r.parsed_output->'rendered_reference'->>'stale')::boolean,
    false
  ) AS curation_rendered_stale

FROM email_generation_runs r
LEFT JOIN client_stores      s ON s.id = r.store_id
LEFT JOIN email_flow_emails  e ON e.id = r.email_id
LEFT JOIN email_flows        f ON f.id = r.flow_id;

-- View só é lida via createAdminClient (service role).


-- ─────────────────────────────────────────────────────────────
-- >>> 20261056_rendered_html_source_sha.sql
-- BLOQUEANTE para a hero — o select da variante inclui esta coluna
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- Story CM-6 — o exemplo renderizado da variante ganha hash de origem.
--
-- O campo `rendered_html` foi criado como "exemplo real do email
-- renderizado, colado manualmente" — a intenção é ser o PADRÃO DE ACABAMENTO
-- da variante. Mas não havia como saber se ele ainda corresponde ao `html`:
-- existe um único `updated_at` por linha, então salvar só a descrição já o
-- move sem invalidar o exemplo, e editar o `html` por SQL não move nada.
--
-- O hash responde exatamente a pergunta certa: "este renderizado foi feito a
-- partir DESTE html?". Gravado com sha256(html) no momento em que o
-- renderizado é salvo (rotas POST/PATCH de componentes).
--
-- Backfill deliberadamente NÃO calcula o hash das linhas existentes: não há
-- como saber de qual versão do `html` cada exemplo veio. NULL significa
-- "validade desconhecida" e é tratado como desatualizado pelo
-- `resolveRenderedReference` — o exemplo só volta a ser usado quando alguém
-- regravar, o que é o comportamento seguro.
--
-- Idempotente. Rollback: DROP COLUMN.
-- ============================================================

ALTER TABLE email_component_variants
  ADD COLUMN IF NOT EXISTS rendered_html_source_sha TEXT;

COMMENT ON COLUMN email_component_variants.rendered_html_source_sha IS
  'sha256 do `html` no momento em que `rendered_html` foi salvo (story CM-6). Hash diferente do html atual = exemplo desatualizado, não é enviado ao agente. NULL = cadastrado antes do hash existir (validade desconhecida, tratado como desatualizado).';

-- Verificação: quantas variantes têm exemplo renderizado e quantas já têm
-- hash. A diferença é a fila de recadastro.
SELECT
  COUNT(*)                                             AS total_ativas,
  COUNT(*) FILTER (WHERE COALESCE(rendered_html, '') <> '')      AS com_renderizado,
  COUNT(*) FILTER (WHERE rendered_html_source_sha IS NOT NULL)   AS com_hash
FROM email_component_variants
WHERE is_active = true;
