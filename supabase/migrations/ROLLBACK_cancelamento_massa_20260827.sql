-- ============================================================================
-- ROLLBACK do cancelamento em massa de 27/08/2026 (NAO e uma migration)
-- ============================================================================
-- Contexto: 530 emails apareciam como "Em andamento..." no Estudio de Agentes
-- ha ate 95 dias, sem nenhum processo rodando. Dois casos distintos:
--
--   333 em `copy_ready`  -> copy gerada e paga, travada no GATE 2 do watchdog
--                           (`getConfirmedBrandStoreIds`): as 11 lojas nao
--                           tinham NENHUM registro em `store_brand_identity`,
--                           entao o cron pulava em silencio a cada 5 min e
--                           `copy_ready_dispatch_attempts` ficava em 0 — nunca
--                           chegava ao cap de `stale_copy_ready_exhausted`.
--
--   197 em `in_progress` -> status de SEED (`flow-seed.service.ts` cria os
--                           emails do flow ja com esse valor). 186 sem nenhuma
--                           run: semeados e nunca gerados.
--
-- Acao aplicada: status = 'failed' com failure_reason codificando o estado
-- anterior, para que este rollback seja exato sem depender de lista de IDs.
--
-- NADA foi apagado: a copy segue em `email_blocks`, `copy_ready_at` e as runs
-- em `email_generation_runs` estao intactos. Reverter e voltar ao limbo.
-- ============================================================================

BEGIN;

-- 333 emails com a copy pronta -> volta para copy_ready
UPDATE email_flow_emails
SET status = 'copy_ready',
    failure_reason = NULL,
    failed_at = NULL,
    updated_at = now()
WHERE failure_reason = 'cancelado_com_copy_pronta';

-- 197 emails nunca iniciados -> volta para in_progress (status de seed)
UPDATE email_flow_emails
SET status = 'in_progress',
    failure_reason = NULL,
    failed_at = NULL,
    updated_at = now()
WHERE failure_reason = 'cancelado_sem_iniciar';

COMMIT;

-- Conferencia:
-- SELECT status, count(*) FROM email_flow_emails
-- WHERE status IN ('copy_ready','in_progress') GROUP BY status;
-- Esperado: copy_ready = 333, in_progress = 197
