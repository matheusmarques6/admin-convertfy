-- ============================================================
-- Cleanup: imagens-fantasma pre-GATE 2
--
-- Contexto:
--   Antes das migrations 20260626* introduzirem o GATE 2 (designer
--   confirma `store_brand_identity.confirmed_at` antes da fase 2),
--   muitos emails ja haviam passado por `rendering` e gravaram
--   `image_url`/`image_alt` em `email_blocks.content` + `html`/`qa_issues`
--   em `email_flow_emails`.
--
--   Re-disparar copy nao limpa esses artefatos (o callback do n8n nao
--   tocava neles ate este patch). Resultado: emails de lojas cuja brand
--   nunca foi confirmada exibem imagens antigas no preview do admin
--   como se tivessem sido geradas agora.
--
-- Acao:
--   Para todo email cuja loja NAO tem brand identity confirmada na
--   ultima versao (confirmed_at IS NULL OU loja sem row em
--   store_brand_identity), zerar:
--     - email_blocks.content -> remover image_url/image_alt/
--       image_last_generated_at/image_last_prompt
--     - email_flow_emails -> html=null, qa_issues='[]', failure_reason=null,
--       rendering_started_at=null, qa_started_at=null
--
-- Escopo decidido com o usuario:
--   ABRANGENTE — inclui emails em qualquer status (draft, copy_ready,
--   ready, etc). Lojas confirmadas NAO sao tocadas (filtro pela
--   ultima versao + confirmed_at).
--
-- Atencao:
--   `SET LOCAL session_replication_role = 'replica'` desabilita
--   triggers de aplicacao durante a transacao — necessario porque
--   updates em email_flow_emails podem disparar triggers de status
--   events / signals que nao queremos disparar aqui (e um cleanup,
--   nao uma transicao de fluxo).
--
-- Idempotencia:
--   Filtro EXISTS na chave de imagem + filtro de brand nao-confirmada.
--   Rodar 2x e no-op na segunda execucao.
-- ============================================================

BEGIN;

SET LOCAL session_replication_role = 'replica';

-- ── 1. Lojas SEM brand confirmada (ultima versao tem confirmed_at NULL
--       ou loja sem row em store_brand_identity)
WITH brand_latest AS (
  SELECT DISTINCT ON (store_id)
         store_id,
         confirmed_at
    FROM store_brand_identity
   ORDER BY store_id, version DESC
),
unconfirmed_stores AS (
  SELECT cs.id AS store_id
    FROM client_stores cs
    LEFT JOIN brand_latest bl ON bl.store_id = cs.id
   WHERE bl.confirmed_at IS NULL
),
target_emails AS (
  SELECT e.id AS email_id
    FROM email_flow_emails e
    JOIN email_flows f ON f.id = e.flow_id
    JOIN unconfirmed_stores u ON u.store_id = f.store_id
)

-- ── 2. Limpa email_blocks.content (chaves de imagem)
UPDATE email_blocks b
   SET content = (b.content
                  - 'image_url'
                  - 'image_alt'
                  - 'image_last_generated_at'
                  - 'image_last_prompt')
  FROM target_emails t
 WHERE b.email_id = t.email_id
   AND (
        b.content ? 'image_url'
     OR b.content ? 'image_alt'
     OR b.content ? 'image_last_generated_at'
     OR b.content ? 'image_last_prompt'
   );

-- ── 3. Limpa email_flow_emails (artefatos da fase 2)
WITH brand_latest AS (
  SELECT DISTINCT ON (store_id)
         store_id,
         confirmed_at
    FROM store_brand_identity
   ORDER BY store_id, version DESC
),
unconfirmed_stores AS (
  SELECT cs.id AS store_id
    FROM client_stores cs
    LEFT JOIN brand_latest bl ON bl.store_id = cs.id
   WHERE bl.confirmed_at IS NULL
),
target_emails AS (
  SELECT e.id AS email_id
    FROM email_flow_emails e
    JOIN email_flows f ON f.id = e.flow_id
    JOIN unconfirmed_stores u ON u.store_id = f.store_id
)
UPDATE email_flow_emails e
   SET html = NULL,
       qa_issues = '[]'::jsonb,
       failure_reason = NULL,
       rendering_started_at = NULL,
       qa_started_at = NULL
  FROM target_emails t
 WHERE e.id = t.email_id
   AND (
        e.html IS NOT NULL
     OR (e.qa_issues IS NOT NULL AND e.qa_issues <> '[]'::jsonb)
     OR e.failure_reason IS NOT NULL
     OR e.rendering_started_at IS NOT NULL
     OR e.qa_started_at IS NOT NULL
   );

SET LOCAL session_replication_role = 'origin';

COMMIT;

-- ============================================================
-- Verificacao (esperado: 0 linhas)
--
--   SELECT b.email_id, b.position
--   FROM email_blocks b
--   JOIN email_flow_emails e ON e.id = b.email_id
--   JOIN email_flows       f ON f.id = e.flow_id
--   LEFT JOIN LATERAL (
--     SELECT confirmed_at FROM store_brand_identity
--      WHERE store_id = f.store_id
--      ORDER BY version DESC LIMIT 1
--   ) bi ON true
--   WHERE bi.confirmed_at IS NULL
--     AND (b.content ? 'image_url' OR b.content ? 'image_alt');
-- ============================================================
