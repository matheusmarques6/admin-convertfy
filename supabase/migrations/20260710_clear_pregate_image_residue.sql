-- 20260710_clear_pregate_image_residue.sql
--
-- One-shot cleanup: remove residuo de imagens-fantasma e HTML/qa_issues
-- de fase 2 anterior em todas as lojas cuja IDENTIDADE VISUAL ainda nao
-- foi confirmada (last_version.confirmed_at IS NULL, ou store sem row
-- em store_brand_identity).
--
-- Contexto: antes da migration de brand-gate (20260626*), a fase 2
-- (rendering + QA) rodava antes do designer confirmar a identidade.
-- Resultado: emails-fantasma com html e image_url renderizados com
-- brand placeholder. Mesmo apos a migration, esses artefatos persistem
-- em email_blocks.content (image_url/image_alt/image_last_*) e em
-- email_flow_emails (html/qa_issues/timers/failure_reason).
--
-- Esta migration limpa esses artefatos APENAS pra lojas sem confirmed_at.
-- O fix do webhook (route.ts/email-copy-webhook.service.ts) cobre o
-- futuro: cada nova copy zera o estado da fase 2 antes de aplicar.
--
-- Idempotente: pode rodar n vezes sem efeito colateral. Nao toca lojas
-- com identidade ja confirmada (confirmed_at IS NOT NULL).

BEGIN;

-- Desativa triggers (e.g. fn_log_email_status_change) durante o cleanup
-- pra nao poluir o audit log com falsos "transicoes" — a row nao muda
-- de status aqui, so limpa colunas de artefato.
SET LOCAL session_replication_role = 'replica';

-- 1) Cleanup de email_blocks.content (image_url/image_alt/image_last_*)
WITH stores_no_brand AS (
  SELECT s.id AS store_id
  FROM client_stores s
  LEFT JOIN LATERAL (
    SELECT confirmed_at
    FROM store_brand_identity
    WHERE store_id = s.id
    ORDER BY version DESC
    LIMIT 1
  ) bi ON TRUE
  WHERE bi.confirmed_at IS NULL
),
target_blocks AS (
  SELECT b.id
  FROM email_blocks b
  JOIN email_flow_emails e ON e.id = b.email_id
  JOIN email_flows       f ON f.id = e.flow_id
  WHERE f.store_id IN (SELECT store_id FROM stores_no_brand)
    AND (
      b.content ? 'image_url'
      OR b.content ? 'image_alt'
      OR b.content ? 'image_last_generated_at'
      OR b.content ? 'image_last_prompt'
    )
)
UPDATE email_blocks
SET content = content
              - 'image_url'
              - 'image_alt'
              - 'image_last_generated_at'
              - 'image_last_prompt'
WHERE id IN (SELECT id FROM target_blocks);

-- 2) Cleanup de email_flow_emails (html, qa_issues, timers, failure_reason)
WITH stores_no_brand AS (
  SELECT s.id AS store_id
  FROM client_stores s
  LEFT JOIN LATERAL (
    SELECT confirmed_at
    FROM store_brand_identity
    WHERE store_id = s.id
    ORDER BY version DESC
    LIMIT 1
  ) bi ON TRUE
  WHERE bi.confirmed_at IS NULL
)
UPDATE email_flow_emails e
SET html                  = NULL,
    qa_issues             = '[]'::jsonb,
    failure_reason        = NULL,
    rendering_started_at  = NULL,
    qa_started_at         = NULL
FROM email_flows f
WHERE f.id = e.flow_id
  AND f.store_id IN (SELECT store_id FROM stores_no_brand)
  AND (
    e.html IS NOT NULL
    OR e.qa_issues <> '[]'::jsonb
    OR e.failure_reason IS NOT NULL
    OR e.rendering_started_at IS NOT NULL
    OR e.qa_started_at IS NOT NULL
  );

COMMIT;

-- ----------------------------------------------------------------------------
-- Verificacao manual (esperado: 0 linhas):
--
-- SELECT b.email_id, b.position
-- FROM email_blocks b
-- JOIN email_flow_emails e ON e.id = b.email_id
-- JOIN email_flows       f ON f.id = e.flow_id
-- LEFT JOIN LATERAL (
--   SELECT confirmed_at FROM store_brand_identity
--    WHERE store_id = f.store_id ORDER BY version DESC LIMIT 1
-- ) bi ON TRUE
-- WHERE bi.confirmed_at IS NULL
--   AND (b.content ? 'image_url' OR b.content ? 'image_alt');
-- ----------------------------------------------------------------------------
