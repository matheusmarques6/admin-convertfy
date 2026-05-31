-- ============================================================
-- Epic AE - Story AE-21: Backfill brand identity confirmation
--
-- Story: AE-21 (ÚLTIMA do épico AE Pipeline Split)
-- Plan : /root/.claude/plans/muito-bom-agora-vamos-playful-marble.md
--
-- Contexto:
--   AE-18 introduziu `store_brand_identity.confirmed_at / confirmed_by`
--   como GATE 2 do pipeline. Toda brand identity criada antes da
--   migration nasceu com confirmed_at = NULL e, sem este backfill, ficaria
--   "presa" sem nunca disparar a fase 2 do pipeline AE (image + html + QA).
--
-- Decisão do plano (Pendências P4):
--   - source IN ('manual','edited') → considera retroativamente CONFIRMADA
--     (criação manual ou edição humana indica que designer já validou).
--   - source = 'ai_capture' → permanece NULL (sem edição humana).
--     Designer precisa abrir a brand identity e clicar confirmar
--     manualmente antes de a fase 2 disparar.
--
-- Como confirmar:
--   confirmed_at ← COALESCE(confirmed_at, created_at)  (preserva NOT NULL)
--   confirmed_by ← COALESCE(confirmed_by, created_by)
--
-- ATENÇÃO — risco de flood de triggers (AE-18 review):
--   `trg_brand_identity_confirmed` (AE-18 + AE-19) dispara quando
--   confirmed_at transita de NULL → NOT NULL e ENFILEIRA UM SINAL 'render'
--   por linha em email_generation_queue_signals. Sem proteção, um backfill
--   massivo gera N sinais → o cron dispatcher tentaria rodar fase 2 pra
--   TODAS as lojas legadas simultaneamente (flood).
--
--   Solução: `SET LOCAL session_replication_role = 'replica'` desativa
--   os triggers de aplicação SOMENTE para esta transação (replica mode
--   só executa triggers marcados com ENABLE ALWAYS/REPLICA — os nossos
--   são default e ficam silenciosos).
--
-- IDs:
--   `created_by` referencia profiles(id); `confirmed_by` referencia
--   auth.users(id). Como profiles.id REFERENCES auth.users(id) (1:1),
--   o UUID coincide e é seguro reaproveitar.
--
-- Migration TOTALMENTE idempotente (filtro `confirmed_at IS NULL` +
-- COALESCE em ambos campos garantem que rodar 2x é no-op).
-- ============================================================

BEGIN;

-- ── Desabilita triggers de aplicação durante o backfill ────
-- Evita que `trg_brand_identity_confirmed` enfileire 1 sinal 'render'
-- por linha atualizada (flood do cron dispatcher AE-19).
-- session_replication_role='replica' pula triggers que não estão
-- explicitamente marcados com ENABLE ALWAYS/REPLICA — todos os
-- nossos são default. Escopo `SET LOCAL` = só esta transação.
SET LOCAL session_replication_role = 'replica';

-- ── Backfill propriamente dito ─────────────────────────────
-- Filtros:
--   - confirmed_at IS NULL  → idempotente (não toca rows já confirmadas).
--   - source IN ('manual','edited') → escopo seguro (rows com edição humana).
-- COALESCE em ambos campos blinda contra race: se outra transação
-- confirmar entre o filtro e o UPDATE, o valor previamente confirmado
-- vence (sem regressão).
UPDATE store_brand_identity
   SET confirmed_at = COALESCE(confirmed_at, created_at),
       confirmed_by = COALESCE(confirmed_by, created_by)
 WHERE confirmed_at IS NULL
   AND source IN ('manual', 'edited');

-- ── Restaura modo origin ───────────────────────────────────
-- Explicitamente volta pro default ANTES do COMMIT (SET LOCAL já
-- limita o escopo à transação, mas deixar explícito ajuda audit
-- de quem ler o SQL).
SET LOCAL session_replication_role = 'origin';

COMMIT;

-- ============================================================
-- Pós-backfill (esperado):
--
--   SELECT source,
--          COUNT(*) FILTER (WHERE confirmed_at IS NOT NULL) AS confirmed,
--          COUNT(*) FILTER (WHERE confirmed_at IS NULL)     AS pending,
--          COUNT(*) AS total
--     FROM store_brand_identity
--     GROUP BY source;
--
--   source='manual' → confirmed=total  (backfill aplicado)
--   source='edited' → confirmed=total  (backfill aplicado)
--   source='ai_capture' → pending=total (designer revisa caso a caso)
--
-- O trigger NÃO disparou durante este backfill, então NÃO há sinais
-- 'render' pendentes na fila. Lojas backfilladas que tinham emails
-- em `copy_ready` precisam ser re-disparadas manualmente via:
--
--   - UI: botão "Re-renderizar tudo" (AE-20) em /admin/stores/[id]/producao
--   - SQL: INSERT manual em email_generation_queue_signals
--     com signal_type='render' (caso queira lote pré-AE-20 UI)
-- ============================================================
